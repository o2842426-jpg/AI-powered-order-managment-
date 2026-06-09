const { assertStoreScope } = require("../stores/storeScope");
const { sendInstagramTextWithEncryptedToken } = require("../instagram/instagram.send.service");
const {
  getChannelConversationForStore,
  updateChannelConversationTakeover,
  getActiveConnectionById,
  insertOutboundChannelMessage,
} = require("./channel.repository");

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
  setChannelConversationTakeover,
  postChannelOwnerMessage,
};
