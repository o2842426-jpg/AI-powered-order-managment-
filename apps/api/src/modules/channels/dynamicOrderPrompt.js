const { ORDER_STATES } = require("./orderState.constants");

/**
 * @param {object} state
 * @param {string} state.order_state
 * @param {string} [state.order_product_name]
 * @param {string} [state.customer_city]
 * @param {string} [state.customer_phone]
 * @param {string} [state.customer_name]
 * @param {string} [state.customer_address]
 * @param {string} [state.payment_method]
 */
function getCurrentGoalString(state) {
  switch (state.order_state) {
    case ORDER_STATES.AWAITING_PRODUCT:
      return "فهم المنتج المطلوب وعرضه مرة واحدة مع السعر";
    case ORDER_STATES.AWAITING_LOCATION:
      return "جمع المحافظة والعنوان التفصيلي فقط — بدون إعادة عرض المنتج";
    case ORDER_STATES.AWAITING_PHONE:
      return "جمع رقم الهاتف واسم المستلم — الموقع محفوظ مسبقاً";
    case ORDER_STATES.CONFIRMED_AWAITING_FINALIZE:
      return "تلخيص الطلب النهائي وتأكيد التثبيت — بدون أسئلة مكررة";
    case ORDER_STATES.CONFIRMED:
      return "الطلب مثبّت — أكّد التوصيل فقط إن سُئلت";
    default:
      return "مساعدة الزبون بخطوة واحدة واضحة";
  }
}

/**
 * @param {object} state
 */
function buildStrictExecutionRules(state) {
  const rules = [
    "لا تعيد سؤالاً عن حقل محفوظ أعلاه (SAVED).",
    "لا ترسل recommended_product_ids إلا في AWAITING_PRODUCT وبعد طلب صريح لمنتج جديد.",
    "لا تنهِ الرد بـ «تحب نثبت؟» إذا الزبون قال أصلاً ثبت/كمل/اشتري.",
  ];

  switch (state.order_state) {
    case ORDER_STATES.AWAITING_PRODUCT:
      rules.push(
        "اعرض منتجاً واحداً مع السعر؛ صور المنتج مرة واحدة فقط إن لزم.",
        "اختم بسؤال CTA بخيارين للانتقال للشراء."
      );
      break;
    case ORDER_STATES.AWAITING_LOCATION:
      rules.push(
        "ممنوع upsell أو صور أو إعادة السعر.",
        "اطلب فقط: المحافظة + العنوان التفصيلي (حي/شارع/أقرب نقطة).",
        "إذا ذكر محافظة سابقاً في المحادثة، لا تسأل عنها مجدداً."
      );
      break;
    case ORDER_STATES.AWAITING_PHONE:
      rules.push(
        `المحافظة محفوظة: ${state.customer_city || state.customer_address} — لا تسأل عنها.`,
        "اطلب فقط: الاسم الثلاثي + رقم الهاتف (07XXXXXXXXX).",
        "ممنوع CTA مبيعات عام."
      );
      break;
    case ORDER_STATES.CONFIRMED_AWAITING_FINALIZE:
      rules.push(
        "لخّص: المنتج + السعر + العنوان + الهاتف + الدفع.",
        "قل إن الطلب تثبّت وسيتواصل فريق التوصيل.",
        "recommended_product_ids يجب أن تكون []."
      );
      break;
    default:
      break;
  }

  return rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
}

/**
 * Hard code-level phase split driven by DB flags (buy_committed + order_state),
 * not loose textual hints. Prevents premature data-gathering during discovery.
 *
 * @param {object} state
 * @returns {string}
 */
function buildConditionalPhaseRules(state) {
  const buyCommitted = Number(state.buy_committed) === 1 ? 1 : 0;
  const orderState = state.order_state || ORDER_STATES.AWAITING_PRODUCT;

  if (buyCommitted === 0) {
    return `
# CURRENT PHASE: DISCOVERY/BROWSING MODE
- The customer has NOT committed to buying yet.
- You are **STRICTLY PROHIBITED** from using phrases like "دز لي اسمك", "رقم تليفونك", "عنوانك", or "للتوصيل".
- Focus 100% on answering their product questions, showing inventory images, and describing materials. Do not rush the pipeline.
`.trim();
  }

  if (buyCommitted === 1 && orderState !== ORDER_STATES.CONFIRMED) {
    return `
# CURRENT PHASE: CHECKOUT/DATA GATHERING MODE
- The customer has explicitly signaled buying intent.
- You are now authorized to politely extract missing order fields one by one (Name -> Phone -> City) based on what is currently missing in the database context rows.
- Ask for ONE missing field per message; never re-ask a field already marked SAVED above.
`.trim();
  }

  return `
# CURRENT PHASE: ORDER CONFIRMED
- The order is locked in. Do not ask for any personal data again.
- Only confirm delivery timing if the customer asks.
`.trim();
}

/**
 * Dynamic system-prompt block injected from SQLite order state.
 * @param {object} state
 */
function buildDynamicOrderStateBlock(state) {
  const productName = state.order_product_name || "غير محدد بعد";
  const city = state.customer_city
    ? `${state.customer_city} (SAVED! DO NOT ASK AGAIN)`
    : state.customer_address
      ? `${state.customer_address} (SAVED! DO NOT ASK AGAIN)`
      : "MISSING";
  const phone = state.customer_phone
    ? `${state.customer_phone} (SAVED! DO NOT ASK AGAIN)`
    : "MISSING";
  const customerName = state.customer_name
    ? `${state.customer_name} (SAVED)`
    : "MISSING";
  const payment =
    state.payment_method === "cash_on_delivery"
      ? "كاش عند الاستلام (SAVED)"
      : "MISSING";

  const goal = getCurrentGoalString(state);
  const strict = buildStrictExecutionRules(state);
  const conditionalRules = buildConditionalPhaseRules(state);

  return `
# CURRENT ORDER STATE (authoritative — from database):
- order_state: ${state.order_state || ORDER_STATES.AWAITING_PRODUCT}
- buy_committed: ${Number(state.buy_committed) === 1 ? 1 : 0}
- Target Product: ${productName}
- Customer Name: ${customerName}
- Customer Location: ${city}
- Customer Phone: ${phone}
- Payment: ${payment}
- Current Goal: ${goal}

${conditionalRules}

# STRICT EXECUTION FOR THIS TURN:
${strict}
`.trim();
}

module.exports = {
  buildDynamicOrderStateBlock,
  buildConditionalPhaseRules,
  getCurrentGoalString,
  buildStrictExecutionRules,
};
