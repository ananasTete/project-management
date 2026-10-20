import type { RowHeight, TableColumn, TableRow } from "@stack/shared";
import type { Cell } from "@tanstack/react-table";
import { useTable } from "@tanstack/react-table";
import { cn } from "cn";
import type { MouseEvent } from "react";
import { useRef } from "react";
import { useCellEditing } from "../hooks/use-cell-editing";
import { useCellSelection } from "../hooks/use-cell-selection";
import { useGridKeyboard } from "../hooks/use-grid-keyboard";
import { usePinnedColumns } from "../hooks/use-pinned-columns";
import { useTableModel } from "../hooks/use-table-model";
import { features, type TableFeatures } from "../lib/features";
import { TableCell } from "./table-cell";
import { TableHeaderCell } from "./table-header-cell";

interface TableProps {
  /** 列定义（schema）：数组顺序即列顺序（对齐后端 position 升序）；width 映射为官方 size */
  columns: Array<TableColumn>;
  /** 行数据：values 按列 id 取值，渲染由列 type 决定（见 cell-content.tsx） */
  data: Array<TableRow>;
  /** 行高档位（表级设置，缺省 low）：决定单元格固定高度与文本可见行数，见 lib/row-height.ts */
  rowHeight?: RowHeight;
  /**
   * 用户通过表头右键菜单改变冻结边界时触发：
   * 参数为前缀展开后的冻结列 id 数组（空数组 = 全部解冻）。
   * 父层据此更新 columns.pinned（乐观更新）并持久化（PATCH /api/tables/:id/columns/pinning）。
   */
  onPinnedColumnsChange?: (pinnedIds: Array<string>) => void;
  /**
   * 单元格值提交（仅 text 列会触发）：编辑器提交与 Delete 清空共用。
   * 父层接乐观更新管线（useUpdateCellValue）；不传则编辑功能整体关闭，仅保留选中态。
   */
  onUpdateCellValue?: (rowId: string, columnId: string, value: string) => void;
  /**
   * 选中态 Shift+Enter：在焦点行下方新建一行。
   * resolve 为新行（失败 null）——Table 据此把选区落到新行同列；
   * 等待期间焦点已移走则不抢回（竞态守卫见 use-cell-selection）。
   */
  onCreateRow?: (afterRowId: string) => Promise<TableRow | null>;
  className?: string;
}

/**
 * 表格视图编排层：只做组装与组合，业务规则在各 hook 与 lib。
 * 组装顺序即依赖方向：列模型（useTableModel）→ 冻结状态（usePinnedColumns）
 * → useTable 实例 → 选中命令（useCellSelection）→ 编辑状态机（useCellEditing）
 * → 键盘分发（useGridKeyboard）。编辑依赖选中（提交后移动选区），冻结/行高与二者正交。
 * 渲染只保留 thead/tbody 循环 + 两个叶子组件，不再下沉组件层（避免转发型 props 膨胀）。
 */
