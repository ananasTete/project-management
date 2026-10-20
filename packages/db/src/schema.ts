import type { CellValue, SelectOption } from "@stack/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * better-auth 要求的四张核心表。
 * 字段命名遵循 better-auth 的 drizzle adapter 约定（camelCase 列名）。
 * 业务表请在本文件追加，与 auth 表共存于同一 schema 管理。
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(sql`false`),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 自定义表格（data_table）体系：表元信息 / 列定义（schema）/ 行数据。
 * - 列 options 与行 values 存 jsonb：选项随列整体读写、行值按列 id 取值，
 *   与前端 DTO 一一对应，列结构演进无需 DDL；
 * - 行值按列值筛选/排序需 jsonb 操作符，v1 的排序分页走 position，不依赖它；
 * - type 用 pgEnum 锁死六种（新增类型走 ALTER TYPE ADD VALUE）；
 * - position 整数留间隔（应用层按 max+10 分配），为拖拽排序铺路；
 * - desc 是 SQL 关键字，库列名用 description，DTO 层映射回 desc。
 */

export const dataTableColumnTypeEnum = pgEnum("data_table_column_type", [
  "text",
  "singleSelect",
  "multiSelect",
  "date",
  "attachment",
  "number",
]);

export const dataTableRowHeightEnum = pgEnum("data_table_row_height", [
  "low",
  "medium",
  "high",
  "max",
]);

export const dataTable = pgTable("data_table", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  /** 行高档位（表级）：单元格固定高度与文本可见行数，四档见 @stack/shared RowHeight */
  rowHeight: dataTableRowHeightEnum("row_height").notNull().default("low"),
  /** 归属用户（v1 最简归属：创建者可操作，将来换 workspace/项目成员权限） */
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const dataTableColumn = pgTable(
  "data_table_column",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => dataTable.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    type: dataTableColumnTypeEnum("type").notNull(),
    width: integer("width").notNull().default(150),
    pinned: boolean("pinned").notNull().default(false),
    /** 列顺序（前端数组顺序 = position 升序结果） */
    position: integer("position").notNull(),
    /** 仅 singleSelect / multiSelect 使用；结构见 @stack/shared SelectOption */
    options: jsonb("options").$type<SelectOption[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("data_table_column_table_position_idx").on(table.tableId, table.position),
  ],
);

export const dataTableRow = pgTable(
  "data_table_row",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tableId: uuid("table_id")
      .notNull()
      .references(() => dataTable.id, { onDelete: "cascade" }),
    /** 行顺序（cursor 分页的稳定排序键之一） */
    position: integer("position").notNull(),
    /** 按列 id 取值的字典，结构与前端 TableRow.values 一致 */
    values: jsonb("values").$type<Record<string, CellValue>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("data_table_row_table_position_idx").on(table.tableId, table.position),
  ],
);
