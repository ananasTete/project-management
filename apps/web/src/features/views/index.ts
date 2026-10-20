/**
 * views 特性：可复用的通用视图组件集合。
 * 每个子目录是一个独立模块（如 table），通过各自的 index.ts 导出。
 * 表格数据契约（TableColumn/TableRow/TableMeta 等）由 @stack/shared 提供，前后端共用。
 */
export { Table } from "./table";
