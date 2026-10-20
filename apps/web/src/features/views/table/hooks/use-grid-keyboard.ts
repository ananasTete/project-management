import type { KeyboardEvent } from "react";
import type { useCellEditing } from "./use-cell-editing";
import type { useCellSelection } from "./use-cell-selection";

interface UseGridKeyboardOptions {
  selection: ReturnType<typeof useCellSelection>;
  editing: ReturnType<typeof useCellEditing>;
}

/**
 * grid 本体（table[role=grid]）的 keydown 总分发：只做"守卫 + 按序转发"，不含任何按键语义——
 * 导航/全选/Tab/Enter 归 selection，编辑（F2/Delete/直接键入）归 editing。
 * 守卫对所有键生效：
 * - IME 守卫：组词期间的按键（isComposing）不当作导航/编辑键；
 * - 编辑态一律不响应（编辑器内的方向键/字符归 textarea 原生行为）。
 * 返回的 handler 每渲染重建（转发的是各 hook 的最新闭包），不要缓存。
 */
export function useGridKeyboard({ selection, editing }: UseGridKeyboardOptions) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing || editing.editingCell != null) {
      return;
    }
    if (selection.handleKeyDown(event)) {
      return;
    }
    editing.handleKeyDown(event);
  };
}
