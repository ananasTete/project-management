import type {
  CellValue,
  ColumnPinningUpdateResult,
  RowHeight,
  TableMeta,
  TableRow,
  TableSnapshot,
} from "@stack/shared";
import axios from "axios";

import { api } from "#/lib/axios";

/** 自定义表格 REST（/api/tables）：DTO 均为 @stack/shared 契约（camelCase、ISO 时间串） */

interface ApiErrorBody {
  code?: string;
  message?: string;
}

/** 从 API 错误里取用户可读文案；未知错误不瞎猜原因，展示服务端信息 */
export function apiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    if (body?.message) {
      return body.message;
    }
  }
  return "请求失败，请稍后重试";
}

/** 当前用户的表格列表（按最近更新排序） */
export function fetchTables(): Promise<Array<TableMeta>> {
  return api.get<unknown, Array<TableMeta>>("/api/tables");
}

/** 表详情快照：{table, columns, rows} 一次拿全 */
export function fetchTableSnapshot(tableId: string): Promise<TableSnapshot> {
  return api.get<unknown, TableSnapshot>(`/api/tables/${tableId}`);
}

export function createTable(name: string): Promise<TableMeta> {
  return api.post<unknown, TableMeta>("/api/tables", { name });
}

export function renameTable(tableId: string, name: string): Promise<TableMeta> {
  return api.patch<unknown, TableMeta>(`/api/tables/${tableId}`, { name });
}

/** 更新行高档位（表级设置：low/medium/high/max） */
export function updateTableRowHeight(
  tableId: string,
  rowHeight: RowHeight,
): Promise<TableMeta> {
  return api.patch<unknown, TableMeta>(`/api/tables/${tableId}`, { rowHeight });
}

export function deleteTable(tableId: string): Promise<void> {
  return api.delete<unknown, void>(`/api/tables/${tableId}`);
}

/** 冻结边界更新：pinnedThrough = 末位冻结列 id；null = 全部解冻。响应为全量列 */
export function updateColumnPinning(
  tableId: string,
  pinnedThrough: string | null,
): Promise<ColumnPinningUpdateResult> {
  return api.patch<unknown, ColumnPinningUpdateResult>(
    `/api/tables/${tableId}/columns/pinning`,
    { pinnedThrough },
  );
}

/** 新建行：afterRowId = 插入到该行之后，缺省追加到表末尾 */
export function createTableRow(tableId: string, afterRowId?: string): Promise<TableRow> {
  return api.post<unknown, TableRow>(`/api/tables/${tableId}/rows`, {
    values: {},
    ...(afterRowId !== undefined ? { afterRowId } : {}),
  });
}

/** 更新行单元格值（浅合并：只覆盖传入的 key），响应为服务端权威行 */
export function updateRowValues(
  tableId: string,
  rowId: string,
  values: Record<string, CellValue>,
): Promise<TableRow> {
  return api.patch<unknown, TableRow>(`/api/tables/${tableId}/rows/${rowId}`, { values });
}
