CREATE TABLE "site_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"content_tree" jsonb NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"language" varchar(10) DEFAULT 'IT' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"display_conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_templates" ADD CONSTRAINT "site_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "site_templates" ADD CONSTRAINT "site_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "site_templates_guid_idx" ON "site_templates" USING btree ("guid");--> statement-breakpoint
CREATE INDEX "site_templates_type_lang_published_idx" ON "site_templates" USING btree ("type","language","is_published");