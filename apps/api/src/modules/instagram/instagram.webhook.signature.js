const crypto = require("crypto");

/**
 * Verify Meta webhook HMAC (X-Hub-Signature-256).
 * @param {Buffer} rawBody — request body bytes exactly as received
 * @param {string | undefined} signatureHeader — e.g. "sha256=<hex>"
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = String(process.env.META_APP_SECRET || "").trim();
  if (!secret) {
    return { ok: false, reason: "META_APP_SECRET missing in env" };
  }

  const header = String(signatureHeader || "").trim();
  if (!header) {
    return { ok: false, reason: "X-Hub-Signature-256 header missing" };
  }
  if (!header.startsWith("sha256=")) {
    return { ok: false, reason: "X-Hub-Signature-256 malformed" };
  }

  const expectedHex = header.slice("sha256=".length);
  if (!/^[a-f0-9]{64}$/i.test(expectedHex)) {
    return { ok: false, reason: "X-Hub-Signature-256 hex invalid" };
  }

  const computedHex = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expectedHex, "hex");
  const computedBuf = Buffer.from(computedHex, "hex");
  if (expectedBuf.length !== computedBuf.length) {
    return { ok: false, reason: "signature length mismatch" };
  }

  if (!crypto.timingSafeEqual(expectedBuf, computedBuf)) {
    return { ok: false, reason: "signature mismatch (wrong META_APP_SECRET or body altered)" };
  }

  return { ok: true };
}

module.exports = { verifyMetaSignature };
