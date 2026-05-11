ALTER TABLE "board_beta_links" ADD COLUMN "shortcode" text;--> statement-breakpoint
-- Backfill shortcode for existing Instagram links so the new dedup query
-- finds them. Captures the post/reel/tv id from canonical IG URLs; non-IG
-- links (TikTok, etc.) keep shortcode NULL.
UPDATE "board_beta_links"
SET "shortcode" = (regexp_match("link", '/(p|reel|tv)/([\w-]+)'))[2]
WHERE "shortcode" IS NULL
  AND "link" ~ 'instagram\.com|instagr\.am';--> statement-breakpoint
CREATE INDEX "board_beta_links_shortcode_idx" ON "board_beta_links" USING btree ("board_type","shortcode");
