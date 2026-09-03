ALTER TABLE "files" ADD COLUMN "focal_x" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "focal_y" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "parent_file_id" integer;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_parent_file_id_files_id_fk" FOREIGN KEY ("parent_file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "files_parent_file_idx" ON "files" USING btree ("parent_file_id");