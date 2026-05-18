const { db } = require("../../db/client");
const { attachLeadPayloadToMessageRow } = require("../leads/leadScoring.service");

function loadActiveProductCatalog(storeId) {
  const products = db
    .prepare(
      `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE store_id = ? AND is_active = 1
      ORDER BY id DESC
    `
    )
    .all(storeId);

  return products.map((product) => {
    const variants = db
      .prepare(
        `
        SELECT id, product_id, size, color, price, stock_qty, sku
        FROM product_variants
        WHERE product_id = ? AND is_active = 1
        ORDER BY id DESC
      `
      )
      .all(product.id);
    return { ...product, variants };
  });
}

/**
 * Attach recommended_product_ids + recommended_products for AI rows.
 * @param {object} row — chat_messages row shape
 * @param {Array<{ id: number, variants?: unknown[] }>} catalog
 */
function enrichPublicChatMessage(row, catalog) {
  const base = attachLeadPayloadToMessageRow({ ...row });
  if (row.sender_type === "ai" && row.payload) {
    try {
      const p = JSON.parse(row.payload);
      const ids = Array.isArray(p.recommended_product_ids) ? p.recommended_product_ids : [];
      base.recommended_product_ids = ids;
      base.recommended_products = ids
        .map((id) => catalog.find((pr) => Number(pr.id) === Number(id)))
        .filter(Boolean);
    } catch {
      base.recommended_product_ids = [];
      base.recommended_products = [];
    }
  } else {
    base.recommended_product_ids = [];
    base.recommended_products = [];
  }
  return base;
}

module.exports = {
  loadActiveProductCatalog,
  enrichPublicChatMessage,
};
