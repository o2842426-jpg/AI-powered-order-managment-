const crypto = require("crypto");

const SCRYPT_SALT = "shopiq-channel-token-v1";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION_PREFIX = "v1";

/**
 * Resolve 32-byte AES key from CHANNEL_TOKEN_ENCRYPTION_KEY.
 * Accepts: 64-char hex, 44-char base64 (32 bytes), or any string (scrypt-derived).
 * @returns {Buffer | null}
 */
function resolveEncryptionKey() {
  const raw = String(process.env.CHANNEL_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!raw) return null;

  if (/^[a-f0-9]{64}$/i.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const fromB64 = Buffer.from(raw, "base64");
    if (fromB64.length === KEY_LENGTH) {
      return fromB64;
    }
  } catch {
    /* fall through to scrypt */
  }

  return crypto.scryptSync(raw, SCRYPT_SALT, KEY_LENGTH);
}

function isEncryptionConfigured() {
  return resolveEncryptionKey() != null;
}

/**
 * @param {string} plainText
 * @returns {string} v1.<iv>.<tag>.<ciphertext> (base64url segments)
 */
function encryptChannelToken(plainText) {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

/**
 * @param {string} encoded
 * @returns {string}
 */
function decryptChannelToken(encoded) {
  const key = resolveEncryptionKey();
  if (!key) {
    throw new Error("CHANNEL_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const parts = String(encoded || "").split(".");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error("Invalid encrypted channel token format");
  }

  const iv = Buffer.from(parts[1], "base64url");
  const authTag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted channel token segments");
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

module.exports = {
  encryptChannelToken,
  decryptChannelToken,
  isEncryptionConfigured,
};
