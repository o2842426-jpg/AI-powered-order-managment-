const { db } = require("../../db/client");
const { isBillingEnforced } = require("./billing.config");

/**
 * When Stripe price + secret are set, owner APIs require an active/trialing subscription.
 * If billing is not configured, all owners keep full access (local dev).
 */
function requireActiveSubscription(req, res, next) {
  if (!isBillingEnforced()) {
    return next();
  }

  const row = db
    .prepare(
      `
        SELECT subscription_status
        FROM stores
        WHERE id = ?
      `
    )
    .get(req.user.store_id);

  const status = row?.subscription_status || "active";
  const allowed = status === "active" || status === "trialing";

  if (allowed) {
    return next();
  }

  return res.status(402).json({
    message: "Subscription required for owner tools.",
    code: "SUBSCRIPTION_REQUIRED",
    subscription_status: status,
  });
}

module.exports = {
  requireActiveSubscription,
};
