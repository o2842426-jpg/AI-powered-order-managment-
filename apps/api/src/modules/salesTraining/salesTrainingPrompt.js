/**
 * Format store-specific few-shot sales examples for the LLM system prompt.
 *
 * @param {{ category?: string, user_input?: string, ideal_response?: string }[]} examples
 * @param {string} [phase]
 */
function buildSalesTrainingBlock(examples, phase) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return "";
  }

  const phaseCategory =
    phase === "objection"
      ? "objection"
      : phase === "checkout"
        ? "closing"
        : "discovery";

  const sorted = [...examples].sort((a, b) => {
    const aMatch = String(a.category || "").toLowerCase() === phaseCategory ? 1 : 0;
    const bMatch = String(b.category || "").toLowerCase() === phaseCategory ? 1 : 0;
    return bMatch - aMatch;
  });

  const lines = sorted
    .map((ex) => {
      const customer = String(ex.user_input || "").trim();
      const ideal = String(ex.ideal_response || "").trim();
      if (!customer || !ideal) return "";
      const cat = String(ex.category || "general").trim();
      return `- [${cat}] Customer: "${customer}"\n  Your Ideal Response: "${ideal}"`;
    })
    .filter(Boolean)
    .join("\n");

  if (!lines) {
    return "";
  }

  return `
# TRAINING BLUEPRINTS (Follow this exact conversion style for similar scenarios):
${lines}

قواعد استخدام الأمثلة:
- قلّد الأسلوب واللهجة والطول — مو النص حرفياً إلا إذا السيناريو مطابق.
- لا تخالف الكتالوج أو الأسعار عند التطبيق.
- في Checkout: استخدم فقط أمثلة closing إن وُجدت.
`.trim();
}

module.exports = {
  buildSalesTrainingBlock,
};
