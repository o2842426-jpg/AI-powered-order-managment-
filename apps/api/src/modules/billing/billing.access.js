/**
 * Owner dashboard / owner API access (when billing is enforced).
 * Hybrid-lite: app-owned trial window + Stripe subscription_status after checkout/webhooks.
 */

const TRIAL_DAYS = 7;

function parseTrialEndsAtMs(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? null : ms;
}

function isTrialWindowOpen(trialEndsAt) {
  const endMs = parseTrialEndsAtMs(trialEndsAt);
  if (endMs == null) return false;
  return Date.now() < endMs;
}

/**
 * @param {{ subscription_status?: string | null, trial_ends_at?: string | null }} row
 * @returns {boolean}
 */
function hasOwnerToolAccess(row) {
  const status = String(row?.subscription_status || "active").toLowerCase();

  if (status === "suspended") return false;

  if (status === "active" || status === "trialing") return true;

  if (status === "trial") {
    return isTrialWindowOpen(row?.trial_ends_at);
  }

  return false;
}

/**
 * Short string for API / UI (upgrade flows, analytics).
 * @param {{ subscription_status?: string | null, trial_ends_at?: string | null }} row
 */
function ownerAccessReason(row) {
  const status = String(row?.subscription_status || "active").toLowerCase();

  if (status === "suspended") return "suspended";

  if (status === "active" || status === "trialing") return "subscribed";

  if (status === "trial") {
    return isTrialWindowOpen(row?.trial_ends_at) ? "in_trial" : "trial_expired";
  }

  if (status === "past_due" || status === "unpaid") return "payment_required";

  return "subscription_inactive";
}

module.exports = {
  TRIAL_DAYS,
  parseTrialEndsAtMs,
  isTrialWindowOpen,
  hasOwnerToolAccess,
  ownerAccessReason,
};
