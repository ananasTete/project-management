import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from "#/features/home";

/** / = 受保护首页（登录用户信息 + 登出） */
export const Route = createFileRoute("/_app/")({
  component: () => <HomePage />,
});
