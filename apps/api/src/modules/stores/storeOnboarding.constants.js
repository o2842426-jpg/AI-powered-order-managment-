/** Shared store-onboarding enums (create account + settings + AI). */

const STORE_VERTICALS = {
  clothing: "ملابس وأزياء",
  electronics: "إلكترونيات / أجهزة",
  beauty: "تجميل وعناية",
  home: "منزل ومطبخ",
  real_estate: "عقارات",
  food: "مطاعم / أكل",
  other: "أخرى",
};

const REPLY_DIALECTS = {
  iraqi: "عراقي",
  gulf: "خليجي",
  msa: "فصحى مبسطة",
  egyptian: "مصري",
  other: "أخرى",
};

const DEFAULT_PAYMENTS = {
  cod: "كاش عند الاستلام",
  bank_transfer: "تحويل بنكي",
  both: "الاثنين",
};

const STORE_VERTICAL_KEYS = Object.keys(STORE_VERTICALS);
const REPLY_DIALECT_KEYS = Object.keys(REPLY_DIALECTS);
const DEFAULT_PAYMENT_KEYS = Object.keys(DEFAULT_PAYMENTS);

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeStoreVertical(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return STORE_VERTICAL_KEYS.includes(v) ? v : null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeReplyDialect(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return REPLY_DIALECT_KEYS.includes(v) ? v : null;
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeDefaultPayment(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  return DEFAULT_PAYMENT_KEYS.includes(v) ? v : null;
}

/**
 * Short system-prompt block from onboarding profile.
 * @param {object | null | undefined} store
 */
function buildStoreOnboardingPromptBlock(store) {
  if (!store) return "";
  const vertical = normalizeStoreVertical(store.store_vertical);
  const dialect = normalizeReplyDialect(store.reply_dialect);
  const payment = normalizeDefaultPayment(store.default_payment);
  const sell = String(store.sell_summary || "").trim();

  if (!vertical && !dialect && !payment && !sell) return "";

  const lines = ["# STORE PROFILE (from owner onboarding):"];
  if (vertical) {
    lines.push(`- Store vertical: ${vertical} (${STORE_VERTICALS[vertical]})`);
  }
  if (dialect) {
    lines.push(
      `- Reply dialect: ${dialect} (${REPLY_DIALECTS[dialect]}) — adapt tone strictly to this dialect.`
    );
  }
  if (payment) {
    lines.push(`- Default payment: ${payment} (${DEFAULT_PAYMENTS[payment]})`);
  }
  if (sell) {
    lines.push(`- What they sell: ${sell}`);
  }
  lines.push(
    "- Match sales style to the vertical (e.g. clothing → fit/size; real_estate → location/budget/intent — never use apparel sizing for non-clothing)."
  );
  return lines.join("\n");
}

/**
 * Seed ai_prompt from sell summary when owner left ai_prompt empty.
 * @param {string | null | undefined} sellSummary
 * @param {string | null | undefined} vertical
 */
function buildSeedAiPrompt(sellSummary, vertical) {
  const sell = String(sellSummary || "").trim();
  if (!sell) return null;
  const v = normalizeStoreVertical(vertical);
  const label = v ? STORE_VERTICALS[v] : null;
  return label
    ? `هذا متجر ضمن فئة «${label}». نبيع: ${sell}.`
    : `نبيع: ${sell}.`;
}

module.exports = {
  STORE_VERTICALS,
  REPLY_DIALECTS,
  DEFAULT_PAYMENTS,
  STORE_VERTICAL_KEYS,
  REPLY_DIALECT_KEYS,
  DEFAULT_PAYMENT_KEYS,
  normalizeStoreVertical,
  normalizeReplyDialect,
  normalizeDefaultPayment,
  buildStoreOnboardingPromptBlock,
  buildSeedAiPrompt,
};
