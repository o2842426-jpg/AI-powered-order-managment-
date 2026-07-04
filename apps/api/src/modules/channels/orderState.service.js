const {
  getConversationOrderState,
  saveConversationOrderState,
} = require("./channel.repository");
const { ORDER_STATES, IRAQI_GOVERNORATES } = require("./orderState.constants");

const BUY_SIGNALS =
  /اشتري|أريد\s*اشتري|اريد\s*اشتري|أريد\s*أطلب|اريد\s*أطلب|أريد\s*اطلب|اريد\s*اطلب|ابي\s*اشتري|أبي\s*اشتري|ابي\s*اطلب|أبي\s*اطلب|(?:^|[\s،,])(?:أطلب|اطلب)(?:[\s،,]|$)|ثبت|ثبتلي|ثبّت|احجز|كمل|كمّل|كمل\s*الطلب|رتب|اي\s*ثبت|أي\s*ثبت|ابشر\s*ثبت|اوكي\s*اشتري|تمام\s*اشتري|طلب\s*جديد/i;

const NEW_CHECKOUT_INTENT =
  /(?:أريد|اريد|ابي|أبي)\s*(?:أطلب|اطلب|اشتري|أطلب)|(?:^|[\s،,])(?:أطلب|اطلب)\s|طلب\s*جديد/i;

const PHONE_IN_TEXT =
  /(?:^|[\s،,؛:]|رقم(?:ي|الهاتف)?\s*)(\+?964?)?(0?7\d{9})(?:[\s،,؛.]|$)/;

/**
 * @param {string} text
 */
function extractPhoneFromText(text) {
  const t = String(text || "");
  const loose = t.match(PHONE_IN_TEXT);
  if (loose) {
    const digits = String(loose[2] || "").replace(/\D/g, "");
    if (digits.length === 10 && digits.startsWith("7")) {
      return `0${digits}`;
    }
    if (digits.length === 11 && digits.startsWith("07")) {
      return digits;
    }
  }
  const strict =
    t.match(/\b(07\d{9})\b/) || t.match(/\b(\+9647\d{9})\b/);
  if (strict) {
    return strict[1].replace(/^\+964/, "0");
  }
  return null;
}

/**
 * @param {string} text
 */
function isNewCheckoutIntent(text) {
  return NEW_CHECKOUT_INTENT.test(String(text || "").trim());
}

/**
 * Apply contact fields from texts; later texts override earlier ones.
 *
 * @param {object} merged
 * @param {string[]} texts
 */
function applyContactFieldsLatestWins(merged, texts) {
  for (const text of texts) {
    const extracted = extractFieldsFromMessage(text);
    if (extracted.customer_phone) {
      merged.customer_phone = extracted.customer_phone;
    }
    if (extracted.customer_name) {
      merged.customer_name = extracted.customer_name;
    }
    if (extracted.customer_city) {
      merged.customer_city = extracted.customer_city;
    }
    if (extracted.customer_address) {
      merged.customer_address = extracted.customer_address;
    }
    if (extracted.payment_method) {
      merged.payment_method = extracted.payment_method;
    }
    if (extracted.buy_confirmed) {
      merged.buy_committed = 1;
    }
  }
  return merged;
}

const IMAGE_REQUEST =
  /صور|صورة|صوره|شكلها|شكل|شكله|ورّيني|وريني|شوفني|شوف|دزلي|دزليياها|دزلي\s*ياها|ارسل.*صور|أرسل.*صور|ابعث.*صور|ابي\s*اشوف|أبي\s*اشوف|ممكن\s*اشوف|شلون\s*شكلها/i;

/**
 * Explicit customer request for product visuals — bypasses throttle and checkout image lock.
 * @param {string} text
 */
function customerExplicitlyRequestsImages(text) {
  return IMAGE_REQUEST.test(String(text || "").trim());
}

const CITY_PATTERN = new RegExp(
  `(?:محافظتي|محافظة|عنوان\\s*التوصيل|توصيل\\s*(?:إلى|الى|ل|لي)?|أنا\\s*من|انا\\s*من)\\s*[:\\-]?\\s*(${IRAQI_GOVERNORATES.join("|")})`,
  "i"
);

