const { db } = require("../../db/client");
const { generateStoreChatReply, buildSafeCustomerReply } = require("../ai/ai.service");
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
  saveConversationOrderState,
  getConversationOrderState,
  setConversationHumanTakeover,
} = require("./channel.repository");
const { resolvePublicMediaUrl } = require("../../lib/publicMediaUrl");
const {
  getProductImagePaths,
  MAX_DM_IMAGES_PER_MESSAGE,
} = require("../../lib/productImages");
const {
  ORDER_STATES,
  syncOrderStateAfterInbound,
  shouldAttachProductImages,
  customerExplicitlyRequestsImages,
  customerRequestsHumanAgent,
  orderStateToCheckoutContext,
  orderStateToConversationPhase,
  computeOrderState,
  prepareOrderStateForPersist,
} = require("./orderState.service");
const { buildDynamicOrderStateBlock } = require("./dynamicOrderPrompt");
const { detectConversationPhase } = require("./conversationPhase");
const { listSalesExamplesForStore } = require("../salesTraining/salesExamples.repository");
const {
  canCreateOrderFromState,
  createOrderFromConversationState,
  aiIndicatesOrderFinalized,
  reconcileConversationLinkedOrder,
} = require("./conversationOrder.service");

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

/** Single warm line sent once when the customer is handed off to a human agent. */
const HUMAN_HANDOVER_MESSAGE =
  "تدلل عيوني الغالي، الحين راح أحولك على موظف من الإدارة يتابع وياك تفاصيلك فوراً. ثواني وياك.";

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
          store_vertical,
          reply_dialect,
          default_payment,
          sell_summary,
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

  // Human Handover Protocol: once flagged, the AI stays fully muted until the owner
  // acts on the conversation (the takeover toggle clears is_human_takeover).
  if (Number(conversation.is_human_takeover) === 1) {
    console.info(
      `[channel-ai] skip conversation=${conversationId} — human handover active`
    );
    return;
  }

  // Trigger turn: customer explicitly asks for a human/manager/support agent.
  if (customerRequestsHumanAgent(inboundText)) {
    setConversationHumanTakeover(conversationId, storeId);

    const sendResult = await sendInstagramTextWithEncryptedToken({
      connection,
      recipientIgsid: customerIgsid,
      text: HUMAN_HANDOVER_MESSAGE,
    });

    insertOutboundChannelMessage({
      conversationId,
      storeId,
      mid: sendResult.ok ? sendResult.messageId : null,
      text: HUMAN_HANDOVER_MESSAGE,
      senderType: "system",
      deliveryStatus: sendResult.ok ? "sent" : "failed",
      payload: { human_handover: true, ...(sendResult.ok ? {} : { send_error: sendResult.error }) },
    });

    console.info(
      `[channel-ai] human handover triggered conversation=${conversationId} store=${storeId} — AI muted, dashboard flagged`
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
  const history = listChannelMessagesForAi(conversationId, 10);

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
  const orderState = syncOrderStateAfterInbound(
    conversationId,
    currentText,
    fullHistory,
    products
  );
  let phase = orderStateToConversationPhase(orderState.order_state);
  if (phase !== "checkout") {
    const heuristicPhase = detectConversationPhase(fullHistory, currentText);
    if (heuristicPhase === "objection") {
      phase = "objection";
    }
  }
  const checkoutContext = orderStateToCheckoutContext(orderState);
  const orderStateBlock = buildDynamicOrderStateBlock(orderState);
  const customerRequestedImages = customerExplicitlyRequestsImages(currentText);
  let attachImages = shouldAttachProductImages(
    fullHistory,
    currentText,
    orderState.order_state
  );

  console.info(
    `[channel-ai] phase=${phase} order_state=${orderState.order_state} attachImages=${attachImages} imageOverride=${customerRequestedImages} missing=${checkoutContext.missing.join("|") || "none"}`
  );

  const salesExamples = listSalesExamplesForStore(store.id);

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
    orderStateBlock,
    customerRequestedImages,
    salesExamples,
  });

  let recommendedIds = Array.isArray(aiResult.recommended_product_ids)
    ? aiResult.recommended_product_ids
    : [];

  const visionHandoff = Boolean(
    aiResult.vision_handoff ||
      aiResult.needs_human_handoff ||
      (imageUrls.length > 0 && aiResult.image_match_confidence !== "high")
  );

  if (visionHandoff) {
    recommendedIds = [];
    attachImages = false;
  } else if (phase === "objection" && !customerRequestedImages) {
    recommendedIds = [];
  } else if (!attachImages) {
    recommendedIds = [];
  } else if (!recommendedIds.length && orderState.order_product_id) {
    recommendedIds = [Number(orderState.order_product_id)];
  }

  if (
    recommendedIds.length &&
    orderState.order_state === ORDER_STATES.AWAITING_PRODUCT
  ) {
    const product = products.find(
      (p) => Number(p.id) === Number(recommendedIds[0])
    );
    if (product) {
      saveConversationOrderState(conversationId, {
        order_product_id: Number(product.id),
        order_product_name: String(product.name || "").trim(),
        order_state: computeOrderState({
          ...orderState,
          order_product_id: Number(product.id),
          order_product_name: String(product.name || "").trim(),
        }),
      });
    }
  }

  let replyText = visionHandoff
    ? aiResult.reply
    : phase === "checkout" || phase === "objection"
      ? aiResult.reply
      : appendProductNamesForDm(aiResult.reply, products, recommendedIds);

  replyText = buildSafeCustomerReply(replyText, { phase, checkoutContext });
  if (!replyText.trim()) {
    console.warn(`[channel-ai] empty reply blocked conversation=${conversationId}`);
    return;
  }

  const persistState = prepareOrderStateForPersist(
    conversationId,
    getConversationOrderState(conversationId),
    {
      inboundText: currentText,
      history: fullHistory,
      products,
      aiReply: aiResult.reply,
    }
  );
  const linkMeta = reconcileConversationLinkedOrder(
    conversationId,
    storeId,
    persistState
  );
  const linkedOrderId = linkMeta.linkedOrderId;
  const shouldPersistOrder =
    canCreateOrderFromState(persistState, linkedOrderId) ||
    (aiIndicatesOrderFinalized(aiResult, persistState) && !linkedOrderId);

  if (shouldPersistOrder) {
    const orderResult = createOrderFromConversationState({
      conversationId,
      storeId,
      orderState: persistState,
    });
    if (orderResult.created) {
      console.info(
        `[channel-ai] order persisted conversation=${conversationId} order_id=${orderResult.order_id} (state hard-reset in DB transaction)`
      );
    } else if (orderResult.reason === "already_created") {
      console.info(
        `[channel-ai] order already in dashboard conversation=${conversationId} order_id=${orderResult.order_id} hidden=${orderResult.is_hidden ? "yes" : "no"}`
      );
    } else {
      console.warn(
        `[channel-ai] order persist skipped conversation=${conversationId} reason=${orderResult.reason} debug=${JSON.stringify(orderResult.debug || {})}`
      );
    }
  } else {
    console.info(
      `[channel-ai] order not ready conversation=${conversationId} state=${persistState.order_state} product=${persistState.order_product_id || "none"} phone=${persistState.customer_phone || "none"} city=${persistState.customer_city || "none"} linked_order=${linkedOrderId || "none"}`
    );
  }

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

  const productImageUrls = attachImages
    ? collectDmProductImageUrls(products, recommendedIds)
    : [];
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
