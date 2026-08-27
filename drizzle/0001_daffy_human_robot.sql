CREATE TABLE "published_posts" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"draft" text NOT NULL,
	"final_post_url" text NOT NULL,
	"language" text NOT NULL,
	"post_size" text NOT NULL,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "insights" jsonb;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "research_results" jsonb;--> statement-breakpoint
ALTER TABLE "published_posts" ADD CONSTRAINT "published_posts_thread_id_runs_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."runs"("thread_id") ON DELETE cascade ON UPDATE no action;