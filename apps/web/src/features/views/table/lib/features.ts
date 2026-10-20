import type { TableRow } from "@stack/shared";
import type { ReactTable } from "@tanstack/react-table";
import {
  cellSelectionFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  tableFeatures,
} from "@tanstack/react-table";

/**
 * 声明表使用哪些表功能（启用摇树优化，以便只打包实际使用的功能）
 * 与官方 column-pinning-sticky 示例一致的特性集：
 * columnPinning 提供列冻结状态与 API（getIsPinned/getStart 等）；
 * columnSizing 提供列宽体系（getSize/getTotalSize），冻结偏移按列宽累加计算；
 * columnOrdering 提供 getIsLastColumn/getIsFirstColumn（判断末位冻结列）；
 * columnVisibility 提供 row.getVisibleCells（按可见列取单元格）；
 * columnResizing 依赖 sizing，当前未开启列宽拖拽，注册以便后续接入；
 * cellSelection 提供单元格选中态（v9 新增，官方 spreadsheet 示例同款）。
 * 官方约束：tableFeatures 必须在组件外静态调用，保证引用稳定——本文件即模块级。
 */
export const features = tableFeatures({
  cellSelectionFeature,
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
});

/** 特性集类型：本模块所有 Column/Header/Cell 泛型参数的统一缩写 */
export type TableFeatures = typeof features;

/** 本模块的 table 实例类型（hooks 与叶子组件的公共参数类型） */
export type TableInstance = ReactTable<TableFeatures, TableRow>;
