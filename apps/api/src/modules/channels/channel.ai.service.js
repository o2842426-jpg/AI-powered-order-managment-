const { db } = require("../../db/client");
const { generateStoreChatReply } = require("../ai/ai.service");
const { hasOwnerToolAccess } = require("../billing/billing.access");
const { isBillingEnforced } = require("../billing/billing.config");
const {
  evaluateAiMessageQuota,
  incrementAiMessageUsage,
} = require("../plans/aiUsage");
const {
  effectivePlanTierForStore,
  tierMeetsFeature,
} = require("../plans/planMatrix");
const { loadActiveProductCatalog } = require("../public/public.chat.service");
const { sendInstagramTextWithEncryptedToken } = require("../instagram/instagram.send.service");
const {
  getActiveConnectionById,
  getConversationById,
  listChannelMessagesForAi,
  insertOutboundChannelMessage,
} = require("./channel.repository");

const FRONTEND_URL = String(process.env.FRONTEND_URL || "").replace(/\/$/, "");

/**
 * v1 DM: append plain-text product links when AI recommends product ids.
 *
 * @param {string} replyText
 * @param {object[]} products
 * @param {number[]} recommendedIds
 * @param {string} storeSlug
 * @returns {string}
 */
function appendProductLinksForDm(replyText, products, recommendedIds, storeSlug) {
  if (!recommendedIds.length || !FRONTEND_URL || !storeSlug) {
    return replyText;
  }

  const byId = new Map(products.map((p) => [Number(p.id), p]));
  const lines = [];

  for (const id of recommendedIds) {
    const product = byId.get(Number(id));
    if (!product) continue;
    lines.push(`• ${product.name}: ${FRONTEND_URL}/store/${storeSlug}?product=${product.id}`);
  }

  if (!lines.length) return replyText;
  return `${replyText}\n\nمنتجات مقترحة:\n${lines.join("\n")}`;
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
 *   inboundText: string
 * }} input
 */
async function processChannelAiReply({
  storeId,
  conversationId,
  connectionId,
  customerIgsid,
  inboundText,
}) {
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

  if (!hasOwnerToolAccess(store)) {
    console.info(`[channel-ai] skip store=${storeId} — billing/access`);
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
    console.info(`[channel-ai] skip store=${storeId} — ${quota.code}`);
    return;
  }

  const connection = getActiveConnectionById(connectionId);
  if (!connection) {
    console.warn(`[channel-ai] connection missing id=${connectionId}`);
    return;
  }

  const tier = effectivePlanTierForStore(store);
  const allowMemory =
    !isBillingEnforced() || tierMeetsFeature(tier, "customer_memory");
  const allowFollowups =
    !isBillingEnforced() || tierMeetsFeature(tier, "ai_followups");

  const products = loadActiveProductCatalog(store.id);
  const history = listChannelMessagesForAi(conversationId, 8);

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

  const aiResult = await generateStoreChatReply({
    store,
    products,
    messageText: inboundText,
    conversationMessages: history,
    memoryFacts,
    followups,
  });

  const recommendedIds = Array.isArray(aiResult.recommended_product_ids)
    ? aiResult.recommended_product_ids
    : [];

  const replyText = appendProductLinksForDm(
    aiResult.reply,
    products,
    recommendedIds,
    store.slug
  );

  const payload = { recommended_product_ids: recommendedIds };

  const sendResult = await sendInstagramTextWithEncryptedToken({
    connection,
    recipientIgsid: customerIgsid,
    text: replyText,
  });

  if (sendResult.ok) {
    insertOutboundChannelMessage({
      conversationId,
      storeId,
      mid: sendResult.messageId,
      text: replyText,
      senderType: "ai",
      deliveryStatus: "sent",
      payload,
    });
    incrementAiMessageUsage(store.id);
    console.info(
      `[channel-ai] sent conversation=${conversationId} mid=${sendResult.messageId}`
    );
    return;
  }

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
}

module.exports = {
  processChannelAiReply,
  appendProductLinksForDm,
};
