const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const {
  getBillingStatus,
  getEntitlements,
  createCheckoutSession,
  createPortalSession,
} = require("./billing.controller");

const billingRouter = express.Router();

billingRouter.get("/status", requireAuth, getBillingStatus);
billingRouter.get("/entitlements", requireAuth, getEntitlements);
billingRouter.post("/checkout-session", requireAuth, createCheckoutSession);
billingRouter.post("/portal-session", requireAuth, createPortalSession);

module.exports = { billingRouter };
