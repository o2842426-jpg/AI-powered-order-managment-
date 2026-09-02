const { db } = require("../../db/client");
const { assertStoreScope } = require("./storeScope");
const { resolveVerticalDefinition } = require("../../verticals/registry");
const { tierMeetsFeature, getStorePlanContext } = require("../plans/planEntitlements");
const { shouldEnforcePlansForStore } = require("../billing/billing.demoOverride");

/**
 * GET /api/stores/:storeId/vertical
 * Returns vertical id + UI/API feature flags for the owner dashboard.
 */
function getStoreVerticalProfile(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const store = db
      .prepare(
        `
          SELECT id, store_vertical, name
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    if (!store) {
      return res.status(404).json({ message: "Store not found." });
    }

    const definition = resolveVerticalDefinition(store.store_vertical);
    let planGates = {};

    if (definition.plan_features?.sales_engine && shouldEnforcePlansForStore(storeId)) {
      const { tier } = getStorePlanContext(storeId);
      planGates.clothing_sales_engine = tierMeetsFeature(
        tier,
        definition.plan_features.sales_engine
      );
    } else if (definition.plan_features?.sales_engine) {
      planGates.clothing_sales_engine = true;
    }

    return res.status(200).json({
      data: {
        store_id: storeId,
        store_vertical: store.store_vertical,
        vertical: definition,
        plan_gates: planGates,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load store vertical profile.",
      error: error.message,
    });
  }
}

module.exports = { getStoreVerticalProfile };
