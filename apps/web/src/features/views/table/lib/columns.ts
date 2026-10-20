import type { ColumnType, TableColumn } from "@stack/shared";

/** 各列类型的默认宽度（列定义未给 width 时的兜底，px） */
export const DEFAULT_WIDTH_BY_TYPE: Record<ColumnType, number> = {
  text: 260,
  singleSelect: 140,
  multiSelect: 200,
  date: 140,
  attachment: 220,
  number: 120,
};

/**
 * 列的实际渲染宽度：schema width 优先，缺省按类型兜底。
 * 列定义映射（TanStack size）与冻结前缀宽度守卫（use-pinned-columns）共用，
 * 保证两处口径一致——冻结偏移按列宽累加，宽度和渲染宽度必须同源。
 */
export function getColumnWidth(column: TableColumn): number {
  return column.width ?? DEFAULT_WIDTH_BY_TYPE[column.type];
}
