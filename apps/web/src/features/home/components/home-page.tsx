import { ROW_HEIGHTS, type RowHeight } from "@stack/shared";
import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Spinner } from "#/components/ui/spinner";
import { AppSidebar } from "#/features/app-shell/components/app-sidebar";
import {
  useCreateTable,
  useCreateTableRow,
  useDeleteTable,
  useRenameTable,
  useTableSnapshot,
  useTables,
  useUpdateCellValue,
  useUpdatePinning,
  useUpdateRowHeight,
} from "#/features/tables";
import { Table } from "#/features/views";

/** 行高档位的展示文案（档位语义见 @stack/shared RowHeight 与 views/table/lib/row-height.ts） */
const ROW_HEIGHT_LABELS: Record<RowHeight, string> = {
  low: "低",
  medium: "中",
  high: "高",
  max: "超高",
};

/**
 * 受保护首页（/）：左侧表格列表侧边栏（新建/重命名/删除/收展），
 * 右侧渲染选中表格（数据来自 GET /api/tables/:tableId 快照，冻结变更持久化到 pinning 端点）。
 */
export function HomePage() {
  const tablesQuery = useTables();
  const tables = tablesQuery.data ?? [];
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  // 选中态自愈：未选中时取第一张表；选中表被删后回退到第一张
  useEffect(() => {
    if (
      selectedTableId != null &&
      !tables.some((table) => table.id === selectedTableId)
    ) {
      setSelectedTableId(tables.length > 0 ? tables[0].id : null);
      return;
    }
    if (selectedTableId == null && tables.length > 0) {
      setSelectedTableId(tables[0].id);
    }
  }, [tables, selectedTableId]);

  const snapshotQuery = useTableSnapshot(selectedTableId);
  const snapshot = snapshotQuery.data;

  const createTable = useCreateTable();
  const renameTable = useRenameTable();
  const deleteTable = useDeleteTable();
  const updatePinning = useUpdatePinning(selectedTableId);
  const updateRowHeight = useUpdateRowHeight(selectedTableId);
  const updateCellValue = useUpdateCellValue(selectedTableId);
  const createTableRow = useCreateTableRow(selectedTableId);

  const handleCreate = useCallback(async () => {
    try {
      const table = await createTable.mutateAsync({ name: "未命名表格" });
      setSelectedTableId(table.id);
    } catch {
      // 错误已在 mutation onError 统一 toast
    }
  }, [createTable]);

  const handleRename = useCallback(
    async (tableId: string, name: string) => {
      try {
        await renameTable.mutateAsync({ tableId, name });
        toast.success("已重命名");
        return true;
      } catch {
        return false;
      }
    },
    [renameTable],
  );

  const handleDelete = useCallback(
    (tableId: string) => {
      deleteTable.mutate(
        { tableId },
        {
          onSuccess: () => {
            toast.success("已删除");
          },
        },
      );
    },
    [deleteTable],
  );

  /** 表格组件的冻结回调：乐观更新在 useUpdatePinning 内部，此处只透传边界（末位冻结列 id 或 null） */
  const handlePinnedColumnsChange = useCallback(
    (pinnedIds: Array<string>) => {
      updatePinning.mutate({ pinnedThrough: pinnedIds.at(-1) ?? null });
    },
    [updatePinning],
  );

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        tables={tables}
        activeTableId={selectedTableId}
        creating={createTable.isPending}
        renaming={renameTable.isPending}
        onSelect={setSelectedTableId}
        onCreate={() => void handleCreate()}
        onRename={handleRename}
        onDelete={handleDelete}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        {tablesQuery.isPending ? (
          <CenteredSpinner />
        ) : tables.length === 0 ? (
          <EmptyState
            onCreate={() => void handleCreate()}
            creating={createTable.isPending}
          />
        ) : snapshotQuery.isPending || !snapshot ? (
          <CenteredSpinner />
        ) : snapshot.columns.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            该表格还没有列
          </div>
        ) : (
          <>
            <header className="flex min-h-8 items-center gap-2">
              <h1 className="truncate text-sm font-medium">{snapshot.table.name}</h1>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground"
                  >
                    行高：{ROW_HEIGHT_LABELS[snapshot.table.rowHeight]}
                    <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {ROW_HEIGHTS.map((tier) => (
                    <DropdownMenuItem
                      key={tier}
                      onClick={() => updateRowHeight.mutate({ rowHeight: tier })}
                    >
                      <Check
                        className={
                          tier === snapshot.table.rowHeight ? "opacity-100" : "opacity-0"
                        }
                      />
                      {ROW_HEIGHT_LABELS[tier]}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </header>
            <div className="min-h-0 flex-1">
              {/* key=表 id：切换表格时强制重建实例。快照命中缓存时 Table 不会卸载，
                  editing/选中态会残留旧表引用（键盘失灵到下次点击），key 一并重置 */}
              <Table
                key={selectedTableId}
                columns={snapshot.columns}
                data={snapshot.rows}
                rowHeight={snapshot.table.rowHeight}
                onPinnedColumnsChange={handlePinnedColumnsChange}
                onUpdateCellValue={(rowId, columnId, value) =>
                  updateCellValue.mutate({ rowId, columnId, value })
                }
                onCreateRow={(afterRowId) =>
                  createTableRow.mutateAsync({ afterRowId }).catch(() => null)
                }
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CenteredSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner className="size-6" />
    </div>
  );
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">还没有表格，创建一个开始吧</p>
      <Button disabled={creating} onClick={onCreate}>
        {creating && <Spinner className="size-4" />}
        新建表格
      </Button>
    </div>
  );
}
