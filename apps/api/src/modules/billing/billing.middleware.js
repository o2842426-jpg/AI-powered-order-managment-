const { db } = require("../../db/client");
const { isBillingEnforced } = require("./billing.config");
const {
  hasOwnerToolAccess,
  ownerAccessReason,
} = require("./billing.access");

/**
 * When Stripe price + secret are set, owner APIs require paid subscription,
 * Stripe trialing, OR an in-app 7-day trial window (trial_ends_at).
 * If billing is not configured, all owners keep full access (local dev).
 */
function requireActiveSubscription(req, res, next) {
  if (!isBillingEnforced()) {
    return next();
  }

  const row = db
    .prepare(
      `
        SELECT subscription_status, trial_started_at, trial_ends_at
        FROM stores
        WHERE id = ?
      `
    )
    .get(req.user.store_id);

  const allowed = hasOwnerToolAccess(row || {});

  if (allowed) {
    return next();
  }

  const status = row?.subscription_status || "active";

  return res.status(402).json({
    message: "Subscription required for owner tools.",
    code: "SUBSCRIPTION_REQUIRED",
    subscription_status: status,
    access_reason: ownerAccessReason(row || {}),
    trial_ends_at: row?.trial_ends_at ?? null,
    trial_started_at: row?.trial_started_at ?? null,
  });
}

module.exports = {
  requireActiveSubscription,
};
