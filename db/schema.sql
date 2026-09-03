CREATE TABLE IF NOT EXISTS branches (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT,
  province TEXT,
  lat REAL,
  lng REAL
);

CREATE TABLE IF NOT EXISTS hotels (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  province TEXT,
  district TEXT,
  lat REAL,
  lng REAL,
  map_link TEXT,
  price_per_night INTEGER,
  on_choowap INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teams (
  code TEXT PRIMARY KEY,
  name TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  nickname TEXT,
  team_code TEXT,
  gender TEXT,
  phone TEXT,
  home_lat REAL,
  home_lng REAL
);

-- ผู้อนุมัติ 2 สาย: ตั้งค่าเองตรงนี้ (config เล็กๆ ไม่ต้องมีหน้าจอแก้ไข ตาม PRD)
CREATE TABLE IF NOT EXISTS approvers (
  employee_code TEXT PRIMARY KEY,
  team_category TEXT NOT NULL CHECK(team_category IN ('activity','setup')),
  display_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_category TEXT NOT NULL CHECK(team_category IN ('activity','setup')),
  mission_type TEXT NOT NULL,
  mission_note TEXT,
  team_code TEXT,
  branch_code TEXT NOT NULL REFERENCES branches(code),
  checkin_date TEXT NOT NULL,
  checkout_date TEXT NOT NULL,
  hotel_code TEXT REFERENCES hotels(code),
  far_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','done')),
  reject_reason TEXT,
  confirmation_no TEXT,
  created_by TEXT NOT NULL REFERENCES staff(code),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by TEXT,
  approved_at TEXT,
  done_by TEXT,
  done_at TEXT
);

CREATE TABLE IF NOT EXISTS request_guests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  employee_code TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  gender TEXT
);
