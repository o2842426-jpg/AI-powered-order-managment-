const express = require("express");
const {
  listPublicProducts,
  getSpecificProduct,
} = require("./public.catalog.controller");
const { createPublicOrder } = require("./public.orders.controller");
const {
  createChatSession,
  sendChatMessage,
  getChatSessionMessages,
} = require("./public.chat.controller");
const publicRouter = express.Router();

publicRouter.get("/:storeSlug/products", listPublicProducts);
publicRouter.get("/:storeSlug/products/:productId", getSpecificProduct);
publicRouter.post("/:storeSlug/orders", createPublicOrder);
publicRouter.post("/:storeSlug/chat/sessions", createChatSession);
publicRouter.post("/:storeSlug/chat/messages", sendChatMessage);
publicRouter.get("/:storeSlug/chat/sessions/:sessionId/messages", getChatSessionMessages);
module.exports = { publicRouter };
