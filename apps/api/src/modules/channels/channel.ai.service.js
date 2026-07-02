const { db } = require("../../db/client");
const { generateStoreChatReply } = require("../ai/ai.service");
const { hasOwnerToolAccess, ownerAccessReason } = require("../billing/billing.access");
const { shouldEnforcePlansForStore } = require("../billing/billing.demoOverride");
const { getStorePlanContext } = require("../plans/planEntitlements");
const {
  evaluateAiMessageQuota,
  incrementAiMessageUsage,
} = require("../plans/aiUsage");
const {
  tierMeetsFeature,
} = require("../plans/planMatrix");
const { loadActiveProductCatalog } = require("../public/public.chat.service");
const {
  sendInstagramTextWithEncryptedToken,
  sendInstagramImagesWithEncryptedToken,
} = require("../instagram/instagram.send.service");
const {
  getActiveConnectionById,
  getConversationById,
  listChannelMessagesForAi,
  insertOutboundChannelMessage,
} = require("./channel.repository");
const { resolvePublicMediaUrl } = require("../../lib/publicMediaUrl");
const {
  getProductImagePaths,
  MAX_DM_IMAGES_PER_MESSAGE,
} = require("../../lib/productImages");
const {
  detectConversationPhase,
  productImagesAlreadySent,
  summarizeCheckoutContext,
} = require("./conversationPhase");

/**
 * Append product names only — no store URLs (Instagram DM stays in-chat).
 *
 * @param {string} replyText
 * @param {object[]} products
 * @param {number[]} recommendedIds
 * @returns {string}
 */
function appendProductNamesForDm(replyText, products, recommendedIds) {
  if (!recommendedIds.length) {
    return replyText;
  }

  const byId = new Map(products.map((p) => [Number(p.id), p]));
  const lines = [];

  for (const id of recommendedIds) {
    const product = byId.get(Number(id));
    if (!product) continue;
    lines.push(`• ${product.name}`);
  }

  if (!lines.length) return replyText;
  return `${replyText}\n\nمنتجات مقترحة:\n${lines.join("\n")}`;
}

/**
 * @param {object[]} products
 * @param {number[]} recommendedIds
 * @returns {string[]}
 */
function collectDmProductImageUrls(products, recommendedIds) {
  const urls = [];
  const seen = new Set();
  const byId = new Map(products.map((p) => [Number(p.id), p]));

  for (const id of recommendedIds) {
    const product = byId.get(Number(id));
    if (!product) continue;

    for (const path of getProductImagePaths(product)) {
      const abs = resolvePublicMediaUrl(path);
      if (!abs || seen.has(abs)) continue;
      seen.add(abs);
      urls.push(abs);
      if (urls.length >= MAX_DM_IMAGES_PER_MESSAGE) {
        return urls;
      }
    }
  }

  return urls;
}

const SKIP_NOTICE_MESSAGES = {
  trial_expired:
    "عيني، التجربة المجانية للمتجر انتهت حالياً. ثواني وصاحب المتجر راح يكمل وياك — أو تواصل وياه مباشرة.",
  suspended:
    "عيني، خدمة الرد التلقائي متوقفة مؤقتاً. راح يتواصل وياك صاحب المتجر بأقرب وقت.",
  payment_required:
    "عيني، خدمة الرد التلقائي متوقفة مؤقتاً. راح يتواصل وياك صاحب المتجر بأقرب وقت.",
  subscription_inactive:
    "عيني، خدمة الرد التلقائي متوقفة مؤقتاً. راح يتواصل وياك صاحب المتجر بأقرب وقت.",
  AI_QUOTA_EXCEEDED:
    "عيني، وصلنا للحد الشهري للردود التلقائية. صاحب المتجر راح يكمل وياك — انتظرني لحظة.",
};

