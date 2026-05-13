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
  ensureStoreSubscriptionColumns(db);
  ensureProductImageColumns(db);
  ensureProductVariantActiveColumns(db);
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

module.exports = { migrate };
