const { db } = require("../../db/client");
const {
  isDemoTrialStore,
  shouldEnforcePlansForStore,
} = require("../billing/billing.demoOverride");
const {
  effectivePlanTierForStore,
  tierMeetsFeature,
} = require("./planMatrix");

/** English API copy when billing is enforced and the store tier is below the feature minimum. */
const PLAN_FEATURE_MESSAGES = {
  conversations_dashboard:
    "This feature requires Growth or Pro. Upgrade your plan to use the conversations dashboard.",
  live_order_state:
    "هذه الميزة متوفرة في باقة Growth فما فوق. ارفع باقتك الحين لكي تشوف حالة الطلبات الحية!",
  human_takeover:
    "This feature requires Growth or Pro. Upgrade your plan to use human takeover (manual replies in customer chats).",
  customer_memory:
    "This feature requires Pro. Upgrade your plan to save memory facts that shape your storefront AI assistant.",
  ai_followups:
    "This feature requires Pro. Upgrade your plan to add follow-up phrases your storefront AI can use naturally in replies.",
  followup_tasks:
    "This feature requires Pro. Upgrade your plan to see suggested follow-up tasks for customer chats in your dashboard.",
  lead_scoring:
    "This feature requires Pro. Upgrade your plan to use AI lead scoring.",
  advanced_analytics:
    "This feature requires Growth or Pro. Upgrade your plan for advanced analytics insights.",
};

/**
 * When billing is not enforced (no Stripe prices), all owner tools stay open for local dev.
 * When billing is enforced, checks plan tier vs FEATURE_MIN_TIER for the given feature key.
 */
function requirePlanFeature(featureKey) {
  return (req, res, next) => {
    const storeId = Number(req.params.storeId);
    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "storeId must be a valid positive number." });
    }
    if (!shouldEnforcePlansForStore(storeId)) {
      return next();
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const row = db
      .prepare(
        `
          SELECT subscription_status, plan_tier, trial_ends_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    const tier = isDemoTrialStore(storeId)
      ? "trial"
      : effectivePlanTierForStore(row || {});
    if (!tierMeetsFeature(tier, featureKey)) {
      const message =
        PLAN_FEATURE_MESSAGES[featureKey] ||
        `This feature requires Growth or Pro. Upgrade your plan (feature: ${featureKey}).`;
      return res.status(403).json({
        code: "PLAN_REQUIRED",
        feature: featureKey,
        plan_tier: tier,
        message,
        ...(featureKey === "live_order_state"
          ? {
              error:
                "هذه الميزة متوفرة في باقة Growth فما فوق. ارفع باقتك الحين لكي تشوف حالة الطلبات الحية!",
            }
          : {}),
      });
    }

    return next();
  };
}

module.exports = { requirePlanFeature };