async function notifyCustomerAiUnavailable({
  connection,
  conversationId,
  storeId,
  customerIgsid,
  reason,
}) {
  const text =
    SKIP_NOTICE_MESSAGES[reason] ||
    "عيني، الرد التلقائي متوقف مؤقتاً. صاحب المتجر راح يكمل وياك قريباً.";

  const sendResult = await sendInstagramTextWithEncryptedToken({
    connection,
    recipientIgsid: customerIgsid,
    text,
  });

  insertOutboundChannelMessage({
    conversationId,
    storeId,
    mid: sendResult.ok ? sendResult.messageId : null,
    text,
    senderType: "system",
    deliveryStatus: sendResult.ok ? "sent" : "failed",
    payload: sendResult.ok ? { skip_reason: reason } : { skip_reason: reason, send_error: sendResult.error },
  });

  if (!sendResult.ok) {
    console.error(
      `[channel-ai] skip notice send failed conversation=${conversationId}: ${sendResult.error}`
    );
  }
}

/**
 * Async AI reply pipeline for Instagram DM (phase 4B).
 * Must not block webhook HTTP response.
 *
 * @param {{
 *   storeId: number,
 *   conversationId: number,
 *   connectionId: number,
 *   customerIgsid: string,
 *   inboundText: string,
 *   inboundImageUrls?: string[]
 * }} input
 */
