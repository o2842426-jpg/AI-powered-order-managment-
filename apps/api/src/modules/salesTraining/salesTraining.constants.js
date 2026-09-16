/**
 * Owner-configurable sales training knobs (Phase 3).
 * Used by settings API + AI prompt assembly.
 */

const SALES_AGGRESSION = {
  soft: "soft",
  balanced: "balanced",
  aggressive: "aggressive",
};

const PERSONA_TONES = {
  warm: "warm",
  concise: "concise",
  luxury: "luxury",
  energetic: "energetic",
};

/**
 * @param {unknown} raw
 * @returns {"soft"|"balanced"|"aggressive"|null}
 */
function normalizeSalesAggression(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "soft" || v === "balanced" || v === "aggressive") return v;
  return null;
}

/**
 * @param {unknown} raw
 * @returns {"warm"|"concise"|"luxury"|"energetic"|null}
 */
function normalizePersonaTone(raw) {
  const v = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (v === "warm" || v === "concise" || v === "luxury" || v === "energetic") {
    return v;
  }
  return null;
}

/**
 * Arabic guidance injected into the system prompt.
 * @param {unknown} tone
 */
function buildPersonaToneBlock(tone) {
  const t = normalizePersonaTone(tone);
  if (!t) return "";

  const map = {
    warm: `
# نبرة الشخصية — ودّي ودافئ
- رحّب بلطف، استخدم عبارات عراقية خفيفة (عيني، تدلل) بدون مبالغة.
- اطمئن الزبون قبل الضغط على الشراء.
- جمل قصيرة دافئة، مو فصحى مؤسساتية.`.trim(),
    concise: `
# نبرة الشخصية — مختصر واحترافي
- ردّ بجمل قصيرة وواضحة؛ ركّز على السعر والتوفر والخطوة التالية.
- لا حشو ولا مقدمات طويلة.
- CTA مباشر بدون زخرفة.`.trim(),
    luxury: `
# نبرة الشخصية — فاخر وراقٍ
- صياغة أنيقة وهادئة تليق بعلامة راقية.
- تجنّب المبالغة والضغط الزائد؛ أبرز الجودة والفحص عند الباب.
- نبرة واثقة بدون صياح بيعي.`.trim(),
    energetic: `
# نبرة الشخصية — حيوي وسريع
- طاقة إيجابية، حماسة معتدلة، سرعة في الانتقال للخطوة التالية.
- أكّد التوفر والمقاس بسرعة.
- CTA بخيارين واضحين.`.trim(),
  };

  return map[t] || "";
}

module.exports = {
  SALES_AGGRESSION,
  PERSONA_TONES,
  normalizeSalesAggression,
  normalizePersonaTone,
  buildPersonaToneBlock,
};
