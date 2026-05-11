const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const {
  getBillingStatus,
  createCheckoutSession,
  createPortalSession,
} = require("./billing.controller");

const billingRouter = express.Router();

billingRouter.get("/status", requireAuth, getBillingStatus);
billingRouter.post("/checkout-session", requireAuth, createCheckoutSession);
billingRouter.post("/portal-session", requireAuth, createPortalSession);

module.exports = { billingRouter };
