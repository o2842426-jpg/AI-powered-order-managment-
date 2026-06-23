const { db } = require("../../db/client");
const { computeStoreAnalytics } = require("../analytics/storeAnalytics.service");
const { assertStoreScope } = require("./storeScope");
const { storeHasFeature } = require("../plans/planEntitlements");

const STORE_CURRENCY_CODES = new Set(["SAR", "IQD", "USD"]);

function normalizeStoreCurrencyCodeInput(raw) {
  const c = String(raw ?? "SAR")
    .trim()
    .toUpperCase();
  return STORE_CURRENCY_CODES.has(c) ? c : "SAR";
}

function getStoreSettings(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const store = db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            phone,
            delivery_info,
            ai_prompt,
            logo_url,
            theme_color,
            accent_color,
            policy_text,
            currency_code,
            created_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    if (!store) {
      return res.status(404).json({ message: "Store not found." });
    }

    return res.status(200).json({ data: store });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load store settings.",
      error: error.message,
    });
  }
}

function updateStoreSettings(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const {
      name,
      phone,
      delivery_info,
      ai_prompt,
      logo_url,
      theme_color,
      accent_color,
      policy_text,
      currency_code,
    } = req.body;

    const existingStore = db
      .prepare("SELECT id, currency_code FROM stores WHERE id = ?")
      .get(storeId);

    if (!existingStore) {
      return res.status(404).json({ message: "Store not found." });
    }

    const mergedCurrency =
      currency_code !== undefined && currency_code !== null
        ? normalizeStoreCurrencyCodeInput(currency_code)
        : normalizeStoreCurrencyCodeInput(existingStore.currency_code);

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required." });
    }

    db.prepare(
      `
        UPDATE stores
        SET
          name = ?,
          phone = ?,
          delivery_info = ?,
          ai_prompt = ?,
          logo_url = ?,
          theme_color = ?,
          accent_color = ?,
          policy_text = ?,
          currency_code = ?
        WHERE id = ?
      `
    ).run(
      String(name).trim(),
      phone ? String(phone).trim() : null,
      delivery_info ? String(delivery_info).trim() : null,
      ai_prompt ? String(ai_prompt).trim() : null,
      logo_url ? String(logo_url).trim() : null,
      theme_color ? String(theme_color).trim() : null,
      accent_color ? String(accent_color).trim() : null,
      policy_text ? String(policy_text).trim() : null,
      mergedCurrency,
      storeId
    );

    const updatedStore = db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            phone,
            delivery_info,
            ai_prompt,
            logo_url,
            theme_color,
            accent_color,
            policy_text,
            currency_code,
            created_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    return res.status(200).json({ data: updatedStore });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update store settings.",
      error: error.message,
    });
  }
}

function getStoreSummary(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const productStats = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_products,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_products
          FROM products
          WHERE store_id = ?
        `
      )
      .get(storeId);

    const newOrders = db
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE store_id = ? AND status = 'new'")
      .get(storeId);

    const lowStock = db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE p.store_id = ? AND pv.stock_qty > 0 AND pv.stock_qty <= 3
        `
      )
      .get(storeId);

    const latestOrder = db
      .prepare(
        `
          SELECT
            o.id,
            o.status,
            o.total_amount,
            o.created_at,
            c.name AS customer_name
          FROM orders o
          LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.store_id = ?
          ORDER BY o.id DESC
          LIMIT 1
        `
      )
      .get(storeId);

    const analytics = computeStoreAnalytics(db, storeId, {
      advanced: storeHasFeature(storeId, "advanced_analytics"),
    });

    return res.status(200).json({
      data: {
        total_products: productStats.total_products || 0,
        active_products: productStats.active_products || 0,
        new_orders: newOrders.count || 0,
        low_stock_variants: lowStock.count || 0,
        latest_order: latestOrder || null,
        analytics,
        analytics_advanced_available: analytics.level === "advanced",
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load store summary.",
      error: error.message,
    });
  }
}

function getStoreLowStock(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const threshold = Math.max(0, Number(req.query.threshold ?? 3));
    if (!assertStoreScope(req, res, storeId)) return;

    const rows = db
      .prepare(
        `
          SELECT
            pv.id,
            pv.product_id,
            pv.size,
            pv.color,
            pv.price,
            pv.stock_qty,
            pv.sku,
            pv.is_active,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.base_price AS product_base_price
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE p.store_id = ?
            AND p.is_active = 1
            AND pv.is_active = 1
            AND pv.stock_qty <= ?
          ORDER BY pv.stock_qty ASC, p.id DESC, pv.id DESC
        `
      )
      .all(storeId, threshold);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load low stock variants.",
      error: error.message,
    });
  }
}

module.exports = {
  getStoreLowStock,
  getStoreSettings,
  getStoreSummary,
  updateStoreSettings,
};
