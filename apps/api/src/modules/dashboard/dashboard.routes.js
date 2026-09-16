const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const {
  listSalesExamples,
  createSalesExample,
  removeSalesExample,
} = require("./salesExamples.controller");

const dashboardRouter = express.Router();

dashboardRouter.use(requireAuth);
dashboardRouter.use(requireActiveSubscription);

dashboardRouter.get("/settings/examples", listSalesExamples);
dashboardRouter.post("/settings/examples", createSalesExample);
dashboardRouter.delete("/settings/examples/:exampleId", removeSalesExample);

module.exports = { dashboardRouter };
