/**
 * Diagnose Instagram channel connection + Page access token on the server.
 *
 * Usage:
 *   node scripts/verify-instagram-channel.js --store-id=1
 *   node scripts/verify-instagram-channel.js --store-id=1 --recipient=IGSID
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", "..", ".env") });
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const { db } = require("../src/db/client");
const {
  resolveConnectionAccessToken,
  describeAccessToken,
} = require("../src/modules/channels/channelTokenResolve");
const { sendInstagramTextMessage } = require("../src/modules/instagram/instagram.send.service");

function readArg(name) {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length).trim() : "";
}

async function graphGet(path, accessToken) {
  const version = String(process.env.META_GRAPH_API_VERSION || "v21.0").trim();
  const res = await fetch(`https://graph.facebook.com/${version}/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  const storeId = Number(readArg("store-id") || "1");
  const recipient = readArg("recipient");

  const row = db
    .prepare(
      `
        SELECT
          id,
          store_id,
          platform_page_id,
          platform_instagram_id,
          page_name,
          access_token_enc,
          status
        FROM channel_connections
        WHERE store_id = ? AND platform = 'instagram'
        LIMIT 1
      `
    )
    .get(storeId);

  if (!row) {
    console.error(`No instagram channel_connections row for store_id=${storeId}`);
    process.exit(1);
  }

  console.log("Connection row:", {
    id: row.id,
    status: row.status,
    page_name: row.page_name,
    platform_page_id: row.platform_page_id,
    platform_instagram_id: row.platform_instagram_id,
    access_token_enc_prefix: String(row.access_token_enc || "").slice(0, 12),
    access_token_enc_length: String(row.access_token_enc || "").length,
  });

  let accessToken;
  try {
    accessToken = resolveConnectionAccessToken(row.access_token_enc);
  } catch (err) {
    console.error("Token resolve failed:", err?.message || err);
    process.exit(1);
  }

  const tokenInfo = describeAccessToken(accessToken);
  console.log("Resolved token:", tokenInfo);

  const me = await graphGet("me?fields=id,name", accessToken);
  console.log("GET /me:", me);

  const page = await graphGet(
    `${row.platform_page_id}?fields=id,name,instagram_business_account`,
    accessToken
  );
  console.log("GET /{platform_page_id}:", page);

  const ig = await graphGet(
    `${row.platform_instagram_id}?fields=id,username`,
    accessToken
  );
  console.log("GET /{platform_instagram_id}:", ig);

  if (recipient) {
    const send = await sendInstagramTextMessage({
      pageId: row.platform_page_id,
      recipientIgsid: recipient,
      text: "ShopIQ verify script ping",
      accessToken,
    });
    console.log("Test send:", send);
  } else {
    console.log("Skipped test send (pass --recipient=IGSID to try one message).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
