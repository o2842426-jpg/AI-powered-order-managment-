const crypto = require("crypto");
const { getAuthSecret } = require("../auth/auth.controller");

const STATE_TTL_SECONDS = 10 * 60;
const STATE_VERSION = "v1";

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function base64UrlDecode(encoded) {
  return JSON.parse(Buffer.from(String(encoded), "base64url").toString("utf8"));
}

/**
 * @param {{ storeId: number, userId: number }} input
 * @returns {string}
 */
function createFacebookOAuthState({ storeId, userId }) {
  const payload = {
    v: STATE_VERSION,
    store_id: Number(storeId),
    user_id: Number(userId),
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
  };

  const encoded = base64UrlEncode(payload);
  const signature = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

/**
 * @param {string} state
 * @returns {{ store_id: number, user_id: number, nonce: string, exp: number } | null}
 */
function verifyFacebookOAuthState(state) {
  const raw = String(state || "").trim();
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;

  const encoded = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!encoded || !signature) return null;

  const expected = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encoded)
    .digest("base64url");

  const provided = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (
    provided.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(provided, expectedBuf)
  ) {
    return null;
  }

  let payload;
  try {
    payload = base64UrlDecode(encoded);
  } catch {
    return null;
  }

  if (payload?.v !== STATE_VERSION) return null;
  if (!Number.isFinite(Number(payload.store_id)) || Number(payload.store_id) <= 0) {
    return null;
  }
  if (!Number.isFinite(Number(payload.user_id)) || Number(payload.user_id) <= 0) {
    return null;
  }
  if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    store_id: Number(payload.store_id),
    user_id: Number(payload.user_id),
    nonce: String(payload.nonce || ""),
    exp: Number(payload.exp),
  };
}

module.exports = {
  STATE_TTL_SECONDS,
  createFacebookOAuthState,
  verifyFacebookOAuthState,
};
