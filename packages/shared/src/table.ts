import { z } from "zod";

/**
 * 自定义表格域的共享契约：类型 + zod schema + 校验工具。
 * 前端（@stack/web）与后端（@stack/api）共用，保证两端校验与类型一致。
 * 约定：DTO 一律 camelCase，时间为 ISO 字符串，日期列为 "YYYY-MM-DD"。
 */

/* ========== 列类型（固定六种：文本、单选、多选、日期、附件、数字） ========== */

export const COLUMN_TYPES = [
  "text",
  "singleSelect",
  "multiSelect",
  "date",
  "attachment",
  "number",
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

export const columnTypeSchema = z.enum(COLUMN_TYPES);

/** 单选/多选类型才允许携带 options */
export const SELECT_COLUMN_TYPES = ["singleSelect", "multiSelect"] as const;

/* ========== 选项色板（token 制） ========== */
/**
 * 只存语义名（如 "blue"），不存任意色值：
 * 合法 token 清单以本数组为唯一真源，后端仅校验枚举，
 * 色值与样式只存在于前端渲染层（features/views/table/palette.ts）。
 */
export const OPTION_COLOR_TOKENS = [
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "rose",
] as const;

export type OptionColorToken = (typeof OPTION_COLOR_TOKENS)[number];

export const optionColorSchema = z.enum(OPTION_COLOR_TOKENS);

/* ========== 单选/多选选项 ========== */

export const selectOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  color: optionColorSchema.optional(),
});

export type SelectOption = z.infer<typeof selectOptionSchema>;

/* ========== 附件 ========== */

export const attachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  url: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

/* ========== 单元格取值 ========== */

const cellValueSchema = z.union([
  z.string(),
  z.number(),
  z.array(z.string()),
  z.array(attachmentSchema),
]);

export type CellValue = string | number | Array<string> | Array<Attachment>;

/** 各列类型的取值类型（TS 精确映射；运行时仍是按列 id 的 values 字典） */
export interface ColumnTypeValueMap {
  text: string;
  number: number;
  date: string;
  singleSelect: string;
  multiSelect: Array<string>;
  attachment: Array<Attachment>;
}

export type CellValueOf<T extends ColumnType> = ColumnTypeValueMap[T];

export const DATE_VALUE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/* ========== 行高档位（表级设置） ========== */

/**
 * 单元格固定行高的四档设置：low/medium/high/max 分别对应文本可见 1/2/3/4 行。
 * 档位到像素的换算属于前端渲染层职责（features/views/table），契约层只锁定枚举。
 */
export const ROW_HEIGHTS = ["low", "medium", "high", "max"] as const;

export type RowHeight = (typeof ROW_HEIGHTS)[number];

export const rowHeightSchema = z.enum(ROW_HEIGHTS);

/* ========== DTO：表元信息 / 列 / 行 ========== */

export const tableMetaSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string(),
  createTime: z.string(),
  updateTime: z.string(),
  rowHeight: rowHeightSchema,
});

export type TableMeta = z.infer<typeof tableMetaSchema>;

export const tableColumnSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: columnTypeSchema,
  /** 列宽 px；缺省由 API 落库为 150，前端渲染按类型默认宽兜底 */
  width: z.number().int().positive().optional(),
  /** 冻结标记：该列及其之前所有列冻结在左侧（前缀语义，前端展开） */
  pinned: z.boolean().optional(),
  /** 仅 singleSelect / multiSelect 携带 */
  options: z.array(selectOptionSchema).optional(),
});

export type TableColumn = z.infer<typeof tableColumnSchema>;

export const tableRowSchema = z.object({
  id: z.string(),
  values: z.record(z.string(), cellValueSchema),
});

export type TableRow = z.infer<typeof tableRowSchema>;

/** 表详情快照：GET /api/tables/:tableId 的响应形状 */
export interface TableSnapshot {
  table: TableMeta;
  columns: Array<TableColumn>;
  rows: Array<TableRow>;
}

/** 行列表（cursor 滚动加载）：GET /api/tables/:tableId/rows 的响应形状 */
export interface RowPage {
  items: Array<TableRow>;
  /** 还有更多行时为最后一条的游标（position:id 的 base64url），耗尽为 null */
  nextCursor: string | null;
}

/* ========== API 请求 schema ========== */

const rowValuesSchema = z.record(z.string(), cellValueSchema);

export const createColumnSchema = z.object({
  name: z.string().min(1),
  type: columnTypeSchema,
  width: z.number().int().positive().optional(),
  pinned: z.boolean().optional(),
  options: z.array(selectOptionSchema).optional(),
  /** 缺省追加到末尾（服务端按 max(position)+10 分配） */
  position: z.number().int().optional(),
});

