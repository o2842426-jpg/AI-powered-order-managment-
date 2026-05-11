function isBillingEnforced() {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      String(process.env.STRIPE_SECRET_KEY).trim() &&
      process.env.STRIPE_PRICE_ID &&
      String(process.env.STRIPE_PRICE_ID).trim()
  );
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
