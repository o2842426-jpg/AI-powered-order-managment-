const { assertStoreScope } = require("../stores/storeScope");
const {
  getChannelConversationForStore,
  updateChannelConversationTakeover,
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

module.exports = {
  setChannelConversationTakeover,
};
