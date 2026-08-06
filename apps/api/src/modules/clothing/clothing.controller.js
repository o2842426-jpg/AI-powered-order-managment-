const { assertStoreScope } = require("../stores/storeScope");
const {
  getProductAvailability,
  resolveOrderLineVariant,
} = require("./clothing.service");
const { db } = require("../../db/client");

/**
 * GET /api/stores/:storeId/clothing/products/:productId/availability
 */
function getAvailability(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const productId = Number(req.params.productId);
    if (!assertStoreScope(req, res, storeId)) return;

    const data = getProductAvailability(storeId, productId);
    if (!data) {
      return res.status(404).json({ message: "Product not found." });
    }
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load product availability.",
      error: error.message,
    });
  }
}

/**
 * POST /api/stores/:storeId/clothing/resolve-variant
 * Body: { product_id, variant_id?, size?, color?, qty? }
 */
function postResolveVariant(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const productId = Number(req.body?.product_id);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ message: "product_id is required." });
    }

    const owned = db
      .prepare(`SELECT id FROM products WHERE id = ? AND store_id = ? AND is_active = 1`)
      .get(productId, storeId);
    if (!owned) {
      return res.status(404).json({ message: "Product not found." });
    }

    const result = resolveOrderLineVariant({
      storeId,
      productId,
      variantId: req.body?.variant_id,
      size: req.body?.size,
      color: req.body?.color,
      qty: req.body?.qty,
    });

    if (!result.ok) {
      return res.status(409).json({ message: result.reason, data: result });
    }
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(500).json({
      message: "Could not resolve variant.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/stores/:storeId/clothing/products/:productId/size-chart
 * Body: { size_chart_url }
 */
function patchSizeChart(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const productId = Number(req.params.productId);
    if (!assertStoreScope(req, res, storeId)) return;

    const url = req.body?.size_chart_url != null ? String(req.body.size_chart_url).trim() : null;

    const existing = db
      .prepare(`SELECT id FROM products WHERE id = ? AND store_id = ?`)
      .get(productId, storeId);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    db.prepare(`UPDATE products SET size_chart_url = ? WHERE id = ?`).run(url || null, productId);

    const updated = db
      .prepare(
        `SELECT id, store_id, name, size_chart_url, base_price, is_active FROM products WHERE id = ?`
      )
      .get(productId);

    return res.status(200).json({ data: updated });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update size chart.",
      error: error.message,
    });
  }
}

module.exports = {
  getAvailability,
  postResolveVariant,
  patchSizeChart,
};
