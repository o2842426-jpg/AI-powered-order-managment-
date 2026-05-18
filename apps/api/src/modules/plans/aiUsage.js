const { db } = require("../../db/client");
const {
  effectivePlanTierForStore,
  getAiMessageMonthlyLimit,
} = require("./planMatrix");

function currentUsageMonthYm() {
  return new Date().toISOString().slice(0, 7);
}

/**
 * Rolls monthly AI counter when calendar month (UTC) changes.
 * @param {number} storeId
 */
function ensureAiUsageMonth(storeId) {
  const ym = currentUsageMonthYm();
  const row = db
    .prepare(
      `SELECT ai_messages_period_ym FROM stores WHERE id = ?`
    )
    .get(storeId);
  if (!row) return;
  if (row.ai_messages_period_ym !== ym) {
    db.prepare(
      `
        UPDATE stores
        SET ai_messages_used = 0,
            ai_messages_period_ym = ?
        WHERE id = ?
      `
    ).run(ym, storeId);
  }
}

/**
 * @param {object} storeRow — needs subscription_status, plan_tier, trial_ends_at, id, ai_messages_used
 * @returns {{ ok: true, used: number, limit: number | null, tier: string } | { ok: false, code: string, message: string, used: number, limit: number | null }}
 */
function evaluateAiMessageQuota(storeRow) {
  ensureAiUsageMonth(storeRow.id);
  const fresh = db
    .prepare(
      `
        SELECT id, subscription_status, plan_tier, trial_ends_at,
               ai_messages_used, ai_messages_period_ym
        FROM stores
        WHERE id = ?
      `
    )
    .get(storeRow.id);

  const tier = effectivePlanTierForStore(fresh);
  const limit = getAiMessageMonthlyLimit(tier);
  const used = Number(fresh?.ai_messages_used || 0);

  if (limit != null && used >= limit) {
    return {
      ok: false,
      code: "AI_QUOTA_EXCEEDED",
      message:
        "Monthly AI message limit reached for this store. Upgrade the plan to continue.",
      used,
      limit,
      tier,
    };
  }

  return { ok: true, used, limit, tier };
}

function incrementAiMessageUsage(storeId) {
  db.prepare(
    `
      UPDATE stores
      SET ai_messages_used = COALESCE(ai_messages_used, 0) + 1
      WHERE id = ?
    `
  ).run(storeId);
}

module.exports = {
  ensureAiUsageMonth,
  evaluateAiMessageQuota,
  incrementAiMessageUsage,
  currentUsageMonthYm,
};
