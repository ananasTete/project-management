import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { Spinner } from "#/components/ui/spinner";
import { useSession, useSignOut } from "#/features/auth";

/**
 * 受保护首页（/）：演示登录后的完整链路——
 * useSession 拉当前用户（GET /api/me）、useSignOut 登出并回登录页。
 * 业务页面请以此为例挂在 _app 布局下。
 */
export function HomePage() {
  const { data: me, isPending } = useSession();
  const signOut = useSignOut();

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>已登录</CardTitle>
          <CardDescription>受保护页面示例：会话数据来自 GET /api/me</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isPending ? (
            <Spinner className="size-5" />
          ) : me ? (
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-muted-foreground">昵称：</span>
                {me.name}
              </p>
              <p>
                <span className="text-muted-foreground">邮箱：</span>
                {me.email}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">未获取到用户信息</p>
          )}
          <Button
            className="w-full"
            disabled={signOut.isPending}
            onClick={() => signOut.mutate()}
            variant="outline"
          >
            {signOut.isPending && <Spinner className="size-4" />}
            退出登录
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
