-- Universal Tutor Migration
-- Add topic field to support any subject, not just languages

-- Add topic to unit (nullable first for existing data)
ALTER TABLE "unit" ADD COLUMN "topic" text;

-- Populate topic from targetLanguage for existing units
UPDATE "unit" SET "topic" = "target_language" WHERE "topic" IS NULL;

-- Make topic NOT NULL after population
ALTER TABLE "unit" ALTER COLUMN "topic" SET NOT NULL;

-- Make targetLanguage nullable (for non-language topics)
ALTER TABLE "unit" ALTER COLUMN "target_language" DROP NOT NULL;

-- Add topic to course
ALTER TABLE "course" ADD COLUMN "topic" text;
UPDATE "course" SET "topic" = "target_language" WHERE "topic" IS NULL;
ALTER TABLE "course" ALTER COLUMN "topic" SET NOT NULL;

-- Make course language fields nullable
ALTER TABLE "course" ALTER COLUMN "source_language" DROP NOT NULL;
ALTER TABLE "course" ALTER COLUMN "target_language" DROP NOT NULL;

-- Add topic to srs_card for grouping terms by subject
ALTER TABLE "srs_card" ADD COLUMN "topic" text;
UPDATE "srs_card" SET "topic" = "language" WHERE "topic" IS NULL;

-- Add topic to user_preferences for current learning topic
ALTER TABLE "user_preferences" ADD COLUMN "current_topic" text;

-- Create index for topic-based queries
CREATE INDEX "unit_topic_idx" ON "unit" ("topic");
CREATE INDEX "srs_card_topic_idx" ON "srs_card" ("topic");
