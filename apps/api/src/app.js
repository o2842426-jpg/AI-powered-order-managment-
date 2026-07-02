const express = require("express");
const cors = require("cors");
const path = require("path");
const { handleStripeWebhook } = require("./modules/billing/billing.webhook");
const { instagramWebhookRouter } = require("./modules/instagram/instagram.routes");
const { apiRouter } = require("./routes");

const app = express();

function resolveAllowedOrigins() {
  const origins = new Set([
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "https://shopiq.me",
    "http://shopiq.me",
    "https://www.shopiq.me",
    "http://www.shopiq.me",
  ]);

  const frontend = String(process.env.FRONTEND_URL || "").trim().replace(/\/$/, "");
  if (frontend) {
    origins.add(frontend);
  }

  return [...origins];
}

const allowedOrigins = resolveAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, origin);
      }
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, origin);
      }
      console.warn(`[cors] blocked origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Key"],
    optionsSuccessStatus: 204,
  })
);

app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use("/api/webhooks/instagram", instagramWebhookRouter);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api", apiRouter);

module.exports = { app };
