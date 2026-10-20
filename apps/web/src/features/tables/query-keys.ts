export const tableKeys = {
  all: ["tables"] as const,
  list: () => [...tableKeys.all, "list"] as const,
  detail: (tableId: string) => [...tableKeys.all, "detail", tableId] as const,
};
