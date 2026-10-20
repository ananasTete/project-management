# 工程约定

## 验证方式

1. 允许运行类型检查（如 `pnpm typecheck`）。
2. 不允许进行真实运行验证（不允许启动 dev server、构建预览、浏览器访问等方式做运行时验证）。

## 数据库 schema 变更必须执行迁移

修改 `packages/db/src/schema.ts` 后的完整流程是两步，缺一不可：

1. `pnpm --filter @stack/db generate`：生成 SQL 迁移文件（`packages/db/drizzle/` 下新增 `00xx_*.sql`）。
2. `pnpm --filter @stack/db migrate`：把迁移应用到本地 PGLite 库（`packages/db/.data/pg`，无 `DATABASE_URL` 时 API 连的就是它）。

generate 只写文件不动库；typecheck 也不会暴露 schema 与库结构的偏差（drizzle 查询按 TS schema 生成）。漏掉第 2 步时，API 在运行期才会报 `column "xxx" does not exist`（PG 42703，DrizzleQueryError）。实例：2026-10 给 `data_table` 加 `row_height` 列时只 generate 未 migrate，`GET /api/tables` 直接 500。

注意：migrate 是数据库状态变更而非运行时验证，不受上面"验证方式"限制，允许执行。

## TanStack Table v9

TanStack Table v9 是新库，API 与 v8 差异大且 feature 需显式注册（未注册的 feature 对应 API 不存在，运行时报 `xxx is not a function`）。新增功能或修改表格相关代码时，必须先查找官方最新文档和示例（tanstack.com/table 的 guide 与 examples、官方仓库 examples 目录），以官方实现为参考基准来完成项目功能——允许按项目需求裁剪和调整，不必与示例一模一样；禁止脱离官方资料、凭 v8 经验或完全自行发明实现方案。
