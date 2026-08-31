CREATE TABLE "analytics_daily_rollups" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"date" date NOT NULL,
	"path" varchar(500) NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"unique_visitors_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"path" varchar(500) NOT NULL,
	"visitor_hash" char(64) NOT NULL,
	"device" varchar(20) NOT NULL,
	"browser" varchar(50),
	"os" varchar(50),
	"referrer" varchar(500),
	"country" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
ALTER TABLE "analytics_daily_rollups" ADD CONSTRAINT "analytics_daily_rollups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "analytics_daily_rollups" ADD CONSTRAINT "analytics_daily_rollups_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_date_path_uq" ON "analytics_daily_rollups" USING btree ("date","path");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_daily_rollups_guid_idx" ON "analytics_daily_rollups" USING btree ("guid");--> statement-breakpoint
CREATE INDEX "analytics_events_created_path_idx" ON "analytics_events" USING btree ("created_at","path");--> statement-breakpoint
CREATE INDEX "analytics_events_created_visitor_idx" ON "analytics_events" USING btree ("created_at","visitor_hash");--> statement-breakpoint
CREATE INDEX "analytics_events_path_idx" ON "analytics_events" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_events_guid_idx" ON "analytics_events" USING btree ("guid");