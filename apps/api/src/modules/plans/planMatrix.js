/**
 * Subscription tiers + feature flags + AI quotas (source of truth on server).
 * Stripe price IDs map here via env: STRIPE_PRICE_STARTER, STRIPE_PRICE_GROWTH, STRIPE_PRICE_PRO.
 * Legacy single price: STRIPE_PRICE_ID → treated as starter.
 */

const VALID_TIERS = new Set(["trial", "starter", "growth", "pro"]);

/** @type {Record<string, number | null>} null = unlimited */
const AI_MESSAGE_MONTHLY_LIMIT = {
  trial: 1000,
  starter: 1000,
  growth: 10_000,
  pro: null,
};

/**
 * Feature keys used by API/UI gating. Values = tier must be in this ordered list or equal.
 * Order: trial < starter < growth < pro
 */
const TIER_ORDER = ["trial", "starter", "growth", "pro"];

const FEATURE_MIN_TIER = {
  ai_chat: "trial",
  product_recommendations: "trial",
  basic_order_handling: "trial",
  basic_analytics: "trial",
  simple_ai_personality: "trial",
  conversations_dashboard: "growth",
  live_order_state: "growth",
  advanced_analytics: "growth",
  human_takeover: "growth",
  smart_product_suggestions: "growth",
  ai_personality_customization: "growth",
  customer_activity_tracking: "growth",
  /** Apparel vertical: Aura clothing sales engine (FSM + sizing + objection matrix). */
  clothing_sales_engine: "growth",
  ai_followups: "pro",
  followup_tasks: "pro",
  lead_scoring: "pro",
  customer_memory: "pro",
  advanced_ai_sales_insights: "pro",
  multi_admin: "pro",
  priority_ai_processing: "pro",
  unlimited_ai_messages: "pro",
  advanced_automations: "pro",
};

function tierRank(tier) {
  const t = normalizePlanTier(tier);
  const i = TIER_ORDER.indexOf(t);
  return i >= 0 ? i : 0;
}

function normalizePlanTier(raw) {
  const t = String(raw ?? "trial")
    .trim()
    .toLowerCase();
  return VALID_TIERS.has(t) ? t : "trial";
}

function getConfiguredPriceIds() {
  const legacy = String(process.env.STRIPE_PRICE_ID || "").trim();
  return {
    starter: String(process.env.STRIPE_PRICE_STARTER || "").trim() || legacy,
    growth: String(process.env.STRIPE_PRICE_GROWTH || "").trim(),
    pro: String(process.env.STRIPE_PRICE_PRO || "").trim(),
  };
}

/**
 * @param {string | null | undefined} stripePriceId
 * @returns {string}
 */
function planTierFromStripePriceId(stripePriceId) {
  const id = String(stripePriceId || "").trim();
  if (!id) return "starter";
  const p = getConfiguredPriceIds();
  if (p.pro && id === p.pro) return "pro";
  if (p.growth && id === p.growth) return "growth";
  if (p.starter && id === p.starter) return "starter";
  return "starter";
}

/**
 * @param {string} plan — starter | growth | pro
 */
function stripePriceIdForCheckoutPlan(plan) {
  const p = getConfiguredPriceIds();
  const key = String(plan || "starter").trim().toLowerCase();
  if (key === "pro") return p.pro || null;
  if (key === "growth") return p.growth || null;
  return p.starter || null;
}

function hasConfiguredStripePrices() {
  const p = getConfiguredPriceIds();
  return Boolean(p.starter || p.growth || p.pro);
}

/**
 * @param {string} tier
 */
function getAiMessageMonthlyLimit(tier) {
  const t = normalizePlanTier(tier);
  const lim = AI_MESSAGE_MONTHLY_LIMIT[t];
  return lim === undefined ? 1000 : lim;
}

function tierMeetsFeature(tier, featureKey) {
  const need = FEATURE_MIN_TIER[featureKey];
  if (!need) return false;
  return tierRank(tier) >= tierRank(need);
}

/**
 * @param {string} tier
 */
function getCapabilitiesForTier(tier) {
  const t = normalizePlanTier(tier);
  return Object.keys(FEATURE_MIN_TIER).filter((k) => tierMeetsFeature(t, k));
}

/**
 * @param {{ plan_tier?: string | null, subscription_status?: string | null }} store
 */
function effectivePlanTierForStore(store) {
  const st = String(store?.subscription_status || "active").toLowerCase();
  if (st === "active" || st === "trialing") {
    return normalizePlanTier(store?.plan_tier) === "trial"
      ? "starter"
      : normalizePlanTier(store?.plan_tier);
  }
  if (st === "trial") {
    return "trial";
  }
  return normalizePlanTier(store?.plan_tier);
}

module.exports = {
  VALID_TIERS,
  normalizePlanTier,
  getConfiguredPriceIds,
  planTierFromStripePriceId,
  stripePriceIdForCheckoutPlan,
  hasConfiguredStripePrices,
  getAiMessageMonthlyLimit,
  tierMeetsFeature,
  getCapabilitiesForTier,
  effectivePlanTierForStore,
  FEATURE_MIN_TIER,
};
