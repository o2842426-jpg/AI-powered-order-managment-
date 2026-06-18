const { decryptChannelToken } = require("./channelTokenCrypto");

const VERSION_PREFIX = "v1";

/**
 * Strip shell/DB noise from a Meta access token string.
 *
 * @param {unknown} value
 * @returns {string}
 */
function normalizeMetaAccessToken(value) {
  let token = String(value || "").trim();
  if (!token) return "";

  if (token.toLowerCase().startsWith("bearer ")) {
    token = token.slice(7).trim();
  }

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  return token.replace(/\s+/g, "");
}

/**
 * Page Access Tokens for Messenger/Instagram DM send start with EAA.
 * Instagram Login tokens (IGAA...) are a different product and cannot send here.
 *
 * @param {string} token
 * @returns {boolean}
 */
function looksLikeMetaAccessToken(token) {
  const normalized = normalizeMetaAccessToken(token);
  return normalized.length >= 40 && normalized.startsWith("EAA");
}

/**
 * @param {string} token
 * @returns {string | null}
 */
function detectWrongInstagramLoginToken(token) {
  const normalized = normalizeMetaAccessToken(token);
  if (normalized.startsWith("IGAA")) {
    return "instagram_login_token_not_supported_for_dm_send_use_page_access_token";
  }
  return null;
}

/**
 * Resolve a Page access token from channel_connections.access_token_enc.
 * Supports encrypted v1.* blobs and plain Meta tokens (dev/manual seed).
 *
 * @param {string} stored
 * @returns {string}
 */
function resolveConnectionAccessToken(stored) {
  const raw = String(stored || "").trim();
  if (!raw) {
    throw new Error("missing_stored_token");
  }

  const parts = raw.split(".");
  if (parts.length === 4 && parts[0] === VERSION_PREFIX) {
    return normalizeMetaAccessToken(decryptChannelToken(raw));
  }

  if (looksLikeMetaAccessToken(raw)) {
    return normalizeMetaAccessToken(raw);
  }

  throw new Error("Invalid encrypted channel token format");
}

/**
 * @param {string} token
 * @returns {{ length: number, prefix: string, looksValid: boolean }}
 */
function describeAccessToken(token) {
  const normalized = normalizeMetaAccessToken(token);
  return {
    length: normalized.length,
    prefix: normalized.slice(0, 6),
    looksValid: looksLikeMetaAccessToken(normalized),
  };
}

module.exports = {
  normalizeMetaAccessToken,
  looksLikeMetaAccessToken,
  detectWrongInstagramLoginToken,
  resolveConnectionAccessToken,
  describeAccessToken,
};
