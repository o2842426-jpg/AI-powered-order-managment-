const { hasConfiguredStripePrices } = require("../plans/planMatrix");

function isManualBillingMode() {
  const raw = String(process.env.MANUAL_BILLING_ENFORCED || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

function isBillingEnforced() {
  if (isManualBillingMode()) return true;
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
  isManualBillingMode,
  isBillingEnforced,
  getFrontendBaseUrl,
};
