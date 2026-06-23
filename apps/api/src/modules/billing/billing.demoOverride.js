/**
 * TEMP demo toggle — flip with env, remove when Stripe testing resumes.
 *
 * Set in .env (no Stripe required):
 *   DEMO_FORCE_TRIAL_STORE_ID=8
 *
 * That store is treated as plan tier `trial` with billing_enforced=true in API/UI.
 * Comment out the env var (or set empty) to disable.
 */

const { isBillingEnforced } = require("./billing.config");

function parseDemoForceTrialStoreId() {
  const raw = String(process.env.DEMO_FORCE_TRIAL_STORE_ID || "").trim();
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** @param {number | string | null | undefined} storeId */
function isDemoTrialStore(storeId) {
  const demoId = parseDemoForceTrialStoreId();
  if (!demoId) return false;
  return Number(storeId) === demoId;
}

/** @param {number | string | null | undefined} storeId */
function shouldEnforcePlansForStore(storeId) {
  return isBillingEnforced() || isDemoTrialStore(storeId);
}

module.exports = {
  parseDemoForceTrialStoreId,
  isDemoTrialStore,
  shouldEnforcePlansForStore,
};
