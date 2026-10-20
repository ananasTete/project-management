import type { CellValue, TableColumn, TableRow } from "@stack/shared";
import { useMemo } from "react";
import { getColumnWidth } from "../lib/columns";

/**
 * schema → TanStack 列模型适配层：列定义转换 + 按 id 查询 + 单元格取值。
 * rowById 用 Map 承载——清空选中区等批量操作按行 id 反复查值，
 * data.find 会在行列双循环里退化成 O(rows² × cols)。
 */
export function useTableModel(columns: Array<TableColumn>, data: Array<TableRow>) {
  /** TanStack 列定义：width 映射为官方 size（渲染宽度的唯一口径，冻结偏移按它累加） */
  const tanstackColumns = useMemo(
    () =>
      columns.map((column) => ({
        id: column.id,
        accessorFn: (row: TableRow) => row.values[column.id] as CellValue | undefined,
        header: column.name,
        size: getColumnWidth(column),
      })),
    [columns],
  );

  const columnById = useMemo(
    () => new Map(columns.map((column) => [column.id, column])),
    [columns],
  );

  const rowById = useMemo(() => new Map(data.map((row) => [row.id, row])), [data]);

  /** 单元格当前值的字符串形态（text 列编辑语义：非字符串一律视为空串） */
  const getCellValueString = (rowId: string, columnId: string): string => {
    const value = rowById.get(rowId)?.values[columnId];
    return typeof value === "string" ? value : "";
  };

  return { tanstackColumns, columnById, getCellValueString };
}
