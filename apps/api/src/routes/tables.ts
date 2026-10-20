import { dataTable, dataTableColumn, dataTableRow } from "@stack/db/schema";
import {
  type CellValue,
  createColumnSchema,
  createRowSchema,
  createTableSchema,
  type TableColumn,
  type TableMeta,
  type TableRow,
  updateColumnPinningSchema,
  updateColumnSchema,
  updateRowSchema,
  updateTableSchema,
  validateColumnOptions,
  validateRowValues,
} from "@stack/shared";
import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Session } from "../auth";
import { db } from "../db";

/**
 * 自定义表格 CRUD（/api/tables，挂在 session 中间件之后）。
 * 归属：v1 以 created_by 判定（非本人 403）。
 * 校验：结构校验用 @stack/shared 的 zod schema；行 values 与列 options
 * 的语义校验用 shared 的纯函数（前后端同一套规则）。
 */

class ApiError extends Error {
  constructor(
    /** hono 的 c.json 第二参要求字面量状态码联合，收窄避免重载不匹配 */
    public status: 400 | 403 | 404,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const tablesRoutes = new Hono<{ Variables: { session: Session } }>();

tablesRoutes.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ code: err.code, message: err.message }, err.status);
  }
  throw err;
});

/* ========== 工具 ========== */

const uuidSchema = z.uuid();

async function parseBody<S extends z.ZodType>(
  req: { json(): Promise<unknown> },
  schema: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "VALIDATION_ERROR", "请求体必须是合法 JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("；");
    throw new ApiError(400, "VALIDATION_ERROR", message || "参数校验失败");
  }
  return parsed.data;
}

/** 校验路径参数是 uuid（避免直接把非法 id 打进 PG 报 22P02） */
function parseUuid(value: string, label: string): string {
  if (!uuidSchema.safeParse(value).success) {
    throw new ApiError(404, "NOT_FOUND", `${label}不存在`);
  }
  return value;
}

async function requireOwnedTable(tableId: string, userId: string) {
  const [table] = await db.select().from(dataTable).where(eq(dataTable.id, tableId));
  if (!table) {
    throw new ApiError(404, "NOT_FOUND", "表格不存在");
  }
  if (table.createdBy !== userId) {
    throw new ApiError(403, "FORBIDDEN", "无权访问该表格");
  }
  return table;
}

