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
  ensureWebhookEventsTable(db);
  ensureChannelTables(db);
  ensureChannelOrderStateColumns(db);
  ensureProductImagesTable(db);
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

function ensureWebhookEventsTable(db) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'webhook_events'"
    )
    .get();
  if (row) return;
  db.exec(`
    CREATE TABLE webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'message',
      store_id INTEGER,
      processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      raw_payload TEXT,
      error TEXT,
      UNIQUE(platform, event_id)
    );
    CREATE INDEX idx_webhook_events_platform_processed
      ON webhook_events(platform, processed_at);
  `);
}

function ensureChannelTables(db) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'channel_connections'"
    )
    .get();
  if (row) return;

  db.exec(`
    CREATE TABLE channel_connections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      platform_page_id TEXT NOT NULL,
      platform_instagram_id TEXT NOT NULL,
      page_name TEXT,
      access_token_enc TEXT NOT NULL,
      token_expires_at TEXT,
      webhook_subscribed INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      metadata TEXT,
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(store_id, platform),
      UNIQUE(platform, platform_instagram_id),
      CHECK (webhook_subscribed IN (0, 1)),
      CHECK (status IN ('active', 'revoked', 'error'))
    );
    CREATE INDEX idx_channel_connections_page
      ON channel_connections(platform_page_id);
    CREATE INDEX idx_channel_connections_ig
      ON channel_connections(platform_instagram_id);
    CREATE INDEX idx_channel_connections_store
      ON channel_connections(store_id, platform);

    CREATE TABLE channel_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      store_id INTEGER NOT NULL,
      channel_connection_id INTEGER NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      platform_thread_id TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      platform_username TEXT,
      customer_id INTEGER,
      owner_takeover INTEGER NOT NULL DEFAULT 0,
      lead_score INTEGER,
      lead_score_reason TEXT,
      lead_scored_at TEXT,
      last_message_at TEXT,
      last_customer_message_at TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      UNIQUE(store_id, platform, platform_thread_id),
      CHECK (owner_takeover IN (0, 1)),
      CHECK (status IN ('open', 'archived'))
    );
    CREATE INDEX idx_channel_conversations_store_last
      ON channel_conversations(store_id, last_message_at);
    CREATE INDEX idx_channel_conversations_connection
      ON channel_conversations(channel_connection_id);

    CREATE TABLE channel_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      store_id INTEGER NOT NULL,
      platform TEXT NOT NULL DEFAULT 'instagram',
      direction TEXT NOT NULL,
      sender_type TEXT NOT NULL,
      external_message_id TEXT,
      message_type TEXT NOT NULL DEFAULT 'text',
      body_text TEXT NOT NULL,
      payload TEXT,
      delivery_status TEXT NOT NULL DEFAULT 'received',
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES channel_conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
      UNIQUE(platform, external_message_id),
      CHECK (direction IN ('inbound', 'outbound')),
      CHECK (sender_type IN ('customer', 'ai', 'owner', 'system')),
      CHECK (delivery_status IN ('received', 'sent', 'failed'))
    );
    CREATE INDEX idx_channel_messages_conversation_created
      ON channel_messages(conversation_id, created_at);
    CREATE INDEX idx_channel_messages_store_created
      ON channel_messages(store_id, created_at);
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

function ensureChannelOrderStateColumns(db) {
  const columns = db.prepare("PRAGMA table_info(channel_conversations)").all();
  const names = new Set(columns.map((c) => c.name));

  const additions = [
    ["order_state", "TEXT NOT NULL DEFAULT 'AWAITING_PRODUCT'"],
    ["order_product_id", "INTEGER"],
    ["order_product_name", "TEXT"],
    ["customer_city", "TEXT"],
    ["customer_phone", "TEXT"],
    ["customer_name", "TEXT"],
    ["customer_address", "TEXT"],
    ["payment_method", "TEXT"],
    ["buy_committed", "INTEGER NOT NULL DEFAULT 0"],
    ["linked_order_id", "INTEGER"],
  ];

  for (const [name, ddl] of additions) {
    if (!names.has(name)) {
      db.exec(`ALTER TABLE channel_conversations ADD COLUMN ${name} ${ddl}`);
    }
  }
}

function ensureProductImagesTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_product_images_product
      ON product_images(product_id, sort_order);
  `);
}

module.exports = { migrate };
