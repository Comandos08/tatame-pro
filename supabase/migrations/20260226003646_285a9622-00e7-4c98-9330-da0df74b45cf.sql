
-- Idempotent seed: ensure platform_landing_config has at least one row
INSERT INTO platform_landing_config (id, hero_enabled, hero_image_url, updated_at)
SELECT gen_random_uuid(), true, NULL, NOW()
WHERE NOT EXISTS (SELECT 1 FROM platform_landing_config);