/** 末位 position + 10（建列/建行默认追加；间隔 10 为拖拽排序留余地） */
async function nextPosition(tableId: string, kind: "column" | "row"): Promise<number> {
  const table = kind === "column" ? dataTableColumn : dataTableRow;
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${table.position}), 0)` })
    .from(table)
    .where(eq(table.tableId, tableId));
  return (row?.max ?? 0) + 10;
}

async function loadTableColumns(tableId: string): Promise<Array<TableColumn>> {
  const columns = await db
    .select()
    .from(dataTableColumn)
    .where(eq(dataTableColumn.tableId, tableId))
    .orderBy(asc(dataTableColumn.position));
  return columns.map(toTableColumn);
}

function assertRowValues(
  columns: Array<TableColumn>,
  values: Record<string, unknown>,
): void {
  const errors = validateRowValues(columns, values as Record<string, CellValue>);
  if (errors.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", errors.join("；"));
  }
}

/* ========== 序列化（DB 行 → DTO，camelCase 对齐前端契约） ========== */

function toTableMeta(table: typeof dataTable.$inferSelect): TableMeta {
  return {
    id: table.id,
    name: table.name,
    desc: table.description,
    createTime: table.createdAt.toISOString(),
    updateTime: table.updatedAt.toISOString(),
    rowHeight: table.rowHeight,
  };
}

function toTableColumn(column: typeof dataTableColumn.$inferSelect): TableColumn {
  return {
    id: column.id,
    name: column.name,
    type: column.type,
    width: column.width,
    pinned: column.pinned,
    ...(column.options ? { options: column.options } : {}),
  };
}

function toTableRow(row: typeof dataTableRow.$inferSelect): TableRow {
  return { id: row.id, values: row.values ?? {} };
}

/* ========== cursor 编解码（position:id → base64url） ========== */

function encodeCursor(row: { position: number; id: string }): string {
  return Buffer.from(`${row.position}:${row.id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { position: number; id: string } {
  const [position, id] = Buffer.from(cursor, "base64url").toString("utf8").split(":");
  const parsed = Number(position);
  if (!Number.isInteger(parsed) || !uuidSchema.safeParse(id ?? "").success) {
    throw new ApiError(400, "VALIDATION_ERROR", "游标不合法");
  }
  return { position: parsed, id };
}

/* ========== 表格 ========== */

/** 新表默认初始内容：一个「文本」文本列 + 5 行空行（调用方未显式传 columns/rows 时生效） */
const DEFAULT_INITIAL_COLUMNS: Array<z.input<typeof createColumnSchema>> = [
  { name: "文本", type: "text" },
];
const DEFAULT_INITIAL_ROWS: Array<{ values: Record<string, CellValue> }> = Array.from(
  { length: 5 },
  () => ({ values: {} }),
);

tablesRoutes.get("/", async (c) => {
  const userId = c.get("session").user.id;
  const tables = await db
    .select()
    .from(dataTable)
    .where(eq(dataTable.createdBy, userId))
    .orderBy(desc(dataTable.updatedAt));
  return c.json(tables.map(toTableMeta));
});

tablesRoutes.post("/", async (c) => {
  const userId = c.get("session").user.id;
  const body = await parseBody(c.req, createTableSchema);

  const table = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(dataTable)
      .values({
        name: body.name,
        description: body.desc ?? "",
        rowHeight: body.rowHeight ?? "low",
        createdBy: userId,
      })
      .returning();

    const initialColumns = body.columns?.length ? body.columns : DEFAULT_INITIAL_COLUMNS;
    const initialRows = body.rows?.length ? body.rows : DEFAULT_INITIAL_ROWS;

    let columns: Array<TableColumn> = [];
    {
      for (const column of initialColumns) {
        const errors = validateColumnOptions(column);
        if (errors.length > 0) {
          throw new ApiError(400, "VALIDATION_ERROR", errors.join("；"));
        }
      }
      // pinned 前缀归一化：以最后一个 pinned 列为边界，之前的列全部视为冻结
      let lastPinnedIndex = -1;
      initialColumns.forEach((column, index) => {
        if (column.pinned) {
          lastPinnedIndex = index;
        }
      });
      const inserted = await tx
        .insert(dataTableColumn)
        .values(
          initialColumns.map((column, index) => ({
            tableId: created.id,
            name: column.name,
            type: column.type,
            width: column.width ?? 150,
            pinned: index <= lastPinnedIndex,
            position: (index + 1) * 10,
            options: column.options ?? null,
          })),
        )
        .returning();
      columns = inserted.map(toTableColumn);
    }

    {
      const rowErrors = initialRows.flatMap((row, index) =>
        validateRowValues(columns, row.values).map(
          (error) => `第 ${index + 1} 行：${error}`,
        ),
      );
      if (rowErrors.length > 0) {
        throw new ApiError(400, "VALIDATION_ERROR", rowErrors.join("；"));
      }
      await tx.insert(dataTableRow).values(
        initialRows.map((row, index) => ({
          tableId: created.id,
          position: (index + 1) * 10,
          values: row.values,
        })),
      );
    }

    return created;
  });

  return c.json(toTableMeta(table), 201);
});

tablesRoutes.get("/:tableId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  const table = await requireOwnedTable(tableId, c.get("session").user.id);

  const columns = await loadTableColumns(tableId);
  const rows = await db
    .select()
    .from(dataTableRow)
    .where(eq(dataTableRow.tableId, tableId))
    .orderBy(asc(dataTableRow.position), asc(dataTableRow.id));

  return c.json({
    table: toTableMeta(table),
    columns,
    rows: rows.map(toTableRow),
  });
});

tablesRoutes.patch("/:tableId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const body = await parseBody(c.req, updateTableSchema);

  const [updated] = await db
    .update(dataTable)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.desc !== undefined ? { description: body.desc } : {}),
      ...(body.rowHeight !== undefined ? { rowHeight: body.rowHeight } : {}),
    })
    .where(eq(dataTable.id, tableId))
    .returning();

  return c.json(toTableMeta(updated));
});

tablesRoutes.delete("/:tableId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  await db.delete(dataTable).where(eq(dataTable.id, tableId));
  return c.json({ ok: true });
});

/* ========== 列 ========== */

/**
 * 冻结边界更新：pinnedThrough = 目标列 id（冻结到该列及其之前所有列）或 null（全部解冻）。
 * 前缀不变量（pinned 恒为 position 升序下的连续前缀）由本端点独占维护。
 * 注意：必须注册在 PATCH /:tableId/columns/:columnId 之前，避免 "pinning" 被 :columnId 吞掉。
 */
