const { db } = require("../../db/client");
const { generateStoreChatReply } = require("../ai/ai.service");
const { hasOwnerToolAccess } = require("../billing/billing.access");
const { isBillingEnforced } = require("../billing/billing.config");
const { evaluateAiMessageQuota, incrementAiMessageUsage } = require("../plans/aiUsage");
const { effectivePlanTierForStore, tierMeetsFeature } = require("../plans/planMatrix");
const { normalizePublicStoreSlug } = require("./publicSlug");
const { loadActiveProductCatalog, enrichPublicChatMessage } = require("./public.chat.service");
const { refreshLeadScoreAfterCustomerMessage } = require("../leads/leadScoring.service");

function createChatSession(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);

    if (!storeSlug) {
      return res.status(400).json({ message: "storeSlug is required" });
    }

    const storeQuery = db.prepare(`
      SELECT
        id,
        name,
        slug,
        delivery_info,
        ai_prompt,
        logo_url,
        theme_color,
        accent_color,
        policy_text,
        currency_code
FROM stores
WHERE slug = ?
      `);

    const store = storeQuery.get(storeSlug);

    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    const insertSessionQuery = db.prepare(`
        INSERT INTO chat_sessions (store_id, customer_id, channel, last_message_at)
VALUES (?, NULL, 'web', CURRENT_TIMESTAMP)
        `);

    const result = insertSessionQuery.run(store.id);

    const selectSessionQuery = db.prepare(`
          SELECT id, store_id, customer_id, channel, started_at, last_message_at, owner_takeover,
                 lead_score, lead_score_reason, lead_scored_at
FROM chat_sessions
WHERE id = ?
          `);

    const session = selectSessionQuery.get(result.lastInsertRowid);

    return res.status(201).json({
      message: "Chat session created successfully.",
      data: session,
    });
  } catch (err) {
    return res.status(500).json({
      message: "Could not create chat session.",
      error: err.message,
    });
  }
}

