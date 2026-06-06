const express = require("express");
const cors = require("cors");
const path = require("path");
const { handleStripeWebhook } = require("./modules/billing/billing.webhook");
const { instagramWebhookRouter } = require("./modules/instagram/instagram.routes");
const { apiRouter } = require("./routes");

const app = express();

app.use(cors());

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use("/api/webhooks/instagram", instagramWebhookRouter);

app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api", apiRouter);

module.exports = { app };