tablesRoutes.patch("/:tableId/columns/pinning", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const body = await parseBody(c.req, updateColumnPinningSchema);

  await db.transaction(async (tx) => {
    const columns = await tx
      .select()
      .from(dataTableColumn)
      .where(eq(dataTableColumn.tableId, tableId))
      .orderBy(asc(dataTableColumn.position));

    let target: (typeof columns)[number] | undefined;
    if (body.pinnedThrough) {
      target = columns.find((column) => column.id === body.pinnedThrough);
      if (!target) {
        throw new ApiError(404, "NOT_FOUND", "列不存在");
      }
    }

    // 只更新状态实际变化的列（pinned !== 期望值）
    const changed = columns.filter((column) => {
      const expected = target ? column.position <= target.position : false;
      return column.pinned !== expected;
    });
    for (const column of changed) {
      await tx
        .update(dataTableColumn)
        .set({ pinned: target ? column.position <= target.position : false })
        .where(eq(dataTableColumn.id, column.id));
    }

    // 冻结属于表级变更，触发表 updated_at
    await tx
      .update(dataTable)
      .set({ updatedAt: new Date() })
      .where(eq(dataTable.id, tableId));
  });

  return c.json({ columns: await loadTableColumns(tableId) });
});

tablesRoutes.post("/:tableId/columns", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const body = await parseBody(c.req, createColumnSchema);

  const errors = validateColumnOptions(body);
  if (errors.length > 0) {
    throw new ApiError(400, "VALIDATION_ERROR", errors.join("；"));
  }

  const [column] = await db
    .insert(dataTableColumn)
    .values({
      tableId,
      name: body.name,
      type: body.type,
      width: body.width ?? 150,
      // pinned = true 语义为"冻结到该列"：之前的列全部一并冻结，保持前缀不变量
      pinned: body.pinned ?? false,
      position: body.position ?? (await nextPosition(tableId, "column")),
      options: body.options ?? null,
    })
    .returning();

  if (body.pinned) {
    await db
      .update(dataTableColumn)
      .set({ pinned: true })
      .where(
        and(
          eq(dataTableColumn.tableId, tableId),
          lt(dataTableColumn.position, column.position),
        ),
      );
  }

  return c.json(toTableColumn(column), 201);
});

tablesRoutes.patch("/:tableId/columns/:columnId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const columnId = parseUuid(c.req.param("columnId"), "列");
  const body = await parseBody(c.req, updateColumnSchema);

  const [existing] = await db
    .select()
    .from(dataTableColumn)
    .where(and(eq(dataTableColumn.id, columnId), eq(dataTableColumn.tableId, tableId)));
  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "列不存在");
  }

  if (body.type !== undefined) {
    throw new ApiError(400, "VALIDATION_ERROR", "列类型创建后不允许修改");
  }
  if (body.options !== undefined) {
    const optionErrors = validateColumnOptions({
      name: existing.name,
      type: existing.type,
      options: body.options,
    });
    if (optionErrors.length > 0) {
      throw new ApiError(400, "VALIDATION_ERROR", optionErrors.join("；"));
    }
  }

  const [updated] = await db
    .update(dataTableColumn)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.width !== undefined ? { width: body.width } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.options !== undefined ? { options: body.options } : {}),
    })
    .where(and(eq(dataTableColumn.id, columnId), eq(dataTableColumn.tableId, tableId)))
    .returning();

  return c.json(toTableColumn(updated));
});

tablesRoutes.delete("/:tableId/columns/:columnId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const columnId = parseUuid(c.req.param("columnId"), "列");

  const [deleted] = await db
    .delete(dataTableColumn)
    .where(and(eq(dataTableColumn.id, columnId), eq(dataTableColumn.tableId, tableId)))
    .returning();
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "列不存在");
  }

  // 清理各行 values 中该列的 key（jsonb 减号操作符），避免脏数据堆积
  await db
    .update(dataTableRow)
    .set({ values: sql`${dataTableRow.values} - ${columnId}` })
    .where(eq(dataTableRow.tableId, tableId));

  return c.json({ ok: true });
});

/* ========== 行 ========== */

