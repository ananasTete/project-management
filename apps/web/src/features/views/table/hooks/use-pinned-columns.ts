import type { TableColumn } from "@stack/shared";
import type { RefObject, UIEvent } from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getColumnWidth } from "../lib/columns";
import { getPinnedPrefix } from "../lib/pinning";

interface UsePinnedColumnsOptions {
  columns: Array<TableColumn>;
  /** 滚动容器引用：冻结宽度守卫需要读 clientWidth */
  scrollerRef: RefObject<HTMLDivElement | null>;
  onPinnedColumnsChange?: (pinnedIds: Array<string>) => void;
}

/**
 * 冻结列的受控状态与切换命令。
 * 受控 pinning：每渲染从 schema 派生（initialState 只在挂载时生效，动态 schema 下不跟随）。
 * 变更只经 onPinnedColumnsChange → 父层改 columns → 回流，不走内部 onColumnPinningChange。
 */
export function usePinnedColumns({
  columns,
  scrollerRef,
  onPinnedColumnsChange,
}: UsePinnedColumnsOptions) {
  /** 冻结前缀（pinned 前缀展开结果，空数组 = 全部解冻） */
  const pinnedStart = useMemo(() => getPinnedPrefix(columns), [columns]);

  const pinnedIdSet = useMemo(() => new Set(pinnedStart), [pinnedStart]);

  /** 横向发生滚动（scrollLeft > 0）后为末位冻结列显示阴影；setState 值不变时 React 会跳过重渲染 */
  const [scrolled, setScrolled] = useState(false);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrolled(event.currentTarget.scrollLeft > 0);
  };

  /**
   * 表头右键菜单：冻结到该列（含之前所有列）/ 退到该列前一列（该列及其之后全部解冻）。
   * 冻结前做宽度守卫：前缀总宽必须严格小于滚动容器可视宽度，否则冻结区盖满容器、无意义。
   */
  const togglePin = (column: TableColumn) => {
    if (!onPinnedColumnsChange) {
      return;
    }
    const index = columns.findIndex((item) => item.id === column.id);
    if (index < 0) {
      return;
    }

    if (pinnedIdSet.has(column.id)) {
      onPinnedColumnsChange(columns.slice(0, index).map((item) => item.id));
      return;
    }

    const prefixWidth = columns
      .slice(0, index + 1)
      .reduce((sum, item) => sum + getColumnWidth(item), 0);
    const containerWidth = scrollerRef.current?.clientWidth ?? 0;
    if (containerWidth > 0 && prefixWidth >= containerWidth) {
      toast.error("冻结列总宽度不能达到或超过表格可视宽度");
      return;
    }
    onPinnedColumnsChange(columns.slice(0, index + 1).map((item) => item.id));
  };

  return {
    pinnedIdSet,
    scrolled,
    handleScroll,
    togglePin,
    /** 传入 useTable 受控 state.columnPinning 的值（每渲染从 schema 派生） */
    columnPinning: { start: pinnedStart, end: [] },
  };
}
