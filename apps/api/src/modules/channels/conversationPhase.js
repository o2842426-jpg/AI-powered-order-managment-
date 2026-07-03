/**
 * Lightweight phase detection for Instagram DM sales flow.
 * @typedef {"discovery" | "checkout" | "objection"} ConversationPhase
 */

const BUY_SIGNALS =
  /اشتري|أريد\s*اشتري|اريد\s*اشتري|ابي\s*اشتري|أبي\s*اشتري|بدي\s*اشتري|راح\s*اشتري|وين\s*اشتري|كيف\s*اشتري|ثبت|ثبتلي|ثبّت|احجز|حجز|كمل|كمّل|كمّل\s*الطلب|كمل\s*الطلب|رتب\s*الطلب|رتبلي|خلصت|خلص\s*اموري|اي\s*ثبت|أي\s*ثبت|اوكي\s*اشتري|تمام\s*اشتري|ابشر\s*ثبت/i;

const LOCATION_PAYMENT_SIGNALS =
  /محافظ|كركوك|بغداد|الناصر|البصر|اربيل|أربيل|سليمان|كاش\s*عند|الدفع\s*كاش|عند\s*الاستلام|عنوان\s*التوصيل|عنواني|منطقة|حي\s|قضاء|شارع/i;

const OBJECTION_SIGNALS =
  /غالي|غالية|غلا|متردد|أخاف|اخاف|خاف|خايف|خايفة|بعدين|خليني\s*افكر|ما\s*اريد|ما\s*أريد|لا\s*ما\s*اريد|مو\s*مهتم|مو\s*غالي|بس\s*الحقيبة|بس\s*المنتج|شك|ماني\s*متأكد|مو\s*واثق/i;

const HESITANT_OBJECTION_SIGNALS =
  /متردد|أخاف|اخاف|خاف|خايف|خايفة|شك|ماني\s*متأكد|مو\s*واثق|خايفين|ما\s*ادري/i;

const PRICE_OBJECTION_SIGNALS =
  /غالي|غالية|غلا|سعر\s*عالي|فلوس|بصرف|غالي\s*واكو|مو\s*ارخص/i;

const PRODUCT_DISCUSSED =
  /سعر|د\.ع|دع\b|نثبت|حجز|حقيبة|منتج|متوفر|توصيل/i;

/**
 * @param {{ sender_type?: string, message_text?: string, message_type?: string }[]} history
 * @param {string} currentText
 * @returns {ConversationPhase}
 */
function detectConversationPhase(history, currentText) {
  const customerLines = (history || [])
    .filter((m) => m.sender_type === "customer")
    .map((m) => String(m.message_text || "").trim())
    .filter(Boolean);

  const recentCustomer = customerLines.slice(-6).join("\n");
  const combined = `${recentCustomer}\n${String(currentText || "").trim()}`;

  if (OBJECTION_SIGNALS.test(String(currentText || "")) && !BUY_SIGNALS.test(String(currentText || ""))) {
    return "objection";
  }

  const aiDiscussedProduct = (history || []).some(
    (m) =>
      m.sender_type === "ai" &&
      PRODUCT_DISCUSSED.test(String(m.message_text || ""))
  );

  const customerBuying = BUY_SIGNALS.test(combined);
  const customerGaveDelivery = LOCATION_PAYMENT_SIGNALS.test(combined);

  if (customerBuying) {
    return "checkout";
  }

  if (customerGaveDelivery && aiDiscussedProduct) {
    return "checkout";
  }

  if (
    customerGaveDelivery &&
    (history || []).some((m) => m.sender_type === "ai" && /نثبت|حجز|بسعر/i.test(String(m.message_text || "")))
  ) {
    return "checkout";
  }

  return "discovery";
}

/**
 * @param {{ message_type?: string, message_text?: string, payload?: string }[]} history
 * @returns {boolean}
 */
function productImagesAlreadySent(history) {
  return (history || []).some((m) => {
    if (m.message_type === "image") return true;
    const text = String(m.message_text || "").trim();
    if (/^\[\d+\s*صور منتج\]$/.test(text)) return true;
    try {
      const payload = typeof m.payload === "string" ? JSON.parse(m.payload) : m.payload;
      if (payload && Array.isArray(payload.image_urls) && payload.image_urls.length) {
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  });
}

/**
 * Fields the customer already mentioned in thread (for prompt context).
 * @param {{ sender_type?: string, message_text?: string }[]} history
 * @param {string} currentText
 */
function summarizeCheckoutContext(history, currentText) {
  const customerText = [
    ...(history || [])
      .filter((m) => m.sender_type === "customer")
      .map((m) => String(m.message_text || "")),
    String(currentText || ""),
  ].join("\n");

  const has = {
    product_interest: PRODUCT_DISCUSSED.test(customerText) || PRODUCT_DISCUSSED.test(
      (history || []).filter((m) => m.sender_type === "ai").map((m) => m.message_text).join("\n")
    ),
    governorate: /كركوك|بغداد|الناصر|البصر|اربيل|أربيل|سليمان|محافظتي|محافظة/i.test(customerText),
    address: /عنوان|منطقة|حي |شارع|قضاء/i.test(customerText),
    payment_cod: /كاش|الاستلام|دفع\s*عند/i.test(customerText),
    phone: /\b07\d{9}\b|\b\+964\d{10,}\b|\b\d{11}\b/.test(customerText),
    name: /اسمي|أنا\s+\S+\s+\S+/i.test(customerText),
    confirmed_buy: BUY_SIGNALS.test(customerText),
  };

  const missing = [];
  if (!has.name) missing.push("الاسم الثلاثي");
  if (!has.phone) missing.push("رقم الهاتف");
  if (!has.governorate && !has.address) missing.push("المحافظة والعنوان التفصيلي");
  else if (!has.address) missing.push("العنوان التفصيلي (حي/شارع/أقرب نقطة)");
  if (!has.payment_cod) missing.push("طريقة الدفع (كاش عند الاستلام)");

  return { has, missing, customerText: customerText.slice(-1200) };
}

/**
 * @param {string} text
 * @returns {"hesitant" | "price" | null}
 */
function detectObjectionKind(text) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (HESITANT_OBJECTION_SIGNALS.test(t)) return "hesitant";
  if (PRICE_OBJECTION_SIGNALS.test(t)) return "price";
  if (OBJECTION_SIGNALS.test(t)) return "price";
  return null;
}

module.exports = {
  detectConversationPhase,
  detectObjectionKind,
  productImagesAlreadySent,
  summarizeCheckoutContext,
};