const DELIVERY_TO_CITY = new RegExp(
  `توصيل\\s*(?:ل|إلى|الى|لي)?\\s*(${IRAQI_GOVERNORATES.join("|")})`,
  "i"
);

const INLINE_CITY = new RegExp(
  `(?:^|[\\s،,])(?:ل)?(${IRAQI_GOVERNORATES.join("|")})(?:[\\s،,.]|$)`,
  "i"
);

const STANDALONE_CITY = new RegExp(
  `^\\s*(${IRAQI_GOVERNORATES.join("|")})\\s*$`,
  "i"
);

/**
 * @param {string} text
 * @param {object[]} [products]
 */
function inferProductFromText(text, products = []) {
  const haystack = String(text || "").toLowerCase();
  if (!haystack.trim()) return {};

  let best = null;
  let bestScore = 0;

  for (const product of products || []) {
    const name = String(product.name || "").trim();
    if (!name) continue;

    const nameLower = name.toLowerCase();
    if (haystack.includes(nameLower)) {
      return {
        order_product_id: Number(product.id),
        order_product_name: name,
      };
    }

    const tokens = nameLower.split(/[\s\-]+/).filter((t) => t.length >= 4);
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += token.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = product;
    }
  }

  if (best && bestScore >= 6) {
    return {
      order_product_id: Number(best.id),
      order_product_name: String(best.name || "").trim(),
    };
  }

  return {};
}

/**
 * @param {string} text
 */
function extractFieldsFromMessage(text) {
  const t = String(text || "").trim();
  const patch = {};

  const phoneMatch = extractPhoneFromText(t);
  if (phoneMatch) {
    patch.customer_phone = phoneMatch;
  }

  const cityMatch =
    t.match(CITY_PATTERN) ||
    t.match(DELIVERY_TO_CITY) ||
    t.match(INLINE_CITY) ||
    t.match(STANDALONE_CITY);
  if (cityMatch) {
    patch.customer_city = normalizeCity(cityMatch[1]);
  }

  if (/كاش\s*عند\s*الاستلام|الدفع\s*كاش|دفع\s*عند\s*الاستلام/i.test(t)) {
    patch.payment_method = "cash_on_delivery";
  }

  const nameMatch =
    t.match(/(?:اسمي|أنا)\s+(.+?)(?:\s*[،,]\s*رقمي|\s+رقمي|\s*[،,]|$)/i) ||
    t.match(/(?:اسمي|أنا)\s+([^\n]{4,80})/i);
  if (nameMatch) {
    patch.customer_name = nameMatch[1].trim().replace(/\s+رقمي.*$/i, "").trim();
  }

  const addressMatch = t.match(
    /(?:عنواني|العنوان|عنوان\s*التوصيل)\s*[:\-]?\s*([^\n]{5,120})/i
  );
  if (addressMatch) {
    patch.customer_address = addressMatch[1].trim();
  }

  if (BUY_SIGNALS.test(t)) {
    patch.buy_confirmed = true;
  }

  if (
    patch.customer_phone &&
    patch.customer_name &&
    (patch.customer_city || patch.customer_address)
  ) {
    patch.buy_confirmed = true;
  }

  return patch;
}

function normalizeCity(raw) {
  const c = String(raw || "").trim();
  if (/موصل/i.test(c)) return "الموصل";
  if (/اربيل/i.test(c)) return "أربيل";
  if (/انبار/i.test(c)) return "الأنبار";
  if (/سليمان/i.test(c)) return "السليمانية";
  return c;
}

/**
 * @param {object} row
 */
function computeOrderState(row) {
  const hasProduct = Boolean(row.order_product_id || row.order_product_name);
  const hasLocation = Boolean(row.customer_city || row.customer_address);
  const hasPhone = Boolean(row.customer_phone);
  const buyCommitted = Boolean(row.buy_committed);

  if (!hasProduct || !buyCommitted) {
    return ORDER_STATES.AWAITING_PRODUCT;
  }
  if (!hasLocation) {
    return ORDER_STATES.AWAITING_LOCATION;
  }
  if (!hasPhone) {
    return ORDER_STATES.AWAITING_PHONE;
  }
  return ORDER_STATES.CONFIRMED_AWAITING_FINALIZE;
}

/**
 * @param {{ sender_type?: string, message_text?: string, payload?: string }[]} history
 * @param {object[]} products
 */
