const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const { requireClothingStore } = require("./clothing.middleware");
const {
  getAvailability,
  postResolveVariant,
  patchSizeChart,
} = require("./clothing.controller");

const clothingRouter = express.Router({ mergeParams: true });

clothingRouter.use(requireAuth);
clothingRouter.use(requireActiveSubscription);
clothingRouter.use(requireClothingStore);

clothingRouter.get("/products/:productId/availability", getAvailability);
clothingRouter.post("/resolve-variant", postResolveVariant);
clothingRouter.patch("/products/:productId/size-chart", patchSizeChart);

module.exports = { clothingRouter };
