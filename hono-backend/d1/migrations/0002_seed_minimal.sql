-- Seed minimal (samakan dengan Postgres). Pakai INSERT OR REPLACE agar idempotent.

INSERT OR REPLACE INTO pricing_packages (
  id, name, price_per_student, min_students, features, is_active,
  flipbook_enabled, ai_labs_features, is_popular
) VALUES
  ('basic', 'Paket Basic', 85000, 100,
   '["Cover standar","24 halaman","Foto kelas + individu","Soft copy"]', 1, 0, '[]', 0),
  ('standard', 'Paket Standard', 120000, 100,
   '["Cover pilihan","32 halaman","Foto kelas + individu","Soft copy","Konsultasi 1x"]', 1, 0, '[]', 0),
  ('premium', 'Paket Premium', 165000, 80,
   '["Cover custom","40 halaman","Semua foto + layout eksklusif","Soft copy + hard cover","Konsultasi 2x"]', 1, 1,
   '["tryon","pose","photogroup","phototovideo","image_remove_bg"]', 1);

-- ID tetap (ganti jika Anda punya UUID pasti dari Supabase)
INSERT OR REPLACE INTO ai_feature_pricing (id, feature_slug, credits_per_use, credits_per_unlock)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'tryon', 1, 30),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'pose', 1, 30),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'photogroup', 1, 20),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'phototovideo', 1, 20),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'image_remove_bg', 1, 10),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'flipbook_unlock', 0, 50),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa7', 'enhance', 1, 30);

INSERT OR REPLACE INTO credit_packages (id, name, credits, price, popular)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', NULL, 50, 50000, 0),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', NULL, 100, 90000, 1);
