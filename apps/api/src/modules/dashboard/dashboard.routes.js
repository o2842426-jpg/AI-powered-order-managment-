const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const { createSalesExample } = require("./salesExamples.controller");

const dashboardRouter = express.Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(requireActiveSubscription);

dashboardRouter.post("/settings/examples", createSalesExample);

module.exports = { dashboardRouter };
