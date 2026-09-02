CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"guid" char(16) NOT NULL,
	"form_key" varchar(100) NOT NULL,
	"page_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"ip_hash" char(64) NOT NULL,
	"user_agent" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "form_submissions_form_key_idx" ON "form_submissions" USING btree ("form_key","created_at");--> statement-breakpoint
CREATE INDEX "form_submissions_page_idx" ON "form_submissions" USING btree ("page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "form_submissions_guid_idx" ON "form_submissions" USING btree ("guid");