function inferProductFromThread(history, products) {
  const aiLines = (history || [])
    .filter((m) => m.sender_type === "ai")
    .map((m) => String(m.message_text || ""))
    .join("\n");

  for (const product of products || []) {
    const name = String(product.name || "").trim();
    if (name && aiLines.includes(name)) {
      return { order_product_id: Number(product.id), order_product_name: name };
    }
  }

  for (const msg of history || []) {
    if (msg.sender_type !== "ai" || !msg.payload) continue;
    try {
      const payload =
        typeof msg.payload === "string" ? JSON.parse(msg.payload) : msg.payload;
      const ids = payload?.recommended_product_ids;
      if (Array.isArray(ids) && ids.length) {
        const pid = Number(ids[0]);
        const product = (products || []).find((p) => Number(p.id) === pid);
        if (product) {
          return {
            order_product_id: pid,
            order_product_name: String(product.name || "").trim(),
          };
        }
      }
    } catch {
      /* ignore */
    }
  }

  return {};
}

/**
 * Backfill missing fields from recent thread (handles pre-migration conversations).
 *
 * @param {object} row
 * @param {{ message_text?: string }[]} history
 */
function enrichOrderStateFromHistory(row, history, products = []) {
  const merged = { ...row };
  const lines = (history || [])
    .map((m) => String(m.message_text || ""))
    .filter(Boolean);

  // Newest customer/AI lines win — avoids stale phone from an earlier checkout.
  for (const line of [...lines].reverse()) {
    const extracted = extractFieldsFromMessage(line);
    if (!merged.customer_phone && extracted.customer_phone) {
      merged.customer_phone = extracted.customer_phone;
    }
    if (!merged.customer_city && extracted.customer_city) {
      merged.customer_city = extracted.customer_city;
    }
    if (!merged.customer_name && extracted.customer_name) {
      merged.customer_name = extracted.customer_name;
    }
    if (!merged.customer_address && extracted.customer_address) {
      merged.customer_address = extracted.customer_address;
    }
    if (!merged.payment_method && extracted.payment_method) {
      merged.payment_method = extracted.payment_method;
    }
    if (extracted.buy_confirmed) {
      merged.buy_committed = 1;
    }
  }

  if (!merged.buy_committed && BUY_SIGNALS.test(lines.join("\n"))) {
    merged.buy_committed = 1;
  }

  if (merged.buy_committed && !merged.order_product_name) {
    Object.assign(merged, inferProductFromThread(history, products));
  }

  if (!merged.order_product_name) {
    Object.assign(merged, inferProductFromText(lines.join("\n"), products));
  }

  return merged;
}

/**
 * @param {number} conversationId
 * @param {string} inboundText
 * @param {object[]} history
 * @param {object[]} products
 */
function syncOrderStateAfterInbound(conversationId, inboundText, history, products) {
  const current = getConversationOrderState(conversationId);
  let base = { ...current };

  if (isNewCheckoutIntent(inboundText)) {
    base = {
      ...base,
      order_product_id: null,
      order_product_name: null,
      customer_phone: null,
      customer_name: null,
      customer_address: null,
      buy_committed: 0,
    };
  }

  let merged = enrichOrderStateFromHistory(base, history, products);
  const extracted = extractFieldsFromMessage(inboundText);
  const patch = { ...extracted };

  const historyText = (history || [])
    .map((m) => String(m.message_text || ""))
    .join("\n");

  if (
    patch.buy_confirmed ||
    extracted.customer_city ||
    extracted.customer_phone ||
    BUY_SIGNALS.test(historyText)
  ) {
    Object.assign(merged, inferProductFromThread(history, products));
  }

  if (patch.buy_confirmed || BUY_SIGNALS.test(String(inboundText || ""))) {
    patch.buy_committed = 1;
  }

  merged = {
    ...merged,
    ...patch,
  };

  delete merged.buy_confirmed;

  merged.order_state = computeOrderState(merged);
  saveConversationOrderState(conversationId, merged);
  return merged;
}

/**
 * Merge inbound + AI reply into persistable order state (saved to DB).
 *
 * @param {number} conversationId
 * @param {object} orderState
 * @param {{ inboundText?: string, history?: object[], products?: object[], aiReply?: string }} ctx
 */
