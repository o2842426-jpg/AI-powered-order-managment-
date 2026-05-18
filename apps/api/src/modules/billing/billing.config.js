const { hasConfiguredStripePrices } = require("../plans/planMatrix");

function isBillingEnforced() {
  const secret =
    process.env.STRIPE_SECRET_KEY && String(process.env.STRIPE_SECRET_KEY).trim();
  if (!secret) return false;
  return hasConfiguredStripePrices();
}

function getFrontendBaseUrl() {
  const raw = process.env.FRONTEND_URL;
  if (raw && String(raw).trim()) {
    return String(raw).replace(/\/$/, "");
  }
  return "http://localhost:5173";
}

module.exports = {
  isBillingEnforced,
  getFrontendBaseUrl,
};
