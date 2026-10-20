import type { Cell, RowData } from "@tanstack/react-table";
import type { TableFeatures } from "./features";

/**
 * 选中格的描边样式（官方 cell-selection 套路）：
 * 焦点格整圈 2px 描边；选中的非焦点格只在与未选中单元格相邻的边画线
 * （getSelectionEdges），多格并集自然形成一条连续外轮廓。
 * 返回 boxShadow 值字符串而非完整 style——选中描边要与冻结列阴影
 * 合成到同一条 inline boxShadow 上，避免互相覆盖（拼接见 table-cell.tsx）。
 * 必须用 inset box-shadow 而非加粗 border——border 参与布局，会撑动固定行高。
 * 选中视觉只用 blue-500 描边（无底色），
 * 与编辑态定位框（cell-editor 的 inset-ring-2 inset-ring-blue-500）同色。
 */
export function getSelectionBoxShadow<TData extends RowData>(
  cell: Cell<TableFeatures, TData>,
): string | undefined {
  if (cell.getIsFocused()) {
    return "inset 0 0 0 2px var(--color-blue-500)";
  }
  if (!cell.getIsSelected()) {
    return undefined;
  }
  const edges = cell.getSelectionEdges();
  const shadows: Array<string> = [];
  if (edges.top) {
    shadows.push("inset 0 2px 0 0 var(--color-blue-500)");
  }
  if (edges.right) {
    shadows.push("inset -2px 0 0 0 var(--color-blue-500)");
  }
  if (edges.bottom) {
    shadows.push("inset 0 -2px 0 0 var(--color-blue-500)");
  }
  if (edges.left) {
    shadows.push("inset 2px 0 0 0 var(--color-blue-500)");
  }
  return shadows.length > 0 ? shadows.join(", ") : undefined;
}
