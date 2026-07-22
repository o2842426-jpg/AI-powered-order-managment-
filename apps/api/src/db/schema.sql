-- DM Commerce - Simple SQLite Schema (MVP)
-- Keep this file simple and readable.

PRAGMA foreign_keys = ON;

-- 1) Stores
CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  phone TEXT,
  delivery_info TEXT,
  ai_prompt TEXT,
  logo_url TEXT,
  theme_color TEXT,
  accent_color TEXT,
  policy_text TEXT,
  currency_code TEXT DEFAULT 'SAR',
  store_vertical TEXT,
  reply_dialect TEXT,
  default_payment TEXT,
  sell_summary TEXT,
  subscription_status TEXT DEFAULT 'active',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  plan_tier TEXT DEFAULT 'trial',
  ai_messages_used INTEGER NOT NULL DEFAULT 0,
  ai_messages_period_ym TEXT,
  subscription_current_period_end TEXT,
  trial_started_at TEXT,
  trial_ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2) Users (store owners for now)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 3) Products
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  base_price REAL NOT NULL CHECK (base_price >= 0),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 4) Product variants (size/color/stock/optional price override)
CREATE TABLE IF NOT EXISTS product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  size TEXT,
  color TEXT,
  price REAL CHECK (price IS NULL OR price >= 0),
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  sku TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- 5) Customers (no account required in MVP)
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_text TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

-- 6) Orders
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  total_amount REAL NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  delivery_address TEXT,
  customer_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- 7) Order items
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  line_total REAL NOT NULL CHECK (line_total >= 0),
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL
);

-- 8) Chat sessions
CREATE TABLE IF NOT EXISTS chat_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  customer_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'web',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT,
  owner_takeover INTEGER NOT NULL DEFAULT 0,
  lead_score INTEGER,
  lead_score_reason TEXT,
  lead_scored_at TEXT,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- 9) Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  sender_type TEXT NOT NULL, -- customer | ai | owner
  message_text TEXT NOT NULL,
  intent TEXT,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

-- 10) Store memory facts (P5 — merged into public AI system prompt when plan allows)
CREATE TABLE IF NOT EXISTS store_memory_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  fact_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_memory_facts_store_id ON store_memory_facts(store_id);

-- 11) Store AI follow-up phrases (merged into public AI prompt when plan allows — `ai_followups`)
CREATE TABLE IF NOT EXISTS store_ai_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  followup_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_store_ai_followups_store_id ON store_ai_followups(store_id);

-- 12) Dashboard follow-up tasks (P7 — suggested owner actions; no outbound sends)
CREATE TABLE IF NOT EXISTS chat_followup_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL,
  session_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  last_customer_message_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE,
  UNIQUE(store_id, session_id),
  CHECK (status IN ('open', 'done', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_chat_followup_tasks_store_status ON chat_followup_tasks(store_id, status);
