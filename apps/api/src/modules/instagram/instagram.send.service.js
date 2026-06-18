const {
  resolveConnectionAccessToken,
  describeAccessToken,
  detectWrongInstagramLoginToken,
} = require("../channels/channelTokenResolve");

const DEFAULT_GRAPH_VERSION = "v21.0";

function resolveGraphApiVersion() {
  return String(process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION).trim();
}

/**
 * @param {{
 *   pageId: string,
 *   recipientIgsid: string,
 *   text: string,
 *   accessToken: string
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramTextMessage({
  pageId,
  recipientIgsid,
  text,
  accessToken,
}) {
  const body = String(text || "").trim();
  if (!body) {
    return { ok: false, error: "empty_text" };
  }
  const normalizedPageId = String(pageId || "").trim();
  const normalizedRecipientIgsid = String(recipientIgsid || "").trim();
  const normalizedAccessToken = String(accessToken || "").trim();

  if (!normalizedRecipientIgsid) {
    return { ok: false, error: "missing_recipient_igsid" };
  }
  if (!normalizedAccessToken) {
    return { ok: false, error: "missing_access_token" };
  }

  const wrongTokenType = detectWrongInstagramLoginToken(normalizedAccessToken);
  if (wrongTokenType) {
    return { ok: false, error: wrongTokenType };
  }

  const version = resolveGraphApiVersion();
  const tokenInfo = describeAccessToken(normalizedAccessToken);
  if (!tokenInfo.looksValid) {
    return {
      ok: false,
      error: `invalid_page_access_token_shape len=${tokenInfo.length} prefix=${tokenInfo.prefix}`,
    };
  }

  // Meta docs: Page access token + /me/messages avoids page-id path mismatches.
  const url = `https://graph.facebook.com/${version}/me/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${normalizedAccessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "instagram",
      recipient: { id: normalizedRecipientIgsid },
      message: { text: body },
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `graph_http_${res.status}`;
    console.warn("[instagram-send] graph error", {
      pageId: normalizedPageId || null,
      recipientIgsid: normalizedRecipientIgsid,
      token: tokenInfo,
      graph: {
        message: data?.error?.message || null,
        type: data?.error?.type || null,
        code: data?.error?.code ?? null,
        error_subcode: data?.error?.error_subcode ?? null,
        fbtrace_id: data?.error?.fbtrace_id || null,
      },
    });
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
    accessToken = resolveConnectionAccessToken(connection.access_token_enc);
  } catch (err) {
    return {
      ok: false,
      error: `token_resolve_failed: ${err?.message || err}`,
    };
  }

  return sendInstagramTextMessage({
    pageId: connection.platform_page_id,
    recipientIgsid,
    text,
    accessToken,
  });
}

module.exports = {
  sendInstagramTextMessage,
  sendInstagramTextWithEncryptedToken,
};
