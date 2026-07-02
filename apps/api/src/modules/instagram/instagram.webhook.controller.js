/**
 * Meta Instagram webhook — HTTP layer (Phase 1).
 * GET: subscription handshake.
 * POST: HMAC verify → parse messaging → audit log (no AI yet).
 */

const { verifyMetaSignature } = require("./instagram.webhook.signature");
const { processInstagramWebhookPayload } = require("./instagram.webhook.service");

/**
 * Meta subscription verification (GET /api/webhooks/instagram).
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function verifyInstagramWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode !== "subscribe") {
    return res.sendStatus(403);
  }

  const expectedToken = String(process.env.META_VERIFY_TOKEN || "").trim();
  if (!expectedToken || token !== expectedToken) {
    return res.sendStatus(403);
  }

  if (challenge == null || String(challenge).trim() === "") {
    return res.sendStatus(400);
  }

  return res.status(200).send(String(challenge));
}

/**
 * Inbound Meta webhook (POST /api/webhooks/instagram).
 * Requires express.raw on this route so req.body is a Buffer.
 *
 * @param {import("express").Request} req
 * @param {import("express").Response} res
 */
function handleInstagramWebhookPost(req, res) {
  const rawBody = req.body;

  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) {
    return res.sendStatus(400);
  }

  const signatureHeader = req.get("X-Hub-Signature-256");
  const verified = verifyMetaSignature(rawBody, signatureHeader);
  if (!verified.ok) {
    console.warn(
      `[instagram-webhook] rejected POST — ${verified.reason} (bodyBytes=${rawBody.length})`
    );
    return res.sendStatus(403);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch (err) {
    console.warn("[instagram-webhook] rejected POST — invalid JSON:", err?.message);
    return res.sendStatus(400);
  }

  try {
    const stats = processInstagramWebhookPayload(payload);
    console.info("[instagram-webhook] POST accepted", stats);
  } catch (err) {
    console.error("[instagram-webhook] processing error:", err?.message || err);
  }

  return res.sendStatus(200);
}

module.exports = {
  verifyInstagramWebhook,
  handleInstagramWebhookPost,
};
