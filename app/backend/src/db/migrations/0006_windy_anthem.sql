CREATE TABLE "global_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"layout_slot" varchar(20) DEFAULT 'none' NOT NULL,
	"content" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "global_sections" ADD CONSTRAINT "global_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "global_sections" ADD CONSTRAINT "global_sections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "global_sections_guid_idx" ON "global_sections" USING btree ("guid");--> statement-breakpoint
CREATE UNIQUE INDEX "global_sections_slug_uq" ON "global_sections" USING btree ("slug") WHERE "global_sections"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "global_sections_layout_slot_uq" ON "global_sections" USING btree ("layout_slot") WHERE "global_sections"."layout_slot" != 'none' and "global_sections"."is_active";--> statement-breakpoint
CREATE INDEX "global_sections_layout_slot_idx" ON "global_sections" USING btree ("layout_slot");