async function sendChatMessage(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { session_id, message_text } = req.body;

    const sessionId = Number(session_id);
    const messageText = String(message_text || "").trim();

    if (!storeSlug) {
      return res.status(400).json({ message: "storeSlug is required" });
    }
    if (Number.isNaN(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "there is no session " });
    }
    if (!messageText) {
      return res.status(400).json({ message: "the message is empty" });
    }

    const storeQuery = db.prepare(`
      SELECT
        id,
        name,
        slug,
        ai_prompt,
        delivery_info,
        policy_text,
        subscription_status,
        currency_code,
        plan_tier,
        stripe_price_id,
        trial_started_at,
        trial_ends_at,
        ai_messages_used,
        ai_messages_period_ym
      FROM stores
      WHERE slug = ?
    `);

    const store = storeQuery.get(storeSlug);

    if (!store) {
      return res.status(404).json({ message: "Store not found." });
    }

    const tier = effectivePlanTierForStore(store);
    const allowLeadScoring =
      !isBillingEnforced() || tierMeetsFeature(tier, "lead_scoring");
    const allowMemory =
      !isBillingEnforced() || tierMeetsFeature(tier, "customer_memory");
    const allowFollowups =
      !isBillingEnforced() || tierMeetsFeature(tier, "ai_followups");

    const sessionQuery = db.prepare(`
        SELECT id, store_id, channel, owner_takeover,
               lead_score, lead_score_reason, lead_scored_at
FROM chat_sessions
WHERE id = ? AND store_id = ?`);

    const session = sessionQuery.get(sessionId, store.id);

    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    if (!hasOwnerToolAccess(store)) {
      return res.status(403).json({
        message: "Store AI chat is disabled for this store.",
        code: "STORE_AI_DISABLED",
      });
    }

    const takeoverActive = Number(session.owner_takeover) === 1;
    if (!takeoverActive) {
      const quota = evaluateAiMessageQuota(store);
      if (!quota.ok) {
        return res.status(429).json({
          code: quota.code,
          message: quota.message,
          used: quota.used,
          limit: quota.limit,
          tier: quota.tier,
        });
      }
    }

    const insertCustomerMessageQuery = db.prepare(
      `INSERT INTO chat_messages (session_id, sender_type, message_text, intent, payload)
VALUES (?, 'customer', ?, NULL, NULL)`
    );

    const customerIns = insertCustomerMessageQuery.run(session.id, messageText);
    const customerMsgId = customerIns.lastInsertRowid;

    let leadSnapshot = { lead_score: null, lead_score_reason: null };
    if (allowLeadScoring) {
      leadSnapshot = refreshLeadScoreAfterCustomerMessage(
        db,
        session.id,
        store.id,
        customerMsgId
      );
    }

    const products = loadActiveProductCatalog(store.id);

    const updateSessionQuery = db.prepare(`
    UPDATE chat_sessions
SET last_message_at = CURRENT_TIMESTAMP
WHERE id = ?`);

    updateSessionQuery.run(session.id);

    const latestMessagesQuery = db.prepare(`
  SELECT id, session_id, sender_type, message_text, intent, payload, created_at
FROM chat_messages
WHERE session_id = ?
ORDER BY id DESC
LIMIT 2`);

    if (takeoverActive) {
      const latestRows = latestMessagesQuery.all(session.id).reverse();
      const latestMessages = latestRows.map((row) => enrichPublicChatMessage(row, products));
      return res.status(201).json({
        message: "Message sent successfully.",
        data: {
          session_id: session.id,
          messages: latestMessages,
          owner_takeover_active: true,
          lead_score: leadSnapshot.lead_score,
          lead_score_reason: leadSnapshot.lead_score_reason,
        },
      });
    }

    const conversationMessages = db
      .prepare(
        `
      SELECT sender_type, message_text
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT 8
    `
      )
      .all(session.id)
      .reverse();

    let memoryFacts = [];
    if (allowMemory) {
      memoryFacts = db
        .prepare(
          `
        SELECT id, fact_text
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
        SELECT id, followup_text
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
      messageText,
      conversationMessages,
      memoryFacts,
      followups,
    });

    const aiReplyText = aiResult.reply;
    const recommendedIds = Array.isArray(aiResult.recommended_product_ids)
      ? aiResult.recommended_product_ids
      : [];

    const payloadStr = JSON.stringify({ recommended_product_ids: recommendedIds });

    const insertAiMessageQuery = db.prepare(`
  INSERT INTO chat_messages (session_id, sender_type, message_text, intent, payload)
VALUES (?, 'ai', ?, 'ai_reply', ?)
`);

    insertAiMessageQuery.run(session.id, aiReplyText, payloadStr);

    incrementAiMessageUsage(store.id);

    updateSessionQuery.run(session.id);

    const latestRows = latestMessagesQuery.all(session.id).reverse();

    const latestMessages = latestRows.map((row) => enrichPublicChatMessage(row, products));

    return res.status(201).json({
      message: "Message sent successfully.",
      data: {
        session_id: session.id,
        messages: latestMessages,
        lead_score: leadSnapshot.lead_score,
        lead_score_reason: leadSnapshot.lead_score_reason,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Could not send chat message.",
      error: err.message,
    });
  }
}

function getChatSessionMessages(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { sessionId } = req.params;
    const chatSessionId = Number(sessionId);

    if (!storeSlug) {
      return res.status(400).json({ message: "storeSlug is required." });
    }

    if (Number.isNaN(chatSessionId) || chatSessionId <= 0) {
      return res.status(400).json({ message: "sessionId must be a valid positive number." });
    }

    const store_query = db.prepare(`
      SELECT id, name, slug
FROM stores
WHERE slug = ?`);

    const storeQ = store_query.get(storeSlug);

    if (!storeQ) {
      return res.status(404).json({ message: "Store not found." });
    }

    const check_session = db.prepare(
      `SELECT id, store_id, channel, started_at, last_message_at, owner_takeover,
              lead_score, lead_score_reason, lead_scored_at
FROM chat_sessions
WHERE id = ? AND store_id = ?`
    );

    const session = check_session.get(chatSessionId, storeQ.id);

    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    const chat_messages = db.prepare(`
        SELECT id, session_id, sender_type, message_text, intent, payload, created_at
FROM chat_messages
WHERE session_id = ?
ORDER BY id ASC`);

    const rows = chat_messages.all(session.id);

    const catalog = loadActiveProductCatalog(storeQ.id);
    const messages = rows.map((row) => enrichPublicChatMessage(row, catalog));

    return res.status(200).json({
      data: {
        session,
        messages,
      },
    });
  } catch (err) {
    return res.status(500).json({
      message: "Could not load chat messages.",
      error: err.message,
    });
  }
}

module.exports = {
  createChatSession,
  sendChatMessage,
  getChatSessionMessages,
};
