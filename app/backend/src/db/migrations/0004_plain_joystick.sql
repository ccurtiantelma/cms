CREATE TABLE "pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"locale" varchar(10) NOT NULL,
	"parent_id" integer,
	"translation_group_id" char(16) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"scheduled_at" timestamp with time zone,
	"published_revision_id" integer,
	"draft_content" jsonb NOT NULL,
	"draft_seo" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"page_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"content" jsonb NOT NULL,
	"seo" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_published_revision_id_page_revisions_id_fk" FOREIGN KEY ("published_revision_id") REFERENCES "public"."page_revisions"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "page_revisions" ADD CONSTRAINT "page_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_guid_idx" ON "pages" USING btree ("guid");--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_locale_root_uq" ON "pages" USING btree ("locale","slug") WHERE "pages"."parent_id" is null and "pages"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "pages_slug_locale_child_uq" ON "pages" USING btree ("locale","parent_id","slug") WHERE "pages"."parent_id" is not null and "pages"."is_active";--> statement-breakpoint
CREATE INDEX "pages_status_locale_idx" ON "pages" USING btree ("status","locale");--> statement-breakpoint
CREATE INDEX "pages_translation_group_idx" ON "pages" USING btree ("translation_group_id");--> statement-breakpoint
CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "pages_created_by_idx" ON "pages" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_guid_idx" ON "page_revisions" USING btree ("guid");--> statement-breakpoint
CREATE UNIQUE INDEX "page_revisions_page_number_uq" ON "page_revisions" USING btree ("page_id","revision_number");