export const updateColumnSchema = z
  .object({
    name: z.string().min(1).optional(),
    /** 显式接收以便服务端拒绝修改（而非被 zod 静默剥离） */
    type: columnTypeSchema.optional(),
    width: z.number().int().positive().optional(),
    options: z.array(selectOptionSchema).optional(),
    position: z.number().int().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "至少提供一个字段" });

/**
 * 冻结边界更新（PATCH /api/tables/:tableId/columns/pinning）：
 * pinnedThrough = 某列 id 表示"冻结到该列（含）及其之前所有列"；null 表示全部解冻。
 * 前缀不变量由该端点独占维护——通用列 PATCH 不再接受 pinned 字段。
 */
export const updateColumnPinningSchema = z.object({
  pinnedThrough: z.string().nullable(),
});

/** pinning 端点响应：按 position 排序的全量列，客户端直接替换本地状态 */
export interface ColumnPinningUpdateResult {
  columns: Array<TableColumn>;
}

export const createTableSchema = z.object({
  name: z.string().min(1),
  desc: z.string().optional(),
  /** 初始行高档位；缺省 low */
  rowHeight: rowHeightSchema.optional(),
  /** 初始列（位置按数组顺序落库）；缺省时服务端默认创建一个「文本」文本列 */
  columns: z.array(createColumnSchema).optional(),
  /** 初始行（values 按初始列校验）；缺省时服务端默认创建 5 行空行 */
  rows: z.array(z.object({ values: rowValuesSchema })).optional(),
});

export const updateTableSchema = z
  .object({
    name: z.string().min(1).optional(),
    desc: z.string().optional(),
    rowHeight: rowHeightSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "至少提供一个字段" });

export const createRowSchema = z.object({
  values: rowValuesSchema,
  /** 插入到该行（position 紧随其后）之后；缺省追加到表末尾 */
  afterRowId: z.uuid().optional(),
});

export const updateRowSchema = z.object({
  /** 浅合并：只覆盖传入的 key */
  values: rowValuesSchema,
});

/* ========== 校验工具 ========== */

/**
 * 按列 schema 校验一行 values（纯函数，前后端通用）。
 * 返回错误信息数组，空数组即通过；缺 key 视为空值，不报错。
 */
export function validateRowValues(
  columns: Array<Pick<TableColumn, "id" | "name" | "type" | "options">>,
  values: Record<string, CellValue>,
): Array<string> {
  const errors: Array<string> = [];
  const columnById = new Map(columns.map((column) => [column.id, column]));

  for (const [key, value] of Object.entries(values)) {
    const column = columnById.get(key);
    if (!column) {
      errors.push(`未知列 id：${key}`);
      continue;
    }
    switch (column.type) {
      case "text":
        if (typeof value !== "string") {
          errors.push(`列「${column.name}」应为文本`);
        }
        break;
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) {
          errors.push(`列「${column.name}」应为数字`);
        }
        break;
      case "date":
        if (typeof value !== "string" || !DATE_VALUE_REGEX.test(value)) {
          errors.push(`列「${column.name}」应为 YYYY-MM-DD 格式日期`);
        }
        break;
      case "singleSelect":
        if (
          typeof value !== "string" ||
          !column.options?.some((option) => option.id === value)
        ) {
          errors.push(`列「${column.name}」的值必须是该列选项的 id`);
        }
        break;
      case "multiSelect": {
        const ids =
          Array.isArray(value) && value.every((item) => typeof item === "string")
            ? (value as Array<string>)
            : null;
        const invalid =
          ids === null ||
          new Set(ids).size !== ids.length ||
          !ids.every((id) => column.options?.some((option) => option.id === id));
        if (invalid) {
          errors.push(`列「${column.name}」的值必须是该列选项 id 的去重数组`);
        }
        break;
      }
      case "attachment":
        if (
          !Array.isArray(value) ||
          value.some((item) => !attachmentSchema.safeParse(item).success)
        ) {
          errors.push(`列「${column.name}」应为附件数组`);
        }
        break;
    }
  }
  return errors;
}

/**
 * 校验列定义自身（新建/更新共用）：options 只允许 select 类列，选项 id 不可重复。
 * 返回错误信息数组，空数组即通过。
 */
export function validateColumnOptions(
  column: Pick<TableColumn, "name" | "type" | "options">,
): Array<string> {
  const errors: Array<string> = [];
  const isSelect = (SELECT_COLUMN_TYPES as readonly string[]).includes(column.type);
  if (column.options && !isSelect) {
    errors.push(`列「${column.name}」类型 ${column.type} 不支持选项配置`);
  }
  if (column.options) {
    const ids = column.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length) {
      errors.push(`列「${column.name}」的选项 id 重复`);
    }
  }
  return errors;
}
