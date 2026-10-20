CREATE TYPE "public"."data_table_column_type" AS ENUM('text', 'singleSelect', 'multiSelect', 'date', 'attachment', 'number');--> statement-breakpoint
CREATE TABLE "data_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_table_column" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "data_table_column_type" NOT NULL,
	"width" integer DEFAULT 150 NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_table_row" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "data_table" ADD CONSTRAINT "data_table_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_table_column" ADD CONSTRAINT "data_table_column_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_table_row" ADD CONSTRAINT "data_table_row_table_id_data_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."data_table"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "data_table_column_table_position_idx" ON "data_table_column" USING btree ("table_id","position");--> statement-breakpoint
CREATE INDEX "data_table_row_table_position_idx" ON "data_table_row" USING btree ("table_id","position");