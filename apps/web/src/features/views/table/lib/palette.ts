import type { OptionColorToken } from "@stack/shared";

/**
 * 选项色板：token → 标签样式（淡底 + 同色文字，dark 模式自动适配）。
 * 合法 token 的唯一真源是 @stack/shared 的 OPTION_COLOR_TOKENS，
 * 色值只存在于此（后端只存 token，不存色值）。
 * 注意：必须写完整静态类名，禁止 bg-${token} 动态拼接——
 * Tailwind 扫描不到运行时拼接的类名，样式会整体丢失。
 */
export const optionColorClasses: Record<OptionColorToken, string> = {
  gray: "bg-gray-500/10 text-gray-600 dark:bg-gray-500/15 dark:text-gray-400",
  brown: "bg-amber-950/10 text-amber-900 dark:bg-amber-900/25 dark:text-amber-200",
  red: "bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400",
  orange: "bg-orange-500/10 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  yellow: "bg-yellow-500/15 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300",
  green: "bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400",
  teal: "bg-teal-500/10 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  blue: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400",
  purple: "bg-purple-500/10 text-purple-600 dark:bg-purple-500/15 dark:text-purple-400",
  pink: "bg-pink-500/10 text-pink-600 dark:bg-pink-500/15 dark:text-pink-400",
  rose: "bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400",
};
