const express = require("express");
const {
  verifyInstagramWebhook,
  handleInstagramWebhookPost,
} = require("./instagram.webhook.controller");

const instagramWebhookRouter = express.Router();

instagramWebhookRouter.get("/", verifyInstagramWebhook);

instagramWebhookRouter.post(
  "/",
  express.raw({ type: "application/json" }),
  handleInstagramWebhookPost
);

module.exports = { instagramWebhookRouter };
