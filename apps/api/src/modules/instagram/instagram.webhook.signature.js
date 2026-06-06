const crypto = require("crypto");

/**
 * Verify Meta webhook HMAC (X-Hub-Signature-256).
 * @param {Buffer} rawBody — request body bytes exactly as received
 * @param {string | undefined} signatureHeader — e.g. "sha256=<hex>"
 * @returns {boolean}
 */
function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = String(process.env.META_APP_SECRET || "").trim();
  if (!secret) {
    console.error("[instagram-webhook] META_APP_SECRET is not set — rejecting POST");
    return false;
  }

  const header = String(signatureHeader || "").trim();
  if (!header.startsWith("sha256=")) {
    return false;
  }

  const expectedHex = header.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return false;
  }

  const computedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const computedBuf = Buffer.from(computedHex, "hex");
  if (expectedBuf.length !== computedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, computedBuf);
}

module.exports = { verifyMetaSignature };
