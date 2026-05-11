const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const {
  getStoreLowStock,
  getStoreSettings,
  getStoreSummary,
  updateStoreSettings,
} = require("./stores.controller");

const storesRouter = express.Router();

storesRouter.use(requireAuth);
storesRouter.use(requireActiveSubscription);
storesRouter.get("/:storeId/summary", getStoreSummary);
storesRouter.get("/:storeId/low-stock", getStoreLowStock);
storesRouter.get("/:storeId/settings", getStoreSettings);
storesRouter.patch("/:storeId/settings", updateStoreSettings);

module.exports = { storesRouter };
