import type { RowHeight, TableMeta, TableSnapshot } from "@stack/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  apiErrorMessage,
  createTable,
  createTableRow,
  deleteTable,
  fetchTableSnapshot,
  fetchTables,
  renameTable,
  updateColumnPinning,
  updateRowValues,
  updateTableRowHeight,
} from "../api";
import { tableKeys } from "../query-keys";

export function useTables() {
  return useQuery({
    queryKey: tableKeys.list(),
    queryFn: fetchTables,
  });
}

/** 表详情快照（columns + rows）；tableId 为空时挂起不发请求 */
export function useTableSnapshot(tableId: string | null) {
  return useQuery({
    queryKey: tableKeys.detail(tableId ?? "none"),
    queryFn: () => fetchTableSnapshot(tableId as string),
    enabled: tableId != null,
  });
}

export function useCreateTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name }: { name: string }) => createTable(name),
    // 响应即完整 TableMeta，直接插入列表缓存头部（列表按 updateTime 降序，新表必在最前）
    onSuccess: (created) =>
      qc.setQueryData<Array<TableMeta> | undefined>(tableKeys.list(), (old) => [
        created,
        ...(old ?? []),
      ]),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
}

/**
 * 乐观更新标准套路（TanStack Query 官方模式）：
 * onMutate 先取消在途请求、快照缓存再写入乐观值（返回值即 context），
 * onError 用快照回滚，onSuccess 用服务端响应覆盖为权威数据——全程不重新拉取列表。
 */
export function useRenameTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, name }: { tableId: string; name: string }) =>
      renameTable(tableId, name),
    onMutate: async ({ tableId, name }) => {
      await qc.cancelQueries({ queryKey: tableKeys.list() });
      await qc.cancelQueries({ queryKey: tableKeys.detail(tableId) });
      const previousList = qc.getQueryData<Array<TableMeta>>(tableKeys.list());
      const previousDetail = qc.getQueryData<TableSnapshot>(tableKeys.detail(tableId));
      qc.setQueryData<Array<TableMeta> | undefined>(tableKeys.list(), (old) =>
        old?.map((table) => (table.id === tableId ? { ...table, name } : table)),
      );
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old ? { ...old, table: { ...old.table, name } } : old,
      );
      return { previousList, previousDetail };
    },
    onSuccess: (updated, { tableId }) => {
      // 重命名会刷新 updateTime（$onUpdate），而列表按 updateTime 降序，
      // 故用响应校正后移到列表头部——与重新拉取的结果一致
      qc.setQueryData<Array<TableMeta> | undefined>(tableKeys.list(), (old) =>
        old ? [updated, ...old.filter((table) => table.id !== tableId)] : old,
      );
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old ? { ...old, table: updated } : old,
      );
    },
    onError: (error, { tableId }, context) => {
      toast.error(apiErrorMessage(error));
      qc.setQueryData(tableKeys.list(), context?.previousList);
      qc.setQueryData(tableKeys.detail(tableId), context?.previousDetail);
    },
  });
}

export function useDeleteTable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId }: { tableId: string }) => deleteTable(tableId),
    onMutate: async ({ tableId }) => {
      await qc.cancelQueries({ queryKey: tableKeys.list() });
      const previousList = qc.getQueryData<Array<TableMeta>>(tableKeys.list());
      qc.setQueryData<Array<TableMeta> | undefined>(tableKeys.list(), (old) =>
        old?.filter((table) => table.id !== tableId),
      );
      return { previousList };
    },
    onSuccess: (_data, variables) => {
      qc.removeQueries({ queryKey: tableKeys.detail(variables.tableId) });
    },
    onError: (error, _variables, context) => {
      toast.error(apiErrorMessage(error));
      qc.setQueryData(tableKeys.list(), context?.previousList);
    },
  });
}

/**
 * 行高档位更新：乐观改快照 → PATCH → 用服务端响应校正；
 * 失败时失效快照查询回滚到服务端真实状态（与 useUpdatePinning 同套路）。
 */