function prepareOrderStateForPersist(conversationId, orderState, ctx = {}) {
  const { inboundText = "", history = [], products = [], aiReply = "" } = ctx;

  let base = { ...orderState };
  if (isNewCheckoutIntent(inboundText)) {
    base = {
      ...base,
      order_product_id: null,
      order_product_name: null,
      customer_phone: null,
      customer_name: null,
      customer_address: null,
      buy_committed: 0,
    };
  }

  let merged = enrichOrderStateFromHistory(base, history, products);
  applyContactFieldsLatestWins(merged, [inboundText, aiReply]);

  const combinedText = [
    ...history.map((m) => String(m.message_text || "")),
    inboundText,
    aiReply,
  ].join("\n");

  Object.assign(merged, inferProductFromText(combinedText, products));
  if (!merged.order_product_id) {
    Object.assign(merged, inferProductFromThread(history, products));
  }
  if (!merged.order_product_id) {
    Object.assign(merged, inferProductFromText(aiReply, products));
  }

  if (
    merged.customer_phone &&
    (merged.customer_city || merged.customer_address) &&
    merged.order_product_id
  ) {
    merged.buy_committed = 1;
  }

  if (/ثبّ?ت|تثبّ?ت|الطلب\s*تثبت|تثبت\s*وراح/i.test(String(aiReply || ""))) {
    merged.buy_committed = 1;
  }

  merged.order_state = computeOrderState(merged);
  saveConversationOrderState(conversationId, merged);
  return merged;
}

/**
 * Image throttle: block resend if product image went out in last 3 turns (~6 messages)
 * unless customer explicitly asks for photos.
 *
 * @param {{ sender_type?: string, message_text?: string, message_type?: string, payload?: string }[]} history
 * @param {string} currentText
 * @param {string} orderState
 */
function shouldAttachProductImages(history, currentText, orderState) {
  if (customerExplicitlyRequestsImages(currentText)) {
    return true;
  }

  if (orderState && orderState !== ORDER_STATES.AWAITING_PRODUCT) {
    return false;
  }

  const recent = (history || []).slice(-6);
  return !recent.some((m) => {
    if (m.message_type === "image") return true;
    const text = String(m.message_text || "").trim();
    if (/^\[\d+\s*صور منتج\]$/.test(text)) return true;
    try {
      const payload =
        typeof m.payload === "string" ? JSON.parse(m.payload) : m.payload;
      return Boolean(payload?.image_urls?.length);
    } catch {
      return false;
    }
  });
}

/**
 * @param {object} orderState
 */
function orderStateToCheckoutContext(orderState) {
  const missing = [];
  if (!orderState.customer_name) missing.push("الاسم الثلاثي");
  if (!orderState.customer_phone) missing.push("رقم الهاتف");
  if (!orderState.customer_city && !orderState.customer_address) {
    missing.push("المحافظة والعنوان التفصيلي");
  } else if (!orderState.customer_address) {
    missing.push("العنوان التفصيلي (حي/شارع/أقرب نقطة)");
  }
  if (!orderState.payment_method) {
    missing.push("طريقة الدفع (كاش عند الاستلام)");
  }

  return {
    has: {
      confirmed_buy: orderState.order_state !== ORDER_STATES.AWAITING_PRODUCT,
      governorate: Boolean(orderState.customer_city),
      address: Boolean(orderState.customer_address),
      phone: Boolean(orderState.customer_phone),
      name: Boolean(orderState.customer_name),
      payment_cod: orderState.payment_method === "cash_on_delivery",
    },
    missing,
  };
}

/**
 * @param {string} orderState
 */
function orderStateToConversationPhase(orderState) {
  if (!orderState || orderState === ORDER_STATES.AWAITING_PRODUCT) {
    return "discovery";
  }
  return "checkout";
}

module.exports = {
  ORDER_STATES,
  extractFieldsFromMessage,
  extractPhoneFromText,
  isNewCheckoutIntent,
  applyContactFieldsLatestWins,
  computeOrderState,
  inferProductFromThread,
  enrichOrderStateFromHistory,
  prepareOrderStateForPersist,
  inferProductFromText,
  syncOrderStateAfterInbound,
  customerExplicitlyRequestsImages,
  shouldAttachProductImages,
  orderStateToCheckoutContext,
  orderStateToConversationPhase,
  BUY_SIGNALS,
};