async function processChannelAiReply({
  storeId,
  conversationId,
  connectionId,
  customerIgsid,
  inboundText,
  inboundImageUrls = [],
}) {
  const inboundPreview = String(inboundText || "").trim().slice(0, 80);
  const imageCount = Array.isArray(inboundImageUrls) ? inboundImageUrls.length : 0;
  console.info(
    `[channel-ai] start store=${storeId} conversation=${conversationId} text="${inboundPreview}" images=${imageCount}`
  );

  const store = db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          ai_prompt,
          delivery_info,
          policy_text,
          currency_code,
          subscription_status,
          plan_tier,
          stripe_price_id,
          trial_started_at,
          trial_ends_at,
          ai_messages_used,
          ai_messages_period_ym
        FROM stores
        WHERE id = ?
      `
    )
    .get(storeId);

  if (!store) {
    console.warn(`[channel-ai] store missing id=${storeId}`);
    return;
  }

  const connection = getActiveConnectionById(connectionId);
  if (!connection) {
    console.warn(`[channel-ai] connection missing id=${connectionId}`);
    return;
  }

  if (!hasOwnerToolAccess(store)) {
    const reason = ownerAccessReason(store);
    console.warn(
      `[channel-ai] skip store=${storeId} — billing/access (${reason})`
    );
    await notifyCustomerAiUnavailable({
      connection,
      conversationId,
      storeId,
      customerIgsid,
      reason,
    });
    return;
  }

  const conversation = getConversationById(conversationId);
  if (!conversation) {
    console.warn(`[channel-ai] conversation missing id=${conversationId}`);
    return;
  }

  if (Number(conversation.owner_takeover) === 1) {
    console.info(
      `[channel-ai] skip conversation=${conversationId} — takeover active`
    );
    return;
  }

  const quota = evaluateAiMessageQuota(store);
  if (!quota.ok) {
    console.warn(
      `[channel-ai] skip store=${storeId} — ${quota.code} used=${quota.used} limit=${quota.limit}`
    );
    await notifyCustomerAiUnavailable({
      connection,
      conversationId,
      storeId,
      customerIgsid,
      reason: quota.code,
    });
    return;
  }

  const { tier } = getStorePlanContext(store.id);
  const enforcePlans = shouldEnforcePlansForStore(store.id);
  const allowMemory =
    !enforcePlans || tierMeetsFeature(tier, "customer_memory");
  const allowFollowups =
    !enforcePlans || tierMeetsFeature(tier, "ai_followups");

  const products = loadActiveProductCatalog(store.id);
  const history = listChannelMessagesForAi(conversationId, 8);

  let priorHistory = history;
  let currentText = inboundText;
  const imageUrls = Array.isArray(inboundImageUrls)
    ? inboundImageUrls.filter((u) => typeof u === "string" && u.trim())
    : [];

  if (history.length > 0) {
    const last = history[history.length - 1];
    if (last.sender_type === "customer") {
      priorHistory = history.slice(0, -1);
      currentText =
        String(inboundText || "").trim() ||
        String(last.message_text || "").trim();
    }
  }

  if (!String(currentText || "").trim() && !imageUrls.length) {
    console.warn(
      `[channel-ai] empty inbound content conversation=${conversationId} — abort`
    );
    return;
  }

  let memoryFacts = [];
  if (allowMemory) {
    memoryFacts = db
      .prepare(
        `
          SELECT fact_text
          FROM store_memory_facts
          WHERE store_id = ?
          ORDER BY sort_order ASC, id ASC
          LIMIT 40
        `
      )
      .all(store.id);
  }

  let followups = [];
  if (allowFollowups) {
    followups = db
      .prepare(
        `
          SELECT followup_text
          FROM store_ai_followups
          WHERE store_id = ?
          ORDER BY sort_order ASC, id ASC
          LIMIT 40
        `
      )
      .all(store.id);
  }

  const fullHistory = history;
  const phase = detectConversationPhase(fullHistory, currentText);
  const checkoutContext = summarizeCheckoutContext(fullHistory, currentText);
  const imagesSent = productImagesAlreadySent(fullHistory);

  console.info(
    `[channel-ai] phase=${phase} imagesSent=${imagesSent} missing=${checkoutContext.missing.join("|") || "none"}`
  );

  const aiResult = await generateStoreChatReply({
    store,
    products,
    messageText: currentText,
    conversationMessages: priorHistory,
    memoryFacts,
    followups,
    channelContext: "instagram_dm",
    customerImageUrls: imageUrls,
    conversationPhase: phase,
    checkoutContext,
  });

  let recommendedIds = Array.isArray(aiResult.recommended_product_ids)
    ? aiResult.recommended_product_ids
    : [];

  if (phase === "checkout" || imagesSent) {
    recommendedIds = [];
  }

  const replyText =
    phase === "checkout"
      ? aiResult.reply
      : appendProductNamesForDm(aiResult.reply, products, recommendedIds);

  const payload = { recommended_product_ids: recommendedIds };

  const sendResult = await sendInstagramTextWithEncryptedToken({
    connection,
    recipientIgsid: customerIgsid,
    text: replyText,
  });

  if (!sendResult.ok) {
    insertOutboundChannelMessage({
      conversationId,
      storeId,
      mid: null,
      text: replyText,
      senderType: "ai",
      deliveryStatus: "failed",
      payload: {
        ...payload,
        send_error: sendResult.error,
      },
    });

    console.error(
      `[channel-ai] send failed conversation=${conversationId}: ${sendResult.error}`
    );
    return;
  }

  insertOutboundChannelMessage({
    conversationId,
    storeId,
    mid: sendResult.messageId,
    text: replyText,
    senderType: "ai",
    deliveryStatus: "sent",
    payload,
  });

  const productImageUrls =
    phase === "checkout" || imagesSent
      ? []
      : collectDmProductImageUrls(products, recommendedIds);
  if (productImageUrls.length) {
    const imgResult = await sendInstagramImagesWithEncryptedToken({
      connection,
      recipientIgsid: customerIgsid,
      imageUrls: productImageUrls,
    });

    if (imgResult.ok) {
      insertOutboundChannelMessage({
        conversationId,
        storeId,
        mid: imgResult.messageId,
        text: `[${productImageUrls.length} صور منتج]`,
        senderType: "ai",
        deliveryStatus: "sent",
        messageType: "image",
        payload: {
          image_urls: productImageUrls,
          recommended_product_ids: recommendedIds,
        },
      });
      console.info(
        `[channel-ai] sent images conversation=${conversationId} count=${productImageUrls.length} mid=${imgResult.messageId}`
      );
    } else {
      console.warn(
        `[channel-ai] image send failed conversation=${conversationId}: ${imgResult.error}`
      );
    }
  }

  incrementAiMessageUsage(store.id);
  console.info(
    `[channel-ai] sent conversation=${conversationId} mid=${sendResult.messageId}`
  );
}

module.exports = {
  processChannelAiReply,
  appendProductNamesForDm,
  collectDmProductImageUrls,
};
