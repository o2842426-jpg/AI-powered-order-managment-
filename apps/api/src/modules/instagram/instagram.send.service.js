const { decryptChannelToken } = require("../channels/channelTokenCrypto");

const DEFAULT_GRAPH_VERSION = "v21.0";

function resolveGraphApiVersion() {
  return String(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim();
}

/**
 * @param {{
 *   instagramBusinessId: string,
 *   recipientIgsid: string,
 *   text: string,
 *   accessToken: string
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramTextMessage({
  instagramBusinessId,
  recipientIgsid,
  text,
  accessToken,
}) {
  const body = String(text || "").trim();
  if (!body) {
    return { ok: false, error: "empty_text" };
  }

  const version = resolveGraphApiVersion();
  const url = `https://graph.facebook.com/${version}/${instagramBusinessId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: String(recipientIgsid) },
      message: { text: body },
      access_token: accessToken,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `graph_http_${res.status}`;
    return { ok: false, error: String(err), status: res.status };
  }

  const messageId = data?.message_id != null ? String(data.message_id) : "";
  if (!messageId) {
    return { ok: false, error: "missing_message_id" };
  }

  return { ok: true, messageId };
}

/**
 * Decrypt channel_connections.access_token_enc in memory, then send DM text.
 *
 * @param {{
 *   connection: { platform_instagram_id: string, access_token_enc: string },
 *   recipientIgsid: string,
 *   text: string
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramTextWithEncryptedToken({
  connection,
  recipientIgsid,
  text,
}) {
  let accessToken;
  try {
    accessToken = decryptChannelToken(connection.access_token_enc);
  } catch (err) {
    return {
      ok: false,
      error: `token_decrypt_failed: ${err?.message || err}`,
    };
  }

  return sendInstagramTextMessage({
    instagramBusinessId: connection.platform_instagram_id,
    recipientIgsid,
    text,
    accessToken,
  });
}

module.exports = {
  sendInstagramTextMessage,
  sendInstagramTextWithEncryptedToken,
};
