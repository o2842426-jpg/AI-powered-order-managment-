const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");

const { listOrders, getOrderById, updateOrderStatus } = require("./orders.controller");
const ordersRouter = express.Router();
ordersRouter.use(requireAuth);
ordersRouter.use(requireActiveSubscription);
ordersRouter.get("/", listOrders);
ordersRouter.get("/:id", getOrderById);
ordersRouter.patch("/:id/status", updateOrderStatus);
module.exports = {
    ordersRouter
};