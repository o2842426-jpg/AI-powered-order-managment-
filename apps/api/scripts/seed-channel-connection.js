/**
 * Manual seed for testing Instagram DM webhook → channel_* wiring (4A).
 *
 * Usage:
 *   CHANNEL_TOKEN_ENCRYPTION_KEY=... node scripts/seed-channel-connection.js \
 *     --store-id=1 --page-id=PAGE_ID --ig-id=IG_BUSINESS_ID --token=PAGE_ACCESS_TOKEN
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", "..", ".env") });
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { db } = require("../src/db/client");
const {
  encryptChannelToken,
  decryptChannelToken,
} = require("../src/modules/channels/channelTokenCrypto");
const { normalizeMetaAccessToken } = require("../src/modules/channels/channelTokenResolve");

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

const storeId = Number(readArg("store-id"));
const pageId = readArg("page-id");
const igId = readArg("ig-id");
const token = normalizeMetaAccessToken(readArg("token"));
const pageName = readArg("page-name") || "Instagram test";

if (!Number.isFinite(storeId) || storeId <= 0) {
  console.error("Missing or invalid --store-id");
  process.exit(1);
}
if (!pageId || !igId || !token) {
  console.error("Required: --page-id, --ig-id, --token");
  process.exit(1);
}
if (!token.startsWith("EAA")) {
  console.error("Token does not look like a Meta Page access token (expected prefix EAA).");
  process.exit(1);
}
if (token.startsWith("IGAA")) {
  console.error("Instagram Login tokens (IGAA...) cannot send DMs. Use a Page access token (EAA...).");
  process.exit(1);
}

const encryptionKey = String(process.env.CHANNEL_TOKEN_ENCRYPTION_KEY || "").trim();
if (!encryptionKey) {
  console.error("CHANNEL_TOKEN_ENCRYPTION_KEY is missing. Load .env before running this script.");
  process.exit(1);
}
if (/paste-real-key-from-env/i.test(encryptionKey)) {
  console.error("CHANNEL_TOKEN_ENCRYPTION_KEY is still a placeholder. Use the real key from .env.");
  process.exit(1);
}

console.log("Seed input:", {
  storeId,
  pageId,
  igId,
  tokenPrefix: token.slice(0, 6),
  tokenLength: token.length,
  encryptionKeyLength: encryptionKey.length,
});

const store = db.prepare("SELECT id FROM stores WHERE id = ?").get(storeId);
if (!store) {
  console.error(`Store id=${storeId} not found. Run npm run db:seed-demo first.`);
  process.exit(1);
}

const accessTokenEnc = encryptChannelToken(token);
const roundtrip = decryptChannelToken(accessTokenEnc).trim();
if (roundtrip !== token) {
  console.error("Encrypt/decrypt roundtrip failed in this process. Aborting before DB write.");
  process.exit(1);
}

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

const saved = db
  .prepare(
    `
      SELECT
        id,
        substr(access_token_enc, 1, 16) AS enc_prefix,
        length(access_token_enc) AS enc_len
      FROM channel_connections
      WHERE store_id = ? AND platform = 'instagram'
    `
  )
  .get(storeId);

const savedToken = decryptChannelToken(
  db
    .prepare(
      "SELECT access_token_enc FROM channel_connections WHERE store_id = ? AND platform = 'instagram'"
    )
    .get(storeId).access_token_enc
).trim();

console.log("Saved connection:", saved);
console.log("Saved token check:", {
  prefix: savedToken.slice(0, 6),
  length: savedToken.length,
  startsWithEAA: savedToken.startsWith("EAA"),
  matchesInput: savedToken === token,
});