export function useUpdateRowHeight(tableId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ rowHeight }: { rowHeight: RowHeight }) => {
      if (tableId == null) {
        return Promise.reject(new Error("未选中表格"));
      }
      return updateTableRowHeight(tableId, rowHeight);
    },
    onMutate: ({ rowHeight }) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old ? { ...old, table: { ...old.table, rowHeight } } : old,
      );
    },
    onSuccess: (updated) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old ? { ...old, table: updated } : old,
      );
      // 行高变更刷新 updatedAt，列表按 updateTime 降序 → 校正后移到头部（与重命名一致）
      qc.setQueryData<Array<TableMeta> | undefined>(tableKeys.list(), (old) =>
        old ? [updated, ...old.filter((table) => table.id !== tableId)] : old,
      );
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error));
      if (tableId != null) {
        qc.invalidateQueries({ queryKey: tableKeys.detail(tableId) });
      }
    },
  });
}

/**
 * 单元格值更新（编辑提交与清空共用管线）：
 * 乐观改快照行 values → PATCH（浅合并语义）→ 用服务端权威行校正；失败回滚快照。
 * 连续多格清空会并发多条单格 PATCH，量级小可接受，批量端点将来再收敛。
 */
export function useUpdateCellValue(tableId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      rowId,
      columnId,
      value,
    }: {
      rowId: string;
      columnId: string;
      value: string;
    }) => {
      if (tableId == null) {
        return Promise.reject(new Error("未选中表格"));
      }
      return updateRowValues(tableId, rowId, { [columnId]: value });
    },
    onMutate: async ({ rowId, columnId, value }) => {
      if (tableId == null) {
        return;
      }
      await qc.cancelQueries({ queryKey: tableKeys.detail(tableId) });
      const previousDetail = qc.getQueryData<TableSnapshot>(tableKeys.detail(tableId));
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((row) =>
                row.id === rowId
                  ? { ...row, values: { ...row.values, [columnId]: value } }
                  : row,
              ),
            }
          : old,
      );
      return { previousDetail };
    },
    onSuccess: (updatedRow, { rowId }) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old
          ? {
              ...old,
              rows: old.rows.map((row) => (row.id === rowId ? updatedRow : row)),
            }
          : old,
      );
    },
    onError: (error, _variables, context) => {
      toast.error(apiErrorMessage(error));
      if (tableId == null) {
        return;
      }
      if (context?.previousDetail) {
        qc.setQueryData(tableKeys.detail(tableId), context.previousDetail);
      } else {
        qc.invalidateQueries({ queryKey: tableKeys.detail(tableId) });
      }
    },
  });
}

/**
 * 新建行（可指定插入到某行之后）。非乐观：本地 PGLite 延迟可忽略，
 * 且新行 id 由服务端生成，乐观插入需要临时 id 再换回，复杂度不值得；
 * 成功后按插入位置写回快照，失败 toast。
 */
export function useCreateTableRow(tableId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ afterRowId }: { afterRowId?: string }) => {
      if (tableId == null) {
        return Promise.reject(new Error("未选中表格"));
      }
      return createTableRow(tableId, afterRowId);
    },
    onSuccess: (createdRow, { afterRowId }) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) => {
        if (!old) {
          return old;
        }
        const index =
          afterRowId === undefined
            ? -1
            : old.rows.findIndex((row) => row.id === afterRowId);
        if (index < 0) {
          return { ...old, rows: [...old.rows, createdRow] };
        }
        const rows = [...old.rows];
        rows.splice(index + 1, 0, createdRow);
        return { ...old, rows };
      });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
}

/**
 * 冻结边界更新：乐观改本地快照 → PATCH pinning → 用服务端全量列校正；
 * 失败时失效快照查询回滚到服务端真实状态。
 */
export function useUpdatePinning(tableId: string | null) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ pinnedThrough }: { pinnedThrough: string | null }) => {
      if (tableId == null) {
        return Promise.reject(new Error("未选中表格"));
      }
      return updateColumnPinning(tableId, pinnedThrough);
    },
    onMutate: ({ pinnedThrough }) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) => {
        if (!old) {
          return old;
        }
        const target = pinnedThrough
          ? old.columns.findIndex((column) => column.id === pinnedThrough)
          : -1;
        return {
          ...old,
          columns: old.columns.map((column, index) => ({
            ...column,
            pinned: index <= target,
          })),
        };
      });
    },
    onSuccess: (result) => {
      if (tableId == null) {
        return;
      }
      qc.setQueryData<TableSnapshot | undefined>(tableKeys.detail(tableId), (old) =>
        old ? { ...old, columns: result.columns } : old,
      );
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error));
      if (tableId != null) {
        qc.invalidateQueries({ queryKey: tableKeys.detail(tableId) });
      }
    },
  });
}