tablesRoutes.get("/:tableId/rows", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);

  const query = z
    .object({
      cursor: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .safeParse({
      cursor: c.req.query("cursor"),
      limit: c.req.query("limit") ?? undefined,
    });
  if (!query.success) {
    throw new ApiError(400, "VALIDATION_ERROR", "分页参数不合法");
  }
  const limit = query.data.limit ?? 50;

  // 稳定排序 (position, id)；游标做元组比较：or() 可能返回 undefined，单独收窄
  const cursorCondition = query.data.cursor
    ? or(
        and(
          eq(dataTableRow.position, decodeCursor(query.data.cursor).position),
          gt(dataTableRow.id, decodeCursor(query.data.cursor).id),
        ),
        gt(dataTableRow.position, decodeCursor(query.data.cursor).position),
      )
    : undefined;

  const rows = await db
    .select()
    .from(dataTableRow)
    .where(
      cursorCondition
        ? and(eq(dataTableRow.tableId, tableId), cursorCondition)
        : eq(dataTableRow.tableId, tableId),
    )
    .orderBy(asc(dataTableRow.position), asc(dataTableRow.id))
    .limit(limit);

  const nextCursor = rows.length === limit ? encodeCursor(rows[rows.length - 1]) : null;
  return c.json({ items: rows.map(toTableRow), nextCursor });
});

tablesRoutes.post("/:tableId/rows", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const body = await parseBody(c.req, createRowSchema);

  const columns = await loadTableColumns(tableId);
  assertRowValues(columns, body.values);

  const row = await db.transaction(async (tx) => {
    let position: number;
    if (body.afterRowId === undefined) {
      const [agg] = await tx
        .select({ max: sql<number>`coalesce(max(${dataTableRow.position}), 0)` })
        .from(dataTableRow)
        .where(eq(dataTableRow.tableId, tableId));
      position = (agg?.max ?? 0) + 10;
    } else {
      const [anchor] = await tx
        .select()
        .from(dataTableRow)
        .where(
          and(eq(dataTableRow.id, body.afterRowId), eq(dataTableRow.tableId, tableId)),
        );
      if (!anchor) {
        throw new ApiError(404, "NOT_FOUND", "锚点行不存在");
      }
      const [next] = await tx
        .select()
        .from(dataTableRow)
        .where(
          and(
            eq(dataTableRow.tableId, tableId),
            gt(dataTableRow.position, anchor.position),
          ),
        )
        .orderBy(asc(dataTableRow.position))
        .limit(1);
      if (!next) {
        position = anchor.position + 10;
      } else if (next.position - anchor.position >= 2) {
        // 中点插入：与前后行各留整数间隙，尽量推迟重排
        position = anchor.position + Math.floor((next.position - anchor.position) / 2);
      } else {
        // 间隙耗尽：全表按 100 间隔重排后紧随锚点插入。
        // 用 100 而非 10：重排后必须给新行和后续插入留出间隙，10 间隔会立刻再次耗尽
        const allRows = await tx
          .select({ id: dataTableRow.id })
          .from(dataTableRow)
          .where(eq(dataTableRow.tableId, tableId))
          .orderBy(asc(dataTableRow.position), asc(dataTableRow.id));
        for (const [index, row] of allRows.entries()) {
          await tx
            .update(dataTableRow)
            .set({ position: (index + 1) * 100 })
            .where(eq(dataTableRow.id, row.id));
        }
        position = (allRows.findIndex((row) => row.id === anchor.id) + 1) * 100 + 10;
      }
    }

    const [created] = await tx
      .insert(dataTableRow)
      .values({
        tableId,
        position,
        values: body.values,
      })
      .returning();
    return created;
  });

  return c.json(toTableRow(row), 201);
});

tablesRoutes.patch("/:tableId/rows/:rowId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const rowId = parseUuid(c.req.param("rowId"), "行");
  const body = await parseBody(c.req, updateRowSchema);

  const [existing] = await db
    .select()
    .from(dataTableRow)
    .where(and(eq(dataTableRow.id, rowId), eq(dataTableRow.tableId, tableId)));
  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "行不存在");
  }

  // 浅合并：只覆盖传入的 key，合并结果整体校验
  const merged = { ...(existing.values ?? {}), ...body.values };
  const columns = await loadTableColumns(tableId);
  assertRowValues(columns, merged);

  const [updated] = await db
    .update(dataTableRow)
    .set({ values: merged })
    .where(and(eq(dataTableRow.id, rowId), eq(dataTableRow.tableId, tableId)))
    .returning();

  return c.json(toTableRow(updated));
});

tablesRoutes.delete("/:tableId/rows/:rowId", async (c) => {
  const tableId = parseUuid(c.req.param("tableId"), "表格");
  await requireOwnedTable(tableId, c.get("session").user.id);
  const rowId = parseUuid(c.req.param("rowId"), "行");

  const [deleted] = await db
    .delete(dataTableRow)
    .where(and(eq(dataTableRow.id, rowId), eq(dataTableRow.tableId, tableId)))
    .returning();
  if (!deleted) {
    throw new ApiError(404, "NOT_FOUND", "行不存在");
  }

  return c.json({ ok: true });
});
