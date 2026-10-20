import { cn } from "cn";
import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import type { CellEditMove } from "../lib/editing";

/**
 * 单元格文本编辑器：绝对定位覆盖层，作为 td 直接子节点渲染（与固定高壳平级），
 * 从而逃逸壳的 overflow-hidden——显示态按档位 clamp 截断，编辑态需要全文可见。
 * 高度自适应：最小 = 当前行行高（与显示态壳对齐），内容增长向下展开（盖住下方行），封顶内滚。
 * 草稿自持（每次键入只重渲染编辑器自身，不触发表格级重渲染），提交时回调给 Table。
 *
 * 键位（飞书语义，全部带 isComposing 守卫，IME 组词中的按键不触发提交/取消）：
 * Enter 提交并下移；Shift+Enter / Cmd+Enter 插入换行；Tab / Shift+Tab 提交并右移/左移；
 * Esc 丢弃草稿回到选中态；失焦即提交（不取消）。
 */

/** 编辑器封顶高度：约半屏，超出后内部滚动 */
const MAX_EDITOR_HEIGHT = 320;

interface CellEditorProps {
  /** 进入编辑时的初始值（直接键入 = 单字符替换；Shift+Enter = 原值 + 换行） */
  initial: string;
  /** 最小高度 = 当前行的行高（与显示态壳对齐） */
  minHeight: number;
  onCommit: (value: string, move: CellEditMove | undefined) => void;
  onCancel: () => void;
}

export function CellEditor({ initial, minHeight, onCommit, onCancel }: CellEditorProps) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  /** Esc 已取消的标记：卸载/失焦路径据此跳过提交 */
  const cancelledRef = useRef(false);
  /** 滚动条只在滚动中显示（scrolling 类），停止后隐藏；定时器挂 ref 便于连续滚动时续期 */
  const [scrolling, setScrolling] = useState(false);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 挂载即聚焦，光标置于末尾（替换式开编的字符之后）
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  // 高度自适应：先重置再按 scrollHeight 撑开，下限夹到行高、封顶后转内部滚动。
  // rows={1} 是前提：textarea 默认 rows=2，height:auto 时按 2 行的内在高度量出
  // scrollHeight，空单元格也会被撑到 58px（超过 low 档 40px 行高）
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.max(minHeight, Math.min(el.scrollHeight, MAX_EDITOR_HEIGHT))}px`;
  }, [value, minHeight]);

  /** Cmd+Enter 无原生换行行为，在光标处手动插入 */
  const insertNewline = () => {
    const el = ref.current;
    if (!el) {
      return;
    }
    el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
    setValue(el.value);
  };

  const handleScroll = () => {
    setScrolling(true);
    clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => setScrolling(false), 800);
  };

  useEffect(() => () => clearTimeout(scrollTimerRef.current), []);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelledRef.current = true;
      onCancel();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      insertNewline();
    } else if (event.key === "Enter" && event.shiftKey) {
      // 原生行为即换行：不拦截、不提交
    } else if (event.key === "Enter") {
      event.preventDefault();
      onCommit(value, "down");
    } else if (event.key === "Tab") {
      event.preventDefault();
      onCommit(value, event.shiftKey ? "left" : "right");
    }
  };

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      // 不冒泡到 td：否则点击编辑器会重启选区、焦点被滚动容器抢走 → 提前 blur 提交
      onMouseDown={(event) => event.stopPropagation()}
      onBlur={() => {
        if (!cancelledRef.current) {
          onCommit(value, undefined);
        }
      }}
      spellCheck={false}
      rows={1}
      onScroll={handleScroll}
      data-scrolling={scrolling || undefined}
      className={cn(
        "absolute top-0 left-0 z-[4] w-full resize-none px-3 pt-2.5 pb-2 cell-editor-scrollbar",
        // 定位框与选中态同色系（淡蓝）：inset ring 对应选中格描边（lib/selection.ts
        // 同款 inset box-shadow），底色保持不透明 bg-card 保证编辑可读性。
        // 描边三不能：border 参与 border-box 高度，height = scrollHeight 的自适应
        // 会恒定留出上下边框厚的幽灵滚动空间；ring 向外扩 2px，首列左侧会被
        // 滚动容器 overflow 裁掉；inset ring 画在盒内，两者皆无
        "inset-ring-2 inset-ring-blue-500 bg-card text-sm leading-5 text-card-foreground shadow-md outline-hidden",
      )}
      style={{ minHeight, maxHeight: MAX_EDITOR_HEIGHT }}
    />
  );
}
