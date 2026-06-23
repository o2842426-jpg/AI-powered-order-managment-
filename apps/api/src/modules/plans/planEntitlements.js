const { db } = require("../../db/client");
const {
  isDemoTrialStore,
  shouldEnforcePlansForStore,
} = require("../billing/billing.demoOverride");
const { effectivePlanTierForStore, tierMeetsFeature } = require("./planMatrix");

/**
 * @param {number} storeId
 * @returns {{ row: object | undefined, tier: string }}
 */
function getStorePlanContext(storeId) {
  const row = db
    .prepare(
      `
        SELECT subscription_status, plan_tier, trial_ends_at
        FROM stores
        WHERE id = ?
      `
    )
    .get(storeId);

  if (isDemoTrialStore(storeId)) {
    return { row: row || undefined, tier: "trial" };
  }

  return {
    row: row || undefined,
    tier: effectivePlanTierForStore(row || {}),
  };
}

/**
 * @param {number} storeId
 * @param {string} featureKey
 * @returns {boolean}
 */
function storeHasFeature(storeId, featureKey) {
  if (!shouldEnforcePlansForStore(storeId)) return true;
  const { tier } = getStorePlanContext(storeId);
  return tierMeetsFeature(tier, featureKey);
}

/**
 * @param {object | null | undefined} row
 * @returns {object | null | undefined}
 */
function stripLeadScoreFields(row) {
  if (!row || typeof row !== "object") return row;
  return {
    ...row,
    lead_score: null,
    lead_score_reason: null,
    lead_scored_at: null,
  };
}

/**
 * @param {object | null | undefined} row
 * @param {boolean} allowed
 */
function sanitizeLeadScoreRow(row, allowed) {
  if (allowed) return row;
  return stripLeadScoreFields(row);
}

/**
 * @param {object} message
 * @param {boolean} allowed
 */
function sanitizeLeadScoreMessage(message, allowed) {
  if (allowed || !message || typeof message !== "object") return message;
  const next = { ...message };
  next.lead_score = null;
  next.lead_score_reason = null;
  if (next.payload && typeof next.payload === "string") {
    try {
      const parsed = JSON.parse(next.payload);
      if (parsed && typeof parsed === "object") {
        delete parsed.lead_score;
        delete parsed.lead_score_reason;
        next.payload = JSON.stringify(parsed);
      }
    } catch {
      // keep payload as-is
    }
  }
  return next;
}

/**
 * @param {object[]} rows
 * @param {boolean} allowed
 */
function sanitizeLeadScoreMessages(rows, allowed) {
  if (allowed || !Array.isArray(rows)) return rows;
  return rows.map((row) => sanitizeLeadScoreMessage(row, false));
}

module.exports = {
  getStorePlanContext,
  storeHasFeature,
  stripLeadScoreFields,
  sanitizeLeadScoreRow,
  sanitizeLeadScoreMessage,
  sanitizeLeadScoreMessages,
};
