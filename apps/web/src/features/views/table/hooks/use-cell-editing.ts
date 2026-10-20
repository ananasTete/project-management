import type { TableColumn } from "@stack/shared";
import type { Cell, RowData } from "@tanstack/react-table";
import type { KeyboardEvent, MouseEvent, RefObject } from "react";
import { useState } from "react";
import type { CellEditMove, EditingCell } from "../lib/editing";
import type { TableFeatures, TableInstance } from "../lib/features";
import type { useCellSelection } from "./use-cell-selection";

interface UseCellEditingOptions {
  table: TableInstance;
  /** 列模型查询：columnById 判可编辑类型 */
  columnById: Map<string, TableColumn>;
  /** 单元格当前值的字符串形态（提交前去重、进编时取初值） */
  getCellValueString: (rowId: string, columnId: string) => string;
  /** 选中导航命令（编辑提交后按 move 移动选区） */
  selection: ReturnType<typeof useCellSelection>;
  /** grid 本体引用（table[role=grid]，键盘焦点载体）：取消/键盘提交后的焦点恢复 */
  gridRef: RefObject<HTMLTableElement | null>;
  /** 值提交回调；不传则编辑功能整体关闭，仅保留选中态 */
  onUpdateCellValue?: (rowId: string, columnId: string, value: string) => void;
}

/**
 * 编辑状态机（官方 spreadsheet 模式：editing 在表外，选中在 feature 内）。
 * 仅 text 列可编辑（其他类型编辑器未接入）。
 * 注意：本 hook 返回的 handler 每渲染重建（不得 useCallback）——
 * 重点击进编等交互依赖闭包读到 v9 cellSelection 实时 atom 的当前值。
 */
export function useCellEditing({
  table,
  columnById,
  getCellValueString,
  selection,
  gridRef,
  onUpdateCellValue,
}: UseCellEditingOptions) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);

  const canEditCell = (columnId: string) =>
    onUpdateCellValue != null && columnById.get(columnId)?.type === "text";

  const isEditing = (rowId: string, columnId: string) =>
    editingCell != null &&
    editingCell.rowId === rowId &&
    editingCell.columnId === columnId;

  const startEditing = (rowId: string, columnId: string, initial: string) => {
    if (!canEditCell(columnId)) {
      return;
    }
    table.setFocusedCell(rowId, columnId);
    setEditingCell({ rowId, columnId, initial });
  };

  /**
   * 提交：值不变不发请求；move 决定提交后的选区去向。
   * 就地提交（blur）不改选区——点击其他单元格时选区已由 mousedown 落在目标处，
   * 这里再 setFocusedCell 会把选区抢回编辑格。
   * 键盘提交（Enter/Tab，move 非空）时编辑器持有焦点，卸载后焦点会落到 body，
   * 键盘导航即失灵——回焦 grid 本体（点击路径进入编辑时 grid 从未被聚焦，同样依赖这里）。
   * 语句顺序敏感：先摘编辑态 → 回焦 → 提交 → 移动选区，搬迁勿重排。
   */
  const commitEditing = (
    rowId: string,
    columnId: string,
    value: string,
    move: CellEditMove | undefined,
  ) => {
    setEditingCell(null);
    if (move != null) {
      gridRef.current?.focus({ preventScroll: true });
    }
    if (value !== getCellValueString(rowId, columnId)) {
      onUpdateCellValue?.(rowId, columnId, value);
    }
    if (move === "down") {
      table.setFocusedCell(rowId, columnId);
      selection.moveSelection("down", false);
    } else if (move === "left" || move === "right") {
      selection.wrapMove(rowId, columnId, move);
    }
  };

  /** Esc 取消：丢弃草稿回到选中态，焦点交还 grid 本体 */
  const cancelEditing = () => {
    setEditingCell(null);
    gridRef.current?.focus({ preventScroll: true });
  };

  /**
   * mousedown 的重点击进编分支（由 table.tsx 组合进 td onMouseDown，顺序契约见彼处）：
   * v9 的 cellSelection 是实时 atom，getIsFocused/getSelectedCellCount 在事件处理器里
   * 读到的就是当前值（已用安装版 9.3.1 复现验证；官方示例同样在 mousedown 里读选中状态）。
   * 编辑分支必须 preventDefault：掐掉 mousedown 的默认焦点转移，
   * 保证编辑器挂载后的聚焦是唯一一次焦点变化（官方对接管的 mousedown 同款处理）。
   * 带修饰键时仍走选区（Shift 扩展 / Cmd 多选），返回 false 交还编排层。
   */
  const tryStartEditingByClick = <TData extends RowData>(
    cell: Cell<TableFeatures, TData>,
    event: MouseEvent<HTMLTableCellElement>,
  ): boolean => {
    const isReclickOnSelectedCell =
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      canEditCell(cell.column.id) &&
      cell.getIsFocused() &&
      table.getSelectedCellCount() === 1;
    if (!isReclickOnSelectedCell) {
      return false;
    }
    event.preventDefault();
    startEditing(
      cell.row.id,
      cell.column.id,
      getCellValueString(cell.row.id, cell.column.id),
    );
    return true;
  };

  /** 清空选中区内的文本列单元格（其他类型编辑器未接入，暂不处理） */
  const clearSelectedTextCells = () => {
    if (!onUpdateCellValue) {
      return;
    }
    const rows = table.getRowsInDisplayOrder();
    const cols = selection.getDisplayColumns();
    for (const bounds of table.getCellSelectionBounds()) {
      for (
        let rowIndex = bounds.minRowIndex;
        rowIndex <= bounds.maxRowIndex;
        rowIndex++
      ) {
        const row = rows[rowIndex];
        if (!row) {
          continue;
        }
        for (
          let colIndex = bounds.minColumnIndex;
          colIndex <= bounds.maxColumnIndex;
          colIndex++
        ) {
          const col = cols[colIndex];
          if (!col || columnById.get(col.id)?.type !== "text") {
            continue;
          }
          if (getCellValueString(row.id, col.id) !== "") {
            onUpdateCellValue(row.id, col.id, "");
          }
        }
      }
    }
  };

  /**
   * 编辑类按键命令（F2 进编 / Delete 清空 / 可打印字符替换式进编）；
   * 导航类按键归 use-cell-selection，总分发与守卫见 use-grid-keyboard。
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    if (event.key === "F2") {
      event.preventDefault();
      const focused = table.getFocusedCell();
      if (focused) {
        startEditing(
          focused.row.id,
          focused.column.id,
          getCellValueString(focused.row.id, focused.column.id),
        );
      }
      return true;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      clearSelectedTextCells();
      // 清空即收尾：退出选中态（resetCellSelection(true) 重置为空选区）
      table.resetCellSelection(true);
      return true;
    }
    if (event.key.length === 1 && !event.altKey) {
      // 直接键入：替换式进入编辑（单字符作初始值）
      event.preventDefault();
      const focused = table.getFocusedCell();
      if (focused) {
        startEditing(focused.row.id, focused.column.id, event.key);
      }
      return true;
    }
    return false;
  };

  return {
    editingCell,
    isEditing,
    startEditing,
    commitEditing,
    cancelEditing,
    tryStartEditingByClick,
    handleKeyDown,
  };
}
