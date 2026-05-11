const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { migrate } = require("./migrate");

const dbPath = process.env.SQLITE_PATH
  ? path.resolve(process.env.SQLITE_PATH)
  : path.join(__dirname, "dev.sqlite");

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// Good default for SQLite relations in this project.
db.pragma("foreign_keys = ON");

// Apply schema / pending migrations whenever the API loads (fixes missing columns after git pull).
migrate(db);

module.exports = { db, dbPath };
