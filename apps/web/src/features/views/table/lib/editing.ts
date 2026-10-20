/** 提交后的选区移动方向；undefined = 就地提交（选区不动） */
export type CellEditMove = "down" | "left" | "right";

/** 编辑中的单元格定位（官方 spreadsheet 模式：editing 状态在 Table 外部持有） */
export interface EditingCell {
  rowId: string;
  columnId: string;
  initial: string;
}
