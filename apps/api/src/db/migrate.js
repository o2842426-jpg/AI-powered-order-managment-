const fs = require("fs");
const path = require("path");

/**
 * Apply schema + safe column additions. Safe to run on every API startup.
 */
function migrate(db) {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schemaSql = fs.readFileSync(schemaPath, "utf8");
  db.exec(schemaSql);
  ensureStoreSettingsColumns(db);
  ensureStoreCurrencyColumn(db);
  ensureStorePlanUsageColumns(db);
  ensureStoreSubscriptionColumns(db);
  ensureProductImageColumns(db);
  ensureProductVariantActiveColumns(db);
  ensureChatMessagePayloadColumn(db);
  ensureChatSessionOwnerTakeoverColumn(db);
  ensureStoreMemoryFactsTable(db);
  ensureStoreAiFollowupsTable(db);
  ensureChatFollowupTasksTable(db);
  ensureChatSessionLeadScoreColumns(db);
}

function ensureStoreSettingsColumns(db) {
  const columns = db.prepare("PRAGMA table_info(stores)").all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("ai_prompt")) {
    db.exec("ALTER TABLE stores ADD COLUMN ai_prompt TEXT");
  }
  if (!columnNames.has("logo_url")) {
    db.exec("ALTER TABLE stores ADD COLUMN logo_url TEXT");
  }
  if (!columnNames.has("theme_color")) {
    db.exec("ALTER TABLE stores ADD COLUMN theme_color TEXT");
  }
  if (!columnNames.has("accent_color")) {
    db.exec("ALTER TABLE stores ADD COLUMN accent_color TEXT");
  }
  if (!columnNames.has("policy_text")) {
    db.exec("ALTER TABLE stores ADD COLUMN policy_text TEXT");
  }
}

function ensureStoreCurrencyColumn(db) {
  const columns = db.prepare("PRAGMA table_info(stores)").all();
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("currency_code")) {
    db.exec(
      "ALTER TABLE stores ADD COLUMN currency_code TEXT DEFAULT 'SAR'"
    );
  }
  db.prepare(
    "UPDATE stores SET currency_code = 'SAR' WHERE currency_code IS NULL OR TRIM(currency_code) = ''"
  ).run();
}

function ensureStorePlanUsageColumns(db) {
  const columns = db.prepare("PRAGMA table_info(stores)").all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("plan_tier")) {
    db.exec("ALTER TABLE stores ADD COLUMN plan_tier TEXT DEFAULT 'trial'");
  }
  if (!columnNames.has("stripe_price_id")) {
    db.exec("ALTER TABLE stores ADD COLUMN stripe_price_id TEXT");
  }
  if (!columnNames.has("ai_messages_used")) {
    db.exec(
      "ALTER TABLE stores ADD COLUMN ai_messages_used INTEGER NOT NULL DEFAULT 0"
    );
  }
  if (!columnNames.has("ai_messages_period_ym")) {
    db.exec("ALTER TABLE stores ADD COLUMN ai_messages_period_ym TEXT");
  }

  const ym = new Date().toISOString().slice(0, 7);
  db.prepare(
    `
      UPDATE stores
      SET plan_tier = 'trial'
      WHERE plan_tier IS NULL OR TRIM(plan_tier) = ''
    `
  ).run();
  db.prepare(
    `
      UPDATE stores
      SET ai_messages_period_ym = ?
      WHERE ai_messages_period_ym IS NULL OR TRIM(ai_messages_period_ym) = ''
    `
  ).run(ym);
}

function ensureStoreSubscriptionColumns(db) {
  const columns = db.prepare("PRAGMA table_info(stores)").all();
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has("subscription_status")) {
    db.exec(
      "ALTER TABLE stores ADD COLUMN subscription_status TEXT DEFAULT 'active'"
    );
  }
  if (!columnNames.has("stripe_customer_id")) {
    db.exec("ALTER TABLE stores ADD COLUMN stripe_customer_id TEXT");
  }
  if (!columnNames.has("stripe_subscription_id")) {
    db.exec("ALTER TABLE stores ADD COLUMN stripe_subscription_id TEXT");
  }
  if (!columnNames.has("subscription_current_period_end")) {
    db.exec(
      "ALTER TABLE stores ADD COLUMN subscription_current_period_end TEXT"
    );
  }
  if (!columnNames.has("trial_started_at")) {
    db.exec("ALTER TABLE stores ADD COLUMN trial_started_at TEXT");
  }
  if (!columnNames.has("trial_ends_at")) {
    db.exec("ALTER TABLE stores ADD COLUMN trial_ends_at TEXT");
  }
}

function ensureProductImageColumns(db) {
  const columns = db.prepare("PRAGMA table_info(products)").all();
  const hasImageUrl = columns.some((column) => column.name === "image_url");
  if (!hasImageUrl) {
    db.exec("ALTER TABLE products ADD COLUMN image_url TEXT");
  }
}

function ensureProductVariantActiveColumns(db) {
  const columns = db.prepare("PRAGMA table_info(product_variants)").all();
  const hasIsActive = columns.some((column) => column.name === "is_active");
  if (!hasIsActive) {
    db.exec(
      "ALTER TABLE product_variants ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1"
    );
  }
}

function ensureChatMessagePayloadColumn(db) {
  const columns = db.prepare("PRAGMA table_info(chat_messages)").all();
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("payload")) {
    db.exec("ALTER TABLE chat_messages ADD COLUMN payload TEXT");
  }
}

function ensureChatSessionOwnerTakeoverColumn(db) {
  const columns = db.prepare("PRAGMA table_info(chat_sessions)").all();
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("owner_takeover")) {
    db.exec(
      "ALTER TABLE chat_sessions ADD COLUMN owner_takeover INTEGER NOT NULL DEFAULT 0"
    );
  }
}

function ensureStoreMemoryFactsTable(db) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'store_memory_facts'"
    )
    .get();
  if (row) return;
  db.exec(`
    CREATE TABLE store_memory_facts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      fact_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_store_memory_facts_store_id ON store_memory_facts(store_id);
  `);
}

function ensureStoreAiFollowupsTable(db) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'store_ai_followups'"
    )
    .get();
  if (row) return;
  db.exec(`
    CREATE TABLE store_ai_followups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      followup_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
    );
    CREATE INDEX idx_store_ai_followups_store_id ON store_ai_followups(store_id);
  `);
}

function ensureChatFollowupTasksTable(db) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'chat_followup_tasks'"
    )
    .get();
  if (row) return;
  db.exec(`
    CREATE TABLE chat_followup_tasks (
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
    CREATE INDEX idx_chat_followup_tasks_store_status ON chat_followup_tasks(store_id, status);
  `);
}

function ensureChatSessionLeadScoreColumns(db) {
  const columns = db.prepare("PRAGMA table_info(chat_sessions)").all();
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("lead_score")) {
    db.exec("ALTER TABLE chat_sessions ADD COLUMN lead_score INTEGER");
  }
  if (!names.has("lead_score_reason")) {
    db.exec("ALTER TABLE chat_sessions ADD COLUMN lead_score_reason TEXT");
  }
  if (!names.has("lead_scored_at")) {
    db.exec("ALTER TABLE chat_sessions ADD COLUMN lead_scored_at TEXT");
  }
}

module.exports = { migrate };
