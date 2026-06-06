/**
 * Meta Instagram webhook — HTTP layer (Phase 1).
 * GET: subscription handshake only. POST handler added in a later step.
 */

/**
 * Meta subscription verification (GET /api/webhooks/instagram).
 * Meta sends hub.mode, hub.verify_token, hub.challenge; we echo hub.challenge on success.
 *
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

module.exports = {
  verifyInstagramWebhook,
};
