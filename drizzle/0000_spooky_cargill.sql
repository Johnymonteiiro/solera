CREATE TABLE "draft_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"char_count" integer NOT NULL,
	"trigger" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_version_id" text NOT NULL,
	"rater_id" text NOT NULL,
	"post_label" text,
	"hook_quality" integer,
	"originality" integer,
	"scannability" integer,
	"cta_quality" integer,
	"has_engagement_bait" boolean,
	"has_external_link_in_body" boolean,
	"overall" real,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judgements" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_version_id" text NOT NULL,
	"score" integer NOT NULL,
	"hook_quality" integer NOT NULL,
	"originality" integer NOT NULL,
	"scannability" integer NOT NULL,
	"cta_quality" integer NOT NULL,
	"length_adequate" boolean NOT NULL,
	"tone_linkedin" boolean NOT NULL,
	"has_engagement_bait" boolean NOT NULL,
	"has_external_link_in_body" boolean NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model" text NOT NULL,
	"temperature" double precision NOT NULL,
	"rubric_hash" text NOT NULL,
	"judged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "judgements_draft_version_id_unique" UNIQUE("draft_version_id")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"topic" text NOT NULL,
	"topic_norm" text NOT NULL,
	"post_size" text NOT NULL,
	"judge_loop" boolean NOT NULL,
	"status" text NOT NULL,
	"revision_count" integer DEFAULT 0 NOT NULL,
	"judge_retries" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "draft_versions" ADD CONSTRAINT "draft_versions_thread_id_runs_thread_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."runs"("thread_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_ratings" ADD CONSTRAINT "human_ratings_draft_version_id_draft_versions_id_fk" FOREIGN KEY ("draft_version_id") REFERENCES "public"."draft_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judgements" ADD CONSTRAINT "judgements_draft_version_id_draft_versions_id_fk" FOREIGN KEY ("draft_version_id") REFERENCES "public"."draft_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "draft_versions_thread_version_idx" ON "draft_versions" USING btree ("thread_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "human_ratings_rater_version_idx" ON "human_ratings" USING btree ("rater_id","draft_version_id");--> statement-breakpoint
CREATE INDEX "human_ratings_version_idx" ON "human_ratings" USING btree ("draft_version_id");--> statement-breakpoint
CREATE INDEX "judgements_rubric_hash_idx" ON "judgements" USING btree ("rubric_hash");--> statement-breakpoint
CREATE INDEX "runs_topic_norm_idx" ON "runs" USING btree ("topic_norm");