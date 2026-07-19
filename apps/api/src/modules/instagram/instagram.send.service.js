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
 *   accessToken: string,
 *   message: object
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramApiMessage({
  pageId,
  recipientIgsid,
  accessToken,
  message,
}) {
  const normalizedPageId = String(pageId || "").trim();
  const normalizedRecipientIgsid = String(recipientIgsid || "").trim();
  const normalizedAccessToken = String(accessToken || "").trim();

  if (!normalizedRecipientIgsid) {
    return { ok: false, error: "missing_recipient_igsid" };
  }
  if (!normalizedAccessToken) {
    return { ok: false, error: "missing_access_token" };
  }
  if (!message || typeof message !== "object") {
    return { ok: false, error: "missing_message" };
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
      message,
    }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err =
      data?.error?.message ||
      data?.error?.error_user_msg ||
      `graph_http_${res.status}`;
    const errorCode = data?.error?.code ?? null;
    const errorSubcode = data?.error?.error_subcode ?? null;
    const tokenInvalidated =
      Number(errorCode) === 190 || Number(errorCode) === 102;
    console.warn("[instagram-send] graph error", {
      pageId: normalizedPageId || null,
      recipientIgsid: normalizedRecipientIgsid,
      token: tokenInfo,
      graph: {
        message: data?.error?.message || null,
        type: data?.error?.type || null,
        code: errorCode,
        error_subcode: errorSubcode,
        fbtrace_id: data?.error?.fbtrace_id || null,
      },
    });
    if (tokenInvalidated) {
      console.error(
        `[instagram-send] ⚠️ ACCESS TOKEN INVALID (code=${errorCode} subcode=${errorSubcode}) pageId=${normalizedPageId || "?"} — outbound replies will keep failing. ACTION: reconnect Instagram from the store dashboard (Settings → ربط إنستغرام) to refresh the token.`
      );
    }
    return {
      ok: false,
      error: String(err),
      status: res.status,
      tokenInvalidated,
    };
  }

  const messageId = data?.message_id != null ? String(data.message_id) : "";
  if (!messageId) {
    return { ok: false, error: "missing_message_id" };
  }

  return { ok: true, messageId };
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

  return sendInstagramApiMessage({
    pageId,
    recipientIgsid,
    accessToken,
    message: { text: body },
  });
}

/**
 * @param {{
 *   pageId: string,
 *   recipientIgsid: string,
 *   imageUrls: string[],
 *   accessToken: string
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramImagesMessage({
  pageId,
  recipientIgsid,
  imageUrls,
  accessToken,
}) {
  const urls = (imageUrls || [])
    .map((url) => String(url || "").trim())
    .filter((url) => /^https:\/\//i.test(url));

  if (!urls.length) {
    return { ok: false, error: "no_images" };
  }

  if (urls.length > 1) {
    const batchResult = await sendInstagramApiMessage({
      pageId,
      recipientIgsid,
      accessToken,
      message: {
        attachments: urls.map((url) => ({
          type: "image",
          payload: { url, is_reusable: true },
        })),
      },
    });
    if (batchResult.ok) {
      return batchResult;
    }
    console.warn(
      `[instagram-send] batch image send failed (${batchResult.error}), retrying one-by-one`
    );
  }

  let lastMessageId = "";
  for (const url of urls) {
    const result = await sendInstagramApiMessage({
      pageId,
      recipientIgsid,
      accessToken,
      message: {
        attachment: {
          type: "image",
          payload: { url, is_reusable: true },
        },
      },
    });
    if (!result.ok) {
      return result;
    }
    lastMessageId = result.messageId;
  }

  return { ok: true, messageId: lastMessageId };
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

/**
 * @param {{
 *   connection: { platform_page_id: string, access_token_enc: string },
 *   recipientIgsid: string,
 *   imageUrls: string[]
 * }} input
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, error: string, status?: number }>}
 */
async function sendInstagramImagesWithEncryptedToken({
  connection,
  recipientIgsid,
  imageUrls,
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

  return sendInstagramImagesMessage({
    pageId: connection.platform_page_id,
    recipientIgsid,
    imageUrls,
    accessToken,
  });
}

module.exports = {
  sendInstagramApiMessage,
  sendInstagramTextMessage,
  sendInstagramImagesMessage,
  sendInstagramTextWithEncryptedToken,
  sendInstagramImagesWithEncryptedToken,
};
