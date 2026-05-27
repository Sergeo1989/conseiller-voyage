-- T122 — Ajout template_data JSONB sur notification_email_log pour retry dead-letter.
-- Nullable : les rows existantes restent valides, templateData stocké à partir de ce commit.

ALTER TABLE "notification_email_log" ADD COLUMN "template_data" JSONB;
