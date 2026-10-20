import type { CellValue, RowHeight, TableColumn, TableRow } from "@stack/shared";
import type { Cell } from "@tanstack/react-table";
import { cn } from "cn";
import type { MouseEvent } from "react";
import type { CellEditMove, EditingCell } from "../lib/editing";
import type { TableFeatures } from "../lib/features";
import { getCommonPinningStyles, PINNING_EDGE_SHADOW, Z_INDEX } from "../lib/pinning";
import { ROW_HEIGHT_SPECS } from "../lib/row-height";
import { getSelectionBoxShadow } from "../lib/selection";
import { CellContent } from "./cell-content";
import { CellEditor } from "./cell-editor";

interface TableCellProps {
  cell: Cell<TableFeatures, TableRow>;
  /** 该列的 schema 定义（决定内容渲染，按 TanStack 列 id 反查） */
  column: TableColumn | undefined;
  /** 行高档位（表级设置） */
  rowHeight: RowHeight;
  /** 横向已滚动（末位冻结列显示右缘阴影） */
  scrolled: boolean;
  /** 编辑状态（null = 无编辑）；命中的 cell 渲染编辑器覆盖层 */
  editingCell: EditingCell | null;
  /** 编排层组合的 mousedown（重点击进编优先、其次选区起点；顺序契约见 table.tsx） */
  onMouseDown: (event: MouseEvent<HTMLTableCellElement>) => void;
  onCommitEditing: (
    rowId: string,
    columnId: string,
    value: string,
    move: CellEditMove | undefined,
  ) => void;
  onCancelEditing: () => void;
}

/**
 * 单元格结构壳：四项特性的渲染交汇点——冻结定位样式、选中描边、行高壳、编辑覆盖层。
 * 描边与冻结阴影合成为单条 inline boxShadow：同元素上 inline 样式会整体覆盖 class，
 * 两者必须拼接在同一声明里（否则选中末位冻结列时冻结阴影会消失）。
 * 描边/阴影均不占布局（inset box-shadow 而非 border——border 参与布局会撑动固定行高）。
 */
export function TableCell({
  cell,
  column,
  rowHeight,
  scrolled,
  editingCell,
  onMouseDown,
  onCommitEditing,
  onCancelEditing,
}: TableCellProps) {
  const { isLastLeftPinned, style } = getCommonPinningStyles(cell.column);
  const editing =
    editingCell != null &&
    editingCell.rowId === cell.row.id &&
    editingCell.columnId === cell.column.id
      ? editingCell
      : null;

  const boxShadow = [
    getSelectionBoxShadow(cell),
    isLastLeftPinned && scrolled ? PINNING_EDGE_SHADOW : undefined,
  ]
    .filter(Boolean)
    .join(", ");
  const { height } = ROW_HEIGHT_SPECS[rowHeight];

  return (
    <td
      data-row-id={cell.row.id}
      data-column-id={cell.column.id}
      tabIndex={cell.getTabIndex()}
      // 编辑中按 Z_INDEX.editingCell 提层级到表头之上（阶梯见 lib/pinning.ts），
      // 否则向下长高的编辑器滚到表头下方时会被表头盖住
      style={{
        ...style,
        ...(boxShadow ? { boxShadow } : undefined),
        ...(editing != null ? { zIndex: Z_INDEX.editingCell } : undefined),
      }}
      onMouseDown={onMouseDown}
      // 拖拽中扩展选区（与 mousedown 的选区起点配套，官方套路）
      onMouseEnter={cell.getSelectionExtendHandler()}
      className={cn(
        // select-none：拖拽框选时不连累选中文本；
        // 焦点环见上方 inset box-shadow（outline-hidden 不吃浏览器默认焦点环）
        "select-none border-b border-r bg-card px-3 outline-hidden",
      )}
    >
      {/* 固定高壳：高度与裁剪在此统一执行（行高不变量的执行点，见 lib/row-height.ts），
          各类型内容的垂直布局见 cell-content.tsx 契约。
          选中不加底色，只保留描边；编辑中隐藏壳的显示内容，由编辑器覆盖层接管 */}
      <div className="overflow-hidden" style={{ height }}>
        {column && editing == null ? (
          <CellContent
            column={column}
            value={cell.getValue() as CellValue | undefined}
            rowHeight={rowHeight}
          />
        ) : null}
      </div>
      {editing != null ? (
        <CellEditor
          initial={editing.initial}
          minHeight={height}
          onCommit={(value, move) =>
            onCommitEditing(cell.row.id, cell.column.id, value, move)
          }
          onCancel={onCancelEditing}
        />
      ) : null}
    </td>
  );
}
