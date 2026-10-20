import type { TableColumn, TableRow } from "@stack/shared";
import type { Header } from "@tanstack/react-table";
import { FlexRender } from "@tanstack/react-table";
import { cn } from "cn";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#/components/ui/context-menu";
import type { TableFeatures } from "../lib/features";
import { getCommonPinningStyles, PINNING_EDGE_SHADOW, Z_INDEX } from "../lib/pinning";

interface TableHeaderCellProps {
  header: Header<TableFeatures, TableRow>;
  /** 该列的 schema 定义（右键冻结命令用，按 TanStack 列 id 反查） */
  column: TableColumn | undefined;
  /** 冻结功能是否开启（onPinnedColumnsChange 缺省时菜单禁用） */
  canPin: boolean;
  /** 前缀展开后的冻结标记（决定菜单文案） */
  isColumnPinned: boolean;
  /** 横向已滚动（末位冻结列显示右缘阴影） */
  scrolled: boolean;
  onTogglePin: (column: TableColumn) => void;
}

/**
 * 表头单元格：sticky 纵向吸顶 + 冻结列横向定位 + 右键冻结菜单。
 * 列宽口径见 lib/pinning.ts 的三件套说明（th 显式声明 width: column.getSize()）。
 */
export function TableHeaderCell({
  header,
  column,
  canPin,
  isColumnPinned,
  scrolled,
  onTogglePin,
}: TableHeaderCellProps) {
  const { isPinned, isLastLeftPinned, style } = getCommonPinningStyles(header.column);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <th
          style={{
            ...style,
            width: header.column.getSize(),
            // 层级阶梯见 lib/pinning.ts Z_INDEX；
            // 表头 sticky 跟随滚动，顶边线在纵向滚动时也始终可见
            position: "sticky",
            top: 0,
            zIndex: isPinned ? Z_INDEX.pinnedHeader : Z_INDEX.header,
            ...(isLastLeftPinned && scrolled
              ? { boxShadow: PINNING_EDGE_SHADOW }
              : undefined),
          }}
          className={cn(
            // border-t 即表格顶边线：顶边框由首行（表头）自带，容器不包边框
            "h-10 border-t border-b border-r bg-muted px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
          )}
        >
          {header.isPlaceholder ? null : <FlexRender header={header} />}
        </th>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={!canPin || !column}
          onClick={() => column && onTogglePin(column)}
        >
          {isColumnPinned ? "取消冻结列" : "冻结列"}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