export function Table({
  columns,
  data,
  rowHeight = "low",
  onPinnedColumnsChange,
  onUpdateCellValue,
  onCreateRow,
  className,
}: TableProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** grid 本体（table[role=grid]）：键盘焦点载体，编辑收尾/选区起点的回焦目标 */
  const gridRef = useRef<HTMLTableElement>(null);

  const model = useTableModel(columns, data);

  const pinning = usePinnedColumns({ columns, scrollerRef, onPinnedColumnsChange });

  const table = useTable({
    features,
    columns: model.tanstackColumns,
    data,
    // 选中状态以行 id 锚定：我们的行 id 是稳定 uuid（官方 spreadsheet 示例同款配置）
    getRowId: (row) => row.id,
    // 默认 data 变化即重置选中——乐观更新每次提交都换 data 引用，不关掉会提交即丢选中
    autoResetCellSelection: false,
    // 受控 pinning：每渲染从 schema 派生（见 use-pinned-columns）
    state: {
      columnPinning: pinning.columnPinning,
    },
  });

  const selection = useCellSelection({
    table,
    scrollerRef,
    onInsertRowBelow: onCreateRow,
  });

  const editing = useCellEditing({
    table,
    columnById: model.columnById,
    getCellValueString: model.getCellValueString,
    selection,
    gridRef,
    onUpdateCellValue,
  });

  const handleKeyDown = useGridKeyboard({ selection, editing });

  /**
   * td mousedown 的组合顺序（跨编辑/选区的业务顺序，集中在此）：
   * 1. 编辑中的格子/非左键：不响应（编辑器自身的 mousedown 已被其 stopPropagation 拦截，此处兜底）；
   * 2. 无修饰键重点击唯一选中的焦点格 = 进入编辑（内部 preventDefault 掐掉默认焦点转移）；
   * 3. 其余 = 选区起点：官方套路，mousedown 开始选区（自带 document 级 mouseup 收尾，
   *    拖出表格外也能正常结束）；mouseenter 在拖拽中扩展；不绑 mouseup。
   */
  const handleCellMouseDown = (
    cell: Cell<TableFeatures, TableRow>,
    event: MouseEvent<HTMLTableCellElement>,
  ) => {
    if (editing.isEditing(cell.row.id, cell.column.id) || event.button !== 0) {
      return;
    }
    if (editing.tryStartEditingByClick(cell, event)) {
      return;
    }
    gridRef.current?.focus({ preventScroll: true });
    cell.getSelectionStartHandler()(event);
  };

  return (
    // 滚动视口：纯滚动容器（滚动事件、冻结宽度守卫的 clientWidth、
    // 键盘导航后的 scrollIntoView 均以它为锚，见各 hook 的 scrollerRef），
    // 不承担键盘/焦点——那是 grid 本体（下方 table[role=grid]）的职责
    <div
      ref={scrollerRef}
      data-slot="table"
      onScroll={pinning.handleScroll}
      className={cn(
        // 无外围边框/圆角：顶边线由表头行的 border-t 自带，
        // 右/下边缘由单元格网格自身的 border-r/border-b 收尾，容器不再包边框
        "size-full overflow-auto bg-card text-card-foreground",
        className,
      )}
    >
      {/* 列宽三件套（冻结偏移按列宽累加，每列实际渲染宽度必须严格等于其 size，
          完整说明见 lib/pinning.ts）：table-layout fixed 只看表头行声明的宽度，
          th 显式 width: getSize()（见 table-header-cell.tsx），
          表格总宽 getTotalSize() = 各列 size 之和 */}
      {/* role=grid：WAI-ARIA data grid 模式——拥有行的 table 升级为交互式网格，
          键盘导航与焦点（tabIndex/outline-hidden）挂在 grid 本体上；
          outline-hidden：焦点态由单元格选中描边表达，不吃浏览器默认焦点环。
          table 挂 grid 角色的合法性：W3C html-aria 对 table 的角色许可为 "Any role"
          （table-based grid 是 APG 认可模式）；biome 对此更保守，已在 biome.json
          按模块豁免 noNoninteractiveElementToInteractiveRole——改 div 会破坏
          table-layout:fixed + sticky 的冻结列实现 */}
      <table
        ref={gridRef}
        role="grid"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="table-fixed border-separate border-spacing-0 text-sm outline-hidden"
        style={{ width: table.getTotalSize() }}
      >
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHeaderCell
                  key={header.id}
                  header={header}
                  column={model.columnById.get(header.column.id)}
                  canPin={onPinnedColumnsChange != null}
                  isColumnPinned={pinning.pinnedIdSet.has(header.column.id)}
                  scrolled={pinning.scrolled}
                  onTogglePin={pinning.togglePin}
                />
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    cell={cell}
                    column={model.columnById.get(cell.column.id)}
                    rowHeight={rowHeight}
                    scrolled={pinning.scrolled}
                    editingCell={editing.editingCell}
                    onMouseDown={(event) => handleCellMouseDown(cell, event)}
                    onCommitEditing={editing.commitEditing}
                    onCancelEditing={editing.cancelEditing}
                  />
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="p-6 text-center text-sm text-muted-foreground"
                colSpan={columns.length}
              >
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
