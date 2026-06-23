const Stripe = require("stripe");
const { db } = require("../../db/client");
const {
  isBillingEnforced,
  getFrontendBaseUrl,
} = require("./billing.config");
const { isDemoTrialStore } = require("./billing.demoOverride");
const {
  hasOwnerToolAccess,
  ownerAccessReason,
} = require("./billing.access");
const {
  stripePriceIdForCheckoutPlan,
  effectivePlanTierForStore,
  getAiMessageMonthlyLimit,
  getCapabilitiesForTier,
} = require("../plans/planMatrix");
const {
  ensureAiUsageMonth,
  incrementAiMessageUsage,
} = require("../plans/aiUsage");

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !String(key).trim()) {
    return null;
  }
  return new Stripe(key);
}

function getBillingStatus(req, res) {
  try {
    const enforced = isBillingEnforced() || isDemoTrialStore(req.user.store_id);
    const row = db
      .prepare(
        `
          SELECT
            subscription_status,
            subscription_current_period_end,
            stripe_customer_id,
            trial_started_at,
            trial_ends_at,
            plan_tier,
            stripe_price_id,
            ai_messages_used,
            ai_messages_period_ym
          FROM stores
          WHERE id = ?
        `
      )
      .get(req.user.store_id);

    const status = row?.subscription_status ?? "active";
    const hasAccess = !enforced || hasOwnerToolAccess(row || {});

    ensureAiUsageMonth(req.user.store_id);
    const usageRow = db
      .prepare(
        `
          SELECT ai_messages_used
          FROM stores
          WHERE id = ?
        `
      )
      .get(req.user.store_id);

    const effectiveTier = isDemoTrialStore(req.user.store_id)
      ? "trial"
      : effectivePlanTierForStore(row || {});
    const aiLimit = getAiMessageMonthlyLimit(effectiveTier);
    const used = Number(usageRow?.ai_messages_used || 0);

    return res.status(200).json({
      data: {
        billing_enforced: enforced,
        subscription_status: status,
        has_access: hasAccess,
        access_reason: ownerAccessReason(row || {}),
        current_period_end: row?.subscription_current_period_end ?? null,
        trial_started_at: row?.trial_started_at ?? null,
        trial_ends_at: row?.trial_ends_at ?? null,
        can_use_portal: Boolean(row?.stripe_customer_id),
        plan_tier: effectiveTier,
        stripe_price_id: row?.stripe_price_id ?? null,
        ai_messages_used: used,
        ai_messages_monthly_limit: aiLimit,
        capabilities: getCapabilitiesForTier(effectiveTier),
        demo_trial_enforced: isDemoTrialStore(req.user.store_id),
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load billing status.",
      error: error.message,
    });
  }
}

function getEntitlements(req, res) {
  try {
    const row = db
      .prepare(
        `
          SELECT
            id,
            subscription_status,
            plan_tier,
            trial_ends_at,
            stripe_price_id,
            ai_messages_used,
            ai_messages_period_ym
          FROM stores
          WHERE id = ?
        `
      )
      .get(req.user.store_id);

    if (!row) {
      return res.status(404).json({ message: "Store not found." });
    }

    ensureAiUsageMonth(row.id);
    const fresh = db
      .prepare(
        `
          SELECT
            subscription_status,
            plan_tier,
            trial_ends_at,
            ai_messages_used,
            ai_messages_period_ym
          FROM stores
          WHERE id = ?
        `
      )
      .get(req.user.store_id);

    const tier = effectivePlanTierForStore(fresh);
    const limit = getAiMessageMonthlyLimit(tier);
    const used = Number(fresh?.ai_messages_used || 0);

    return res.status(200).json({
      data: {
        plan_tier: tier,
        capabilities: getCapabilitiesForTier(tier),
        ai_messages: {
          used,
          monthly_limit: limit,
          period_ym: fresh?.ai_messages_period_ym ?? null,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load entitlements.",
      error: error.message,
    });
  }
}

async function createCheckoutSession(req, res) {
  try {
    if (!isBillingEnforced()) {
      return res.status(400).json({
        message: "Billing is not configured on the server.",
      });
    }

    const stripe = getStripe();
    const plan = String(req.body?.plan || "starter").trim().toLowerCase();
    const priceId = stripePriceIdForCheckoutPlan(plan);

    if (!stripe || !priceId) {
      return res.status(400).json({
        message:
          "Stripe price is not configured for this plan. Set STRIPE_PRICE_STARTER / GROWTH / PRO (or STRIPE_PRICE_ID for starter).",
      });
    }

    const user = db
      .prepare(`SELECT id, email FROM users WHERE id = ?`)
      .get(req.user.id);

    if (!user?.email) {
      return res.status(400).json({ message: "User email is missing." });
    }

    const base = getFrontendBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/?billing=success`,
      cancel_url: `${base}/?billing=cancel`,
      metadata: {
        store_id: String(req.user.store_id),
      },
      subscription_data: {
        metadata: {
          store_id: String(req.user.store_id),
        },
      },
    });

    return res.status(200).json({
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create checkout session.",
      error: error.message,
    });
  }
}

async function createPortalSession(req, res) {
  try {
    if (!isBillingEnforced()) {
      return res.status(400).json({
        message: "Billing is not configured on the server.",
      });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured." });
    }

    const row = db
      .prepare(
        `
          SELECT stripe_customer_id
          FROM stores
          WHERE id = ?
        `
      )
      .get(req.user.store_id);

    if (!row?.stripe_customer_id) {
      return res.status(400).json({
        message: "No Stripe customer on file yet. Subscribe once first.",
      });
    }

    const base = getFrontendBaseUrl();

    const session = await stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${base}/?billing=return`,
    });

    return res.status(200).json({
      data: {
        url: session.url,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create billing portal session.",
      error: error.message,
    });
  }
}

module.exports = {
  getBillingStatus,
  getEntitlements,
  createCheckoutSession,
  createPortalSession,
};
