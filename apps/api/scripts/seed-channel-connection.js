/**
 * Manual seed for testing Instagram DM webhook → channel_* wiring (4A).
 *
 * Usage:
 *   CHANNEL_TOKEN_ENCRYPTION_KEY=... node scripts/seed-channel-connection.js \
 *     --store-id=1 --page-id=PAGE_ID --ig-id=IG_BUSINESS_ID --token=PAGE_ACCESS_TOKEN
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", "..", ".env") });

const { db } = require("../src/db/client");
const { encryptChannelToken } = require("../src/modules/channels/channelTokenCrypto");

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

const storeId = Number(readArg("store-id"));
const pageId = readArg("page-id");
const igId = readArg("ig-id");
const token = readArg("token");
const pageName = readArg("page-name") || "Instagram test";

if (!Number.isFinite(storeId) || storeId <= 0) {
  console.error("Missing or invalid --store-id");
  process.exit(1);
}
if (!pageId || !igId || !token) {
  console.error("Required: --page-id, --ig-id, --token");
  process.exit(1);
}

const store = db.prepare("SELECT id FROM stores WHERE id = ?").get(storeId);
if (!store) {
  console.error(`Store id=${storeId} not found. Run npm run db:seed-demo first.`);
  process.exit(1);
}

const accessTokenEnc = encryptChannelToken(token);

const existing = db
  .prepare(
    `
      SELECT id
      FROM channel_connections
      WHERE store_id = ? AND platform = 'instagram'
    `
  )
  .get(storeId);

if (existing) {
  db.prepare(
    `
      UPDATE channel_connections
      SET
        platform_page_id = ?,
        platform_instagram_id = ?,
        page_name = ?,
        access_token_enc = ?,
        status = 'active',
        webhook_subscribed = 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(pageId, igId, pageName, accessTokenEnc, existing.id);

  console.log(`Updated channel_connections id=${existing.id} for store_id=${storeId}`);
} else {
  const result = db
    .prepare(
      `
        INSERT INTO channel_connections (
          store_id,
          platform,
          platform_page_id,
          platform_instagram_id,
          page_name,
          access_token_enc,
          webhook_subscribed,
          status
        )
        VALUES (?, 'instagram', ?, ?, ?, ?, 1, 'active')
      `
    )
    .run(storeId, pageId, igId, pageName, accessTokenEnc);

  console.log(
    `Created channel_connections id=${result.lastInsertRowid} for store_id=${storeId}`
  );
}

console.log("Recipient lookup ids:", { pageId, igId });
