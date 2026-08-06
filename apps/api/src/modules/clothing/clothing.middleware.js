const { db } = require("../../db/client");
const { assertStoreScope } = require("../stores/storeScope");
const { shouldEnforcePlansForStore } = require("../billing/billing.demoOverride");
const { getStorePlanContext } = require("../plans/planEntitlements");
const { tierMeetsFeature } = require("../plans/planMatrix");
const { isClothingStore } = require("./clothing.service");

/**
 * Store must be configured as clothing vertical + Growth+ clothing_sales_engine (when billing enforced).
 */
function requireClothingStore(req, res, next) {
  const storeId = Number(req.params.storeId);
  if (!assertStoreScope(req, res, storeId)) return;

  if (!isClothingStore(storeId)) {
    return res.status(403).json({
      code: "NOT_CLOTHING_STORE",
      message: "This endpoint is only available for clothing/apparel stores.",
    });
  }

  if (shouldEnforcePlansForStore(storeId)) {
    const { tier } = getStorePlanContext(storeId);
    if (!tierMeetsFeature(tier, "clothing_sales_engine")) {
      return res.status(403).json({
        code: "PLAN_REQUIRED",
        feature: "clothing_sales_engine",
        message:
          "Clothing engine requires Growth or Pro. Upgrade your plan in Settings.",
      });
    }
  }

  req.clothingStoreId = storeId;
  next();
}

module.exports = { requireClothingStore };
