ALTER TABLE "files" ADD COLUMN "width" integer;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "height" integer;--> statement-breakpoint
CREATE INDEX "files_entity_created_idx" ON "files" USING btree ("entity","created_at");