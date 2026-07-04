const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");

const {
  listOrders,
  getOrderStatusCounts,
  getOrderById,
  updateOrderStatus,
  updateOrderVisibility,
} = require("./orders.controller");
const ordersRouter = express.Router();
ordersRouter.use(requireAuth);
ordersRouter.use(requireActiveSubscription);
ordersRouter.get("/status-counts", getOrderStatusCounts);
ordersRouter.get("/", listOrders);
ordersRouter.get("/:id", getOrderById);
ordersRouter.patch("/:id/status", updateOrderStatus);
ordersRouter.patch("/:id/visibility", updateOrderVisibility);
module.exports = {
    ordersRouter
};