const { db } = require("../../db/client");
const { assertStoreScope } = require("../stores/storeScope");
const { sendInstagramTextWithEncryptedToken } = require("../instagram/instagram.send.service");
const {
  getChannelConversationForStore,
  updateChannelConversationTakeover,
  getActiveConnectionById,
  insertOutboundChannelMessage,
  listChannelMessagesForStore,
  getInstagramConnectionForStore,
} = require("./channel.repository");

/**
 * GET /api/stores/:storeId/channel-conversations
 * Query: limit (default 50, max 100), offset (default 0), q (optional search on message text)
 */
function listChannelConversations(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const qRaw = req.query.q != null ? String(req.query.q).trim() : "";
    const qClean = qRaw.replace(/[%_]/g, "").slice(0, 120);

    const params = [storeId];
    let searchClause = "";
    if (qClean) {
      searchClause = `
        AND EXISTS (
          SELECT 1 FROM channel_messages cm2
          WHERE cm2.conversation_id = cc.id
            AND cm2.body_text LIKE ?
        )
      `;
      params.push(`%${qClean}%`);
    }

    params.push(limit, offset);

    const rows = db
      .prepare(
        `
          SELECT
            cc.id,
            cc.store_id,
            cc.platform,
            cc.platform_thread_id,
            cc.platform_user_id,
            cc.platform_username,
            cc.customer_id,
            cc.owner_takeover,
            cc.lead_score,
            cc.lead_score_reason,
            cc.lead_scored_at,
            cc.last_message_at,
            cc.created_at,
            cc.created_at AS started_at,
            cc.status,
            c.name AS customer_name,
            c.phone AS customer_phone,
            (
              SELECT COUNT(*)
              FROM channel_messages cm
              WHERE cm.conversation_id = cc.id
            ) AS message_count,
            (
              SELECT cm.body_text
              FROM channel_messages cm
              WHERE cm.conversation_id = cc.id
              ORDER BY cm.id DESC
              LIMIT 1
            ) AS last_message_preview,
            (
              SELECT cm.sender_type
              FROM channel_messages cm
              WHERE cm.conversation_id = cc.id
              ORDER BY cm.id DESC
              LIMIT 1
            ) AS last_sender_type
          FROM channel_conversations cc
          LEFT JOIN customers c ON c.id = cc.customer_id
          WHERE cc.store_id = ?
          ${searchClause}
          ORDER BY datetime(COALESCE(cc.last_message_at, cc.created_at)) DESC, cc.id DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not list channel conversations.",
      error: error.message,
    });
  }
}

/**
 * GET /api/stores/:storeId/channel-conversations/:conversationId
 */
function getChannelConversationDetail(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const conversationId = Number(req.params.conversationId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        message: "conversationId must be a valid positive number.",
      });
    }

    const conversation = getChannelConversationForStore(conversationId, storeId);
    if (!conversation) {
      return res.status(404).json({ message: "Channel conversation not found." });
    }

    const messages = listChannelMessagesForStore(conversationId, 500);

    return res.status(200).json({
      data: {
        conversation: {
          ...conversation,
          started_at: conversation.created_at,
          channel: conversation.platform,
        },
        messages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load channel conversation.",
      error: error.message,
    });
  }
}

/**
 * GET /api/stores/:storeId/channels/instagram
 */
function getInstagramChannelConnection(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const connection = getInstagramConnectionForStore(storeId);
    if (!connection) {
      return res.status(200).json({
        data: {
          connected: false,
          connection: null,
        },
      });
    }

    return res.status(200).json({
      data: {
        connected: true,
        connection,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load Instagram channel connection.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/stores/:storeId/channel-conversations/:conversationId/takeover
 * Body: { enabled: boolean }
 *
 * enabled=true  → human takeover (AI stops replying)
 * enabled=false → release back to AI
 */
function setChannelConversationTakeover(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const conversationId = Number(req.params.conversationId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        message: "conversationId must be a valid positive number.",
      });
    }

    const enabled = req.body?.enabled;
    if (
      enabled !== true &&
      enabled !== false &&
      enabled !== 1 &&
      enabled !== 0
    ) {
      return res.status(400).json({ message: "enabled must be true or false." });
    }

    const ownerTakeover = enabled === true || enabled === 1;

    const existing = getChannelConversationForStore(conversationId, storeId);
    if (!existing) {
      return res.status(404).json({ message: "Channel conversation not found." });
    }

    if (existing.status === "archived") {
      return res.status(409).json({
        message: "Cannot change takeover on an archived conversation.",
        code: "CONVERSATION_ARCHIVED",
      });
    }

    const updated = updateChannelConversationTakeover({
      conversationId,
      storeId,
      ownerTakeover,
    });

    if (!updated) {
      return res.status(404).json({ message: "Channel conversation not found." });
    }

    const conversation = getChannelConversationForStore(conversationId, storeId);

    return res.status(200).json({
      message: ownerTakeover
        ? "Human takeover enabled."
        : "AI handling restored.",
      data: {
        conversation,
        handling: ownerTakeover ? "human" : "ai",
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update channel takeover state.",
      error: error.message,
    });
  }
}

/**
 * POST /api/stores/:storeId/channel-conversations/:conversationId/messages
 * Body: { message_text: string }
 */
async function postChannelOwnerMessage(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const conversationId = Number(req.params.conversationId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(conversationId) || conversationId <= 0) {
      return res.status(400).json({
        message: "conversationId must be a valid positive number.",
      });
    }

    const messageText = String(req.body?.message_text ?? "").trim();
    if (!messageText) {
      return res.status(400).json({ message: "message_text is required." });
    }

    const conversation = getChannelConversationForStore(conversationId, storeId);
    if (!conversation) {
      return res.status(404).json({ message: "Channel conversation not found." });
    }

    if (conversation.status === "archived") {
      return res.status(409).json({
        message: "Cannot send messages on an archived conversation.",
        code: "CONVERSATION_ARCHIVED",
      });
    }

    if (Number(conversation.owner_takeover) !== 1) {
      return res.status(409).json({
        message:
          "Turn on human takeover for this conversation before sending owner messages.",
        code: "TAKEOVER_REQUIRED",
      });
    }

    const connection = getActiveConnectionById(conversation.channel_connection_id);
    if (!connection || connection.store_id !== storeId) {
      return res.status(409).json({
        message: "Instagram channel connection is not available for this store.",
        code: "CHANNEL_CONNECTION_UNAVAILABLE",
      });
    }

    const sendResult = await sendInstagramTextWithEncryptedToken({
      connection,
      recipientIgsid: conversation.platform_thread_id,
      text: messageText,
    });

    if (sendResult.ok) {
      insertOutboundChannelMessage({
        conversationId,
        storeId,
        mid: sendResult.messageId,
        text: messageText,
        senderType: "owner",
        deliveryStatus: "sent",
        payload: null,
      });

      return res.status(201).json({
        message: "Message sent.",
        data: {
          conversation_id: conversationId,
          message: {
            direction: "outbound",
            sender_type: "owner",
            external_message_id: sendResult.messageId,
            body_text: messageText,
            delivery_status: "sent",
          },
        },
      });
    }

    insertOutboundChannelMessage({
      conversationId,
      storeId,
      mid: null,
      text: messageText,
      senderType: "owner",
      deliveryStatus: "failed",
      payload: { send_error: sendResult.error },
    });

    return res.status(502).json({
      message: "Could not send message to Instagram.",
      code: "INSTAGRAM_SEND_FAILED",
      error: sendResult.error,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not send owner message.",
      error: error.message,
    });
  }
}

module.exports = {
  listChannelConversations,
  getChannelConversationDetail,
  getInstagramChannelConnection,
  setChannelConversationTakeover,
  postChannelOwnerMessage,
};
