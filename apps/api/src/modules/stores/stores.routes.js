const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const { requirePlanFeature } = require("../plans/planGating.middleware");
const {
  getStoreLowStock,
  getStoreSettings,
  getStoreSummary,
  updateStoreSettings,
} = require("./stores.controller");
const {
  listChatSessions,
  getChatSessionDetail,
  setChatSessionTakeover,
  postOwnerChatMessage,
} = require("./conversations.controller");

const {
  listStoreMemoryFacts,
  createStoreMemoryFact,
  deleteStoreMemoryFact,
} = require("./memoryFacts.controller");
const {
  listFollowupTasks,
  patchFollowupTask,
} = require("./followupTasks.controller");
const {
  listStoreAiFollowups,
  createStoreAiFollowup,
  deleteStoreAiFollowup,
} = require("./aiFollowups.controller");
const {
  setChannelConversationTakeover,
  postChannelOwnerMessage,
} = require("../channels/channel.conversations.controller");

const storesRouter = express.Router();

storesRouter.use(requireAuth);
storesRouter.use(requireActiveSubscription);

storesRouter.get(
  "/:storeId/chat-sessions",
  requirePlanFeature("conversations_dashboard"),
  listChatSessions
);
storesRouter.get(
  "/:storeId/chat-sessions/:sessionId",
  requirePlanFeature("conversations_dashboard"),
  getChatSessionDetail
);
storesRouter.patch(
  "/:storeId/chat-sessions/:sessionId/takeover",
  requirePlanFeature("human_takeover"),
  setChatSessionTakeover
);
storesRouter.post(
  "/:storeId/chat-sessions/:sessionId/owner-messages",
  requirePlanFeature("human_takeover"),
  postOwnerChatMessage
);

storesRouter.patch(
  "/:storeId/channel-conversations/:conversationId/takeover",
  requirePlanFeature("human_takeover"),
  setChannelConversationTakeover
);
storesRouter.post(
  "/:storeId/channel-conversations/:conversationId/messages",
  requirePlanFeature("human_takeover"),
  postChannelOwnerMessage
);

storesRouter.get(
  "/:storeId/memory-facts",
  requirePlanFeature("customer_memory"),
  listStoreMemoryFacts
);
storesRouter.post(
  "/:storeId/memory-facts",
  requirePlanFeature("customer_memory"),
  createStoreMemoryFact
);
storesRouter.delete(
  "/:storeId/memory-facts/:factId",
  requirePlanFeature("customer_memory"),
  deleteStoreMemoryFact
);

storesRouter.get(
  "/:storeId/ai-followups",
  requirePlanFeature("ai_followups"),
  listStoreAiFollowups
);
storesRouter.post(
  "/:storeId/ai-followups",
  requirePlanFeature("ai_followups"),
  createStoreAiFollowup
);
storesRouter.delete(
  "/:storeId/ai-followups/:followupId",
  requirePlanFeature("ai_followups"),
  deleteStoreAiFollowup
);

storesRouter.get(
  "/:storeId/followup-tasks",
  requirePlanFeature("conversations_dashboard"),
  requirePlanFeature("followup_tasks"),
  listFollowupTasks
);
storesRouter.patch(
  "/:storeId/followup-tasks/:taskId",
  requirePlanFeature("conversations_dashboard"),
  requirePlanFeature("followup_tasks"),
  patchFollowupTask
);

storesRouter.get("/:storeId/summary", getStoreSummary);
storesRouter.get("/:storeId/low-stock", getStoreLowStock);
storesRouter.get("/:storeId/settings", getStoreSettings);
storesRouter.patch("/:storeId/settings", updateStoreSettings);

module.exports = { storesRouter };
