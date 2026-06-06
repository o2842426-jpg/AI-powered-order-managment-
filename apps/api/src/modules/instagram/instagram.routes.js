const express = require("express");
const { verifyInstagramWebhook } = require("./instagram.webhook.controller");

const instagramWebhookRouter = express.Router();

instagramWebhookRouter.get("/", verifyInstagramWebhook);

module.exports = { instagramWebhookRouter };
