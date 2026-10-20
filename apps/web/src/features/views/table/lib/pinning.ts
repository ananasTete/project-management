import type { TableColumn } from "@stack/shared";
import type { Column, RowData } from "@tanstack/react-table";
import type { CSSProperties } from "react";
import type { TableFeatures } from "./features";

/**
 * 层级阶梯（全模块唯一事实点，样式函数与叶子组件共用）：
 * 非冻结 cell 0 < 冻结 cell 1 < 表头 2 < 冻结列表头 3 < 编辑中 cell 4。
 * 表头必须严格高于冻结 cell——同级时按 DOM 顺序绘制，tbody 在后会盖住表头；
 * 编辑中的 cell 提层级到表头之上，否则向下长高的编辑器滚到表头下方时会被表头盖住。
 */
export const Z_INDEX = {
  cell: 0,
  pinnedCell: 1,
  header: 2,
  pinnedHeader: 3,
  editingCell: 4,
} as const;

/**
 * 末位冻结列的右缘阴影（横向滚动后显示）。
 * 用 inline boxShadow 值而非 Tailwind class：选中描边也是 inline boxShadow，
 * 同元素上 inline 会整体覆盖 class——两者必须合成到同一条声明（见 table-cell.tsx）。
 */
export const PINNING_EDGE_SHADOW = "6px 0 8px -6px var(--border)";

/**
 * sticky 定位、getStart 计算当前列到左边缘的偏移量获取正确位置，来实现冻结列。
 *
 * getStart 计算的是 column 配置的宽度相加，所以每列实际渲染宽度必须严格等于它的 size，否则偏移就错位。为了实现这一点：
 * 1. table-layout: fixed：表格列宽只由表头行声明的宽度决定，不看单元格内容。
 * 2. 配合上个属性，为 tr > th 设置：width: column.getSize()，列宽由 column 决定（见 table-header-cell.tsx）。
 * 3. table width: table.getTotalSize()：getTotalSize() 是所有列 size 之和。表格总宽 = 各列 size 之和，配合 fixed 布局，每列正好分到自己的 size 像素（见 table.tsx）。
 */
export function getCommonPinningStyles<TData extends RowData>(
  column: Column<TableFeatures, TData>,
): {
  isPinned: boolean;
  isLastLeftPinned: boolean;
  style: CSSProperties;
} {
  const isPinned = column.getIsPinned() === "start"; // 由 column 判断是否为左侧的冻结列
  const isLastLeftPinned = isPinned && column.getIsLastColumn("start"); // 是否是左侧冻结列的最后一个

  return {
    isPinned,
    isLastLeftPinned,
    style: {
      left: isPinned ? `${column.getStart("start")}px` : undefined,
      position: isPinned ? "sticky" : "relative",
      zIndex: isPinned ? Z_INDEX.pinnedCell : Z_INDEX.cell,
    },
  };
}

/**
 * pinned 前缀展开：最后一个 pinned 列及其之前的所有列 id（多列标记以最靠后的为准）。
 * shared 契约里 pinned 是前缀语义（该列及其之前所有列冻结），pinning/选中 API
 * 需要的是完整的 id 列表，空数组 = 全部解冻。
 */
export function getPinnedPrefix(columns: Array<TableColumn>): Array<string> {
  let lastPinnedIndex = -1;
  columns.forEach((column, index) => {
    if (column.pinned) {
      lastPinnedIndex = index;
    }
  });
  return columns.slice(0, lastPinnedIndex + 1).map((column) => column.id);
}
