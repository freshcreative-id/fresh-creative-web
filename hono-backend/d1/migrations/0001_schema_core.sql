-- D1 (SQLite) — struktur bisnis tunggal (greenfield, tanpa impor data lama).
-- UUID → TEXT. Tanpa RLS di DB — akses lewat Worker + Firebase ID token.
-- Urutan migrasi: lihat hono-backend/d1/README.md

-- =============================================================================
-- Users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  full_name TEXT,
  credits INTEGER DEFAULT 0,
  is_suspended INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended);

CREATE TABLE IF NOT EXISTS login_otps (
  user_id TEXT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_otps_expires_at ON login_otps(expires_at);

-- =============================================================================
-- Referensi wilayah (seed bisa dari export CSV / 0001_ref_indonesia_wilayah)
-- =============================================================================
CREATE TABLE IF NOT EXISTS ref_provinces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ref_cities (
  id TEXT PRIMARY KEY NOT NULL,
  province_id TEXT NOT NULL REFERENCES ref_provinces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'kota' CHECK (kind IN ('kota', 'kabupaten')),
  name_lower TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ref_cities_province_id ON ref_cities(province_id);

-- =============================================================================
-- Pricing & kredit
-- =============================================================================
CREATE TABLE IF NOT EXISTS pricing_packages (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  price_per_student INTEGER NOT NULL,
  min_students INTEGER NOT NULL,
  features TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  flipbook_enabled INTEGER NOT NULL DEFAULT 0,
  ai_labs_features TEXT NOT NULL DEFAULT '[]',
  is_popular INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_packages (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  credits INTEGER NOT NULL,
  price INTEGER NOT NULL,
  popular INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- Albums & relasi
-- =============================================================================
CREATE TABLE IF NOT EXISTS albums (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('public', 'yearbook')),
  status TEXT CHECK (status IN ('pending', 'approved', 'declined')),
  pricing_package_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  cover_image_url TEXT,
  cover_image_position TEXT,
  cover_video_url TEXT,
  description TEXT,
  school_city TEXT,
  kab_kota TEXT,
  wa_e164 TEXT,
  province_id TEXT,
  province_name TEXT,
  pic_name TEXT,
  students_count INTEGER,
  source TEXT,
  total_estimated_price INTEGER,
  student_invite_token TEXT,
  student_invite_expires_at TEXT,
  flipbook_mode TEXT DEFAULT 'manual',
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  payment_url TEXT,
  individual_payments_enabled INTEGER DEFAULT 1,
  package_snapshot TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_type ON albums(type);
CREATE INDEX IF NOT EXISTS idx_albums_student_invite_token ON albums(student_invite_token);

CREATE TABLE IF NOT EXISTS album_members (
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  PRIMARY KEY (album_id, user_id)
);

CREATE TABLE IF NOT EXISTS album_classes (
  id TEXT PRIMARY KEY NOT NULL,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  password_hash TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  batch_photo_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE (album_id, name)
);
CREATE INDEX IF NOT EXISTS idx_album_classes_album_id ON album_classes(album_id);

CREATE TABLE IF NOT EXISTS album_class_access (
  id TEXT PRIMARY KEY NOT NULL,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES album_classes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  email TEXT,
  instagram TEXT,
  message TEXT,
  date_of_birth TEXT,
  video_url TEXT,
  photos TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  has_paid INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid')),
  payment_transaction_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE (class_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_album_class_access_user_id ON album_class_access(user_id);
CREATE INDEX IF NOT EXISTS idx_album_class_access_class_id ON album_class_access(class_id);

CREATE TABLE IF NOT EXISTS album_teachers (
  id TEXT PRIMARY KEY NOT NULL,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  message TEXT,
  photo_url TEXT,
  video_url TEXT,
  bio TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_album_teachers_album_id ON album_teachers(album_id);

CREATE TABLE IF NOT EXISTS album_teacher_photos (
  id TEXT PRIMARY KEY NOT NULL,
  teacher_id TEXT NOT NULL REFERENCES album_teachers(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_album_teacher_photos_teacher_id ON album_teacher_photos(teacher_id);

CREATE TABLE IF NOT EXISTS album_join_requests (
  id TEXT PRIMARY KEY NOT NULL,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  class_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  assigned_class_id TEXT REFERENCES album_classes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_at TEXT,
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  rejected_reason TEXT,
  UNIQUE (album_id, email)
);
CREATE INDEX IF NOT EXISTS idx_album_join_requests_album_id ON album_join_requests(album_id);
CREATE INDEX IF NOT EXISTS idx_album_join_requests_user_id ON album_join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_album_join_requests_status ON album_join_requests(album_id, status);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  action_url TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

CREATE TABLE IF NOT EXISTS manual_flipbook_pages (
  id TEXT PRIMARY KEY NOT NULL,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  width REAL,
  height REAL,
  page_slot TEXT NOT NULL DEFAULT 'body',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS flipbook_video_hotspots (
  id TEXT PRIMARY KEY NOT NULL,
  page_id TEXT NOT NULL REFERENCES manual_flipbook_pages(id) ON DELETE CASCADE,
  video_url TEXT,
  label TEXT,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL UNIQUE,
  package_id TEXT REFERENCES credit_packages(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'SETTLED', 'EXPIRED', 'FAILED')),
  invoice_url TEXT,
  payment_method TEXT,
  paid_at TEXT,
  description TEXT,
  new_students_count INTEGER,
  album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
  access_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);
CREATE INDEX IF NOT EXISTS idx_transactions_album_id ON transactions(album_id);

CREATE TABLE IF NOT EXISTS ai_feature_pricing (
  id TEXT PRIMARY KEY NOT NULL,
  feature_slug TEXT NOT NULL UNIQUE,
  credits_per_use INTEGER NOT NULL DEFAULT 0,
  credits_per_unlock INTEGER NOT NULL DEFAULT 0,
  duration_credits_json TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feature_unlocks (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  album_id TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  feature_type TEXT NOT NULL,
  credits_spent INTEGER NOT NULL DEFAULT 0,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, album_id, feature_type)
);

CREATE TABLE IF NOT EXISTS redeem_codes (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  credits INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS redeem_history (
  id TEXT PRIMARY KEY NOT NULL,
  redeem_code_id TEXT NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits_received INTEGER NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (redeem_code_id, user_id)
);


-- =============================================================================
-- =============================================================================
-- Site Settings
-- =============================================================================
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL DEFAULT '{}'
);

INSERT OR REPLACE INTO site_settings (key, value)
VALUES
  ('showcase', '{"albumPreviews":[],"flipbookPreviewUrl":""}'),
  ('fonnte_config', '{"target":""}');

-- =============================================================================
-- Performance & Hot-path Indexes
-- =============================================================================
-- Frequent filters in /api/albums/:id and /api/albums/:id/all-class-members
CREATE INDEX IF NOT EXISTS idx_album_class_access_album_id ON album_class_access(album_id);
CREATE INDEX IF NOT EXISTS idx_album_class_access_album_class ON album_class_access(album_id, class_id);
CREATE INDEX IF NOT EXISTS idx_album_class_access_album_status ON album_class_access(album_id, status);
CREATE INDEX IF NOT EXISTS idx_album_class_access_album_user_status ON album_class_access(album_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_album_class_access_album_class_student ON album_class_access(album_id, class_id, student_name);
-- Frequent lookups in /api/albums/:id/unlock-feature
CREATE INDEX IF NOT EXISTS idx_feature_unlocks_user_album_feature ON feature_unlocks(user_id, album_id, feature_type);
CREATE INDEX IF NOT EXISTS idx_feature_unlocks_album_feature ON feature_unlocks(album_id, feature_type);
-- Frequent lookups in /api/albums/:id/flipbook
CREATE INDEX IF NOT EXISTS idx_manual_flipbook_pages_album_page ON manual_flipbook_pages(album_id, page_number);
CREATE INDEX IF NOT EXISTS idx_flipbook_video_hotspots_page_id ON flipbook_video_hotspots(page_id);
-- Access checks used in multiple album admin endpoints
CREATE INDEX IF NOT EXISTS idx_album_members_album_user ON album_members(album_id, user_id);
CREATE INDEX IF NOT EXISTS idx_album_members_album_user_role ON album_members(album_id, user_id, role);
-- Hot-path indexes for frequently hit API endpoints.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_album_members_user_album ON album_members(user_id, album_id);
CREATE INDEX IF NOT EXISTS idx_album_class_access_user_status_album ON album_class_access(user_id, status, album_id);
