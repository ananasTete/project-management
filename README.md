# stack-template

pnpm monorepo 全栈模板：Hono + better-auth + Drizzle(ORM) + PostgreSQL 后端，
Vite + React 19 + TanStack Router/Query + Tailwind v4 前端，内置登录认证全链路。

## 结构

```
apps/
  api/    Hono 后端：better-auth（/auth/*）+ 受保护 API（/api/*）+ PGLite/PG 双模式
  web/    Vite SPA：登录/注册页 + 路由守卫 + 会话过期处理 + 受保护首页示例
packages/
  db/     Drizzle schema（better-auth 四表）+ 双模式迁移（本地 PGLite，生产 postgres.js）
  shared/ 前后端共享的 env schema 片段（业务 DTO 也放这里）
```

## 快速开始

前置：Node ≥ 20、pnpm 10（`corepack enable` 可自动匹配 packageManager 字段）。

```bash
pnpm install

# 后端环境变量（BETTER_AUTH_SECRET 必填）
cp apps/api/.env.example apps/api/.env.development
# 生成密钥：openssl rand -base64 32，填入 BETTER_AUTH_SECRET

# 建表（本地零 Docker：不设 DATABASE_URL 时自动用 PGLite，数据在 packages/db/.data/pg）
pnpm --filter @stack/db migrate

# 两个终端分别启动
pnpm dev:api   # http://localhost:3000
pnpm dev:web   # http://localhost:5173（/api、/auth 由 vite proxy 转发到 api，全同源免 CORS）
```

打开 http://localhost:5173 → 注册账号 → 登录 → 受保护首页。

## 认证链路速览

- 后端：`apps/api/src/auth.ts`（better-auth：basePath `/auth`、drizzle adapter、
  cookie 会话 7 天滑动续期）；`/api/*` 挂 session 中间件，`GET /api/me` 返回当前用户。
- 前端：`routes/_app.tsx` 布局守卫（未登录 → `/login?next=当前路径`）；
  `routes/login.tsx` 反向守卫（已登录自动跳走）；`lib/axios.ts` 401 拦截器统一
  处理会话过期；`features/auth/` 提供 useSession / useSignIn / useSignUp / useSignOut。
- 新增受保护路由：文件名以 `_app.` 开头（如 `routes/_app.settings.tsx`）即自动纳入守卫。

## 生产切换

- `DATABASE_URL=postgres://...`：API 与迁移脚本自动切到真实 PostgreSQL（postgres.js）。
- `TRUSTED_ORIGINS=https://你的前端域名`：better-auth origin 校验白名单（不设时只放行本机 dev）。
- Web 跨域部署时设 `VITE_API_BASE_URL`（留空 = 同源）。

## 常用脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev:api` / `pnpm dev:web` | 启动后端 / 前端 dev |
| `pnpm --filter @stack/db generate` | 改 schema 后生成迁移（`packages/db/src/schema.ts`） |
| `pnpm --filter @stack/db migrate` | 执行迁移（本地 PGLite 或 DATABASE_URL 指向的 PG） |
| `pnpm --filter @stack/db studio` | Drizzle Studio 查看数据 |
| `pnpm --filter @stack/web generate-routes` | 重新生成路由树（routeTree.gen.ts） |
| `pnpm check` / `pnpm format` / `pnpm lint` | Biome 检查 / 格式化 / 修复 |
| `pnpm typecheck` | 全仓 TypeScript 检查 |
