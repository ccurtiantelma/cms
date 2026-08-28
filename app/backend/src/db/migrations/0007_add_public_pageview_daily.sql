CREATE TABLE "public_pageview_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"event_date" date NOT NULL,
	"page_path" varchar(2048) NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "public_pageview_daily" ADD CONSTRAINT "public_pageview_daily_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "public_pageview_daily" ADD CONSTRAINT "public_pageview_daily_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "public_pageview_daily_guid_idx" ON "public_pageview_daily" USING btree ("guid");--> statement-breakpoint
CREATE UNIQUE INDEX "public_pageview_daily_date_path_uq" ON "public_pageview_daily" USING btree ("event_date","page_path");--> statement-breakpoint
CREATE INDEX "public_pageview_daily_date_idx" ON "public_pageview_daily" USING btree ("event_date","is_active");--> statement-breakpoint
CREATE INDEX "public_pageview_daily_path_idx" ON "public_pageview_daily" USING btree ("page_path");