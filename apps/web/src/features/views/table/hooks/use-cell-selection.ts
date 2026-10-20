import type { TableRow } from "@stack/shared";
import type { CellSelectionDirection } from "@tanstack/react-table";
import type { KeyboardEvent, RefObject } from "react";
import type { TableInstance } from "../lib/features";

interface UseCellSelectionOptions {
  table: TableInstance;
  /** 滚动容器引用：键盘导航后把焦点格滚入可视区 */
  scrollerRef: RefObject<HTMLDivElement | null>;
  /** Shift+Enter：在焦点行下方新建一行，resolve 为新行（失败 null） */
  onInsertRowBelow?: (afterRowId: string) => Promise<TableRow | null>;
}

/**
 * 选中态的导航命令集：焦点移动 / 扩展 / Tab 折返 / 滚入可视区。
 * 只读导航，不做数据 mutation（清空选中格的编辑语义见 use-cell-editing）。
 * 返回的 handler 每渲染重建（依赖 table 实例与 ref 的最新闭包），不要缓存。
 */
export function useCellSelection({
  table,
  scrollerRef,
  onInsertRowBelow,
}: UseCellSelectionOptions) {
  /** 键盘移动后把焦点格滚入可视区（rAF 等状态先落再查 DOM，官方示例同款节奏） */
  const scrollToFocusedCell = () => {
    requestAnimationFrame(() => {
      const focused = table.getFocusedCell();
      if (!focused) {
        return;
      }
      scrollerRef.current
        ?.querySelector(
          `[data-row-id="${focused.row.id}"][data-column-id="${focused.column.id}"]`,
        )
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const moveSelection = (direction: CellSelectionDirection, extend: boolean) => {
    if (extend) {
      table.extendCellSelection(direction);
    } else {
      table.moveCellSelection(direction);
    }
    scrollToFocusedCell();
  };

  /** 展示序列（冻结前缀在前——getVisibleLeafColumns 不按 pinning 重排，不能直接用） */
  const getDisplayColumns = () => [
    ...table.getStartVisibleLeafColumns(),
    ...table.getCenterVisibleLeafColumns(),
    ...table.getEndVisibleLeafColumns(),
  ];

  /** Tab 流转（含跨行折返）：本行末列右移 → 下一行首列；本行首列左移 → 上一行末列 */
  const wrapMove = (rowId: string, columnId: string, direction: "left" | "right") => {
    const rows = table.getRowsInDisplayOrder();
    const cols = getDisplayColumns();
    const rowIndex = rows.findIndex((row) => row.id === rowId);
    const colIndex = cols.findIndex((col) => col.id === columnId);
    if (rowIndex < 0 || colIndex < 0) {
      return;
    }
    let nextRow = rowIndex;
    let nextCol = colIndex;
    if (direction === "right") {
      if (colIndex + 1 < cols.length) {
        nextCol = colIndex + 1;
      } else if (rowIndex + 1 < rows.length) {
        nextRow = rowIndex + 1;
        nextCol = 0;
      } else {
        return; // 整表末格：停留
      }
    } else {
      if (colIndex - 1 >= 0) {
        nextCol = colIndex - 1;
      } else if (rowIndex - 1 >= 0) {
        nextRow = rowIndex - 1;
        nextCol = cols.length - 1;
      } else {
        return; // 整表首格：停留
      }
    }
    table.setFocusedCell(rows[nextRow].id, cols[nextCol].id);
    scrollToFocusedCell();
  };

  /**
   * Shift+Enter：在焦点行下方新建一行（不进入编辑），完成后选区落到新行同列。
   * 竞态守卫：await 期间用户已把焦点移去别的行时，不把选区抢回。
   */
  const insertRowBelow = (afterRowId: string) => {
    if (!onInsertRowBelow) {
      return;
    }
    void onInsertRowBelow(afterRowId).then((newRow) => {
      if (!newRow) {
        return;
      }
      const focused = table.getFocusedCell();
      if (focused?.row.id !== afterRowId) {
        return;
      }
      table.setFocusedCell(newRow.id, focused.column.id);
      scrollToFocusedCell();
    });
  };

  /**
   * 导航类按键命令（Cmd+A / 方向键 / Tab / Enter）；编辑类按键归 use-cell-editing，
   * 总分发与守卫见 use-grid-keyboard。
   * 带修饰键的事件一律在此拦截并返回已消费（Cmd+A 全选，其余组合键不落入
   * 编辑的"直接键入"分支）——与拆分前的单一 keydown 行为一致。
   * 官方约定：feature 不自带 keydown，由外部驱动，作用域限定在 grid 本体（table[role=grid]）。
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): boolean => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod) {
      if (event.key.toLowerCase() === "a") {
        event.preventDefault();
        table.selectAllCells();
      }
      return true;
    }
    const arrowDirections: Record<string, CellSelectionDirection> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = arrowDirections[event.key];
    if (direction) {
      event.preventDefault();
      moveSelection(direction, event.shiftKey);
      return true;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const focused = table.getFocusedCell();
      if (focused) {
        wrapMove(focused.row.id, focused.column.id, event.shiftKey ? "left" : "right");
      }
      return true;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const focused = table.getFocusedCell();
      if (focused) {
        if (event.shiftKey) {
          insertRowBelow(focused.row.id);
        } else {
          moveSelection("down", false);
        }
      }
      return true;
    }
    return false;
  };

  return { moveSelection, wrapMove, getDisplayColumns, insertRowBelow, handleKeyDown };
}
