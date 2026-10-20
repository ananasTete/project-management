import type { RowHeight } from "@stack/shared";

/**
 * 行高档位 → 单元格布局参数（档位枚举语义见 @stack/shared RowHeight）。
 * 本文件是行高的唯一真源：像素高度与文本可见行数（line-clamp 类）都在此定义，
 * cell-content.tsx 按 clampClass 截断文本。clampClass 必须逐档写静态类名，
 * 不能按行数动态拼接——Tailwind 扫描不到运行时拼接的类名，样式会整体丢失。
 * 高度推导：可见行数 × 20px（text-sm 的 14px/20px 行高）+ 上下各 10px 垂直余量，
 * 四档等差 20px，low 档与表头 h-10 对齐。
 * 固定高度挂在内层包装 div 而非 td：普通块的 height + overflow-hidden 才能可靠
 * 裁剪并锁死行高，不受表格单元格对 overflow 实现差异的影响——这是
 * "高度不被内容撑开"不变量的最终执行点（见 table-cell.tsx）。
 */
export const ROW_HEIGHT_SPECS = {
  low: { height: 40, clampClass: "line-clamp-1" },
  medium: { height: 60, clampClass: "line-clamp-2" },
  high: { height: 80, clampClass: "line-clamp-3" },
  max: { height: 100, clampClass: "line-clamp-4" },
} as const satisfies Record<RowHeight, { height: number; clampClass: string }>;
