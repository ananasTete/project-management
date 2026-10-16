import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authKeys, fetchMe } from "#/features/auth";

/**
 * 无路径布局：所有需要登录的子路由（如 / = _app.index）都挂在这个布局下，
 * 共享同一个 beforeLoad 登录守卫（未登录 → /login?next=当前完整路径）。
 * 以后新增受保护路由，文件名以 _app. 开头即可自动纳入。
 *
 * 注意 SPA 守卫只管体验，真正的安全边界是后端 /api/* 中间件的 401。
 */
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient
      .fetchQuery({
        queryKey: authKeys.me(),
        queryFn: fetchMe,
        staleTime: 5 * 60_000, // 与 useSession 对齐：5 分钟内重复导航不重探
        retry: false, // 401 = 未登录，不值得重试
      })
      .catch(() => null);
    if (!me) {
      // location.href 含 search（如 /path?x=1），登录后可完整回到原地
      throw redirect({ to: "/login", search: { next: location.href } });
    }
  },
  component: () => <Outlet />,
});
