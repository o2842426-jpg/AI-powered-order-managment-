const { db } = require("../../db/client");
const { normalizeStoreVertical } = require("../stores/storeOnboarding.constants");

const SIZING_ISSUE =
  /(?:ما\s*فهمت|مو\s*فاهم|م(?:اب|وب)\s*فهم|ت(?:عب|ضوج|لخبط)|(?:مش|مو)\s*(?:واضح|عارف|عارفين)|confused|doesn'?t\s*fit|wrong\s*size|مقاس\s*غلط|مقاس\s*خطأ|ما\s*يناسبني|help\s*with\s*size)/i;

/**
 * @param {number} storeId
 */
function isClothingStore(storeId) {
  const row = db
    .prepare(`SELECT store_vertical FROM stores WHERE id = ?`)
    .get(Number(storeId));
  return normalizeStoreVertical(row?.store_vertical) === "clothing";
}

/**
 * Customer frustrated with sizing / fit guidance.
 * @param {string} text
 */
function customerEncountersApparelIssue(text) {
  return SIZING_ISSUE.test(String(text || "").trim());
}

/**
 * @param {number} productId
 */
function productHasActiveVariants(productId) {
  const row = db
    .prepare(
      `
        SELECT COUNT(*) AS c
        FROM product_variants
        WHERE product_id = ? AND is_active = 1 AND stock_qty > 0
      `
    )
    .get(Number(productId));
  return Number(row?.c || 0) > 0;
}

/**
 * @param {number} productId
 */
function listVariantOptions(productId) {
  return db
    .prepare(
      `
        SELECT id, size, color, price, stock_qty, sku
        FROM product_variants
        WHERE product_id = ? AND is_active = 1
        ORDER BY id ASC
      `
    )
    .all(Number(productId));
}

/**
 * @param {number} productId
 * @param {{ size?: string | null, color?: string | null }} opts
 */
function resolveVariantForProduct(productId, opts = {}) {
  const pid = Number(productId);
  const sizeNeedle = String(opts.size || "").trim().toLowerCase();
  const colorNeedle = String(opts.color || "").trim().toLowerCase();
  const variants = listVariantOptions(pid).filter((v) => Number(v.stock_qty) > 0);

  if (!variants.length) return null;

  const score = (v) => {
    let s = 0;
    const vs = String(v.size || "").trim().toLowerCase();
    const vc = String(v.color || "").trim().toLowerCase();
    if (sizeNeedle && vs && (vs === sizeNeedle || vs.includes(sizeNeedle) || sizeNeedle.includes(vs))) {
      s += 3;
    }
    if (colorNeedle && vc && (vc === colorNeedle || vc.includes(colorNeedle) || colorNeedle.includes(vc))) {
      s += 3;
    }
    return s;
  };

  let best = null;
  let bestScore = 0;
  for (const v of variants) {
    const sc = score(v);
    if (sc > bestScore) {
      bestScore = sc;
      best = v;
    }
  }

  if (best && bestScore >= 3) return best;
  if (!sizeNeedle && !colorNeedle) return null;
  if (variants.length === 1 && (sizeNeedle || colorNeedle)) return variants[0];
  return null;
}

/**
 * Extract size/color from customer message using catalog variants.
 * @param {string} text
 * @param {number} productId
 */
function extractSizeColorFromText(text, productId) {
  const t = String(text || "").trim();
  const patch = {};
  if (!t || !productId) return patch;

  const variants = listVariantOptions(productId);
  const sizes = [...new Set(variants.map((v) => String(v.size || "").trim()).filter(Boolean))];
  const colors = [...new Set(variants.map((v) => String(v.color || "").trim()).filter(Boolean))];

  for (const size of sizes) {
    if (new RegExp(`(?:^|[\\s،,])${escapeRegExp(size)}(?:[\\s،,.]|$)`, "i").test(t)) {
      patch.selected_size = size;
      break;
    }
  }

  if (!patch.selected_size) {
    const sizeMatch = t.match(/(?:مقاس|size)\s*[:\-]?\s*([^\s،,.]{1,12})/i);
    if (sizeMatch) patch.selected_size = sizeMatch[1].trim();
  }

  for (const color of colors) {
    if (t.toLowerCase().includes(color.toLowerCase())) {
      patch.selected_color = color;
      break;
    }
  }

  if (!patch.selected_color) {
    const colorMatch = t.match(/(?:لون|color)\s*[:\-]?\s*([^\s،,.]{2,24})/i);
    if (colorMatch) patch.selected_color = colorMatch[1].trim();
  }

  const resolved = resolveVariantForProduct(productId, patch);
  if (resolved) {
    patch.order_variant_id = Number(resolved.id);
  }
  return patch;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {number} variantId
 * @param {number} qty
 */
function reduceVariantStock(variantId, qty) {
  const q = Math.max(1, Number(qty) || 1);
  db.prepare(
    `UPDATE product_variants SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?`
  ).run(q, Number(variantId));
}

/**
 * Availability summary for owner/API.
 * @param {number} storeId
 * @param {number} productId
 */
function getProductAvailability(storeId, productId) {
  const product = db
    .prepare(
      `
        SELECT id, name, size_chart_url, base_price
        FROM products
        WHERE id = ? AND store_id = ? AND is_active = 1
      `
    )
    .get(Number(productId), Number(storeId));
  if (!product) return null;

  const variants = listVariantOptions(product.id);
  const inStock = variants.filter((v) => Number(v.stock_qty) > 0);
  const sizes = [...new Set(inStock.map((v) => v.size).filter(Boolean))];
  const colors = [...new Set(inStock.map((v) => v.color).filter(Boolean))];

  return {
    product_id: product.id,
    name: product.name,
    size_chart_url: product.size_chart_url || null,
    base_price: product.base_price,
    sizes,
    colors,
    variants: inStock,
  };
}

/**
 * Close/finalize an apparel order line with variant + stock (used by DM engine + owner API).
 * @param {{
 *   storeId: number,
 *   productId: number,
 *   variantId?: number | null,
 *   size?: string | null,
 *   color?: string | null,
 *   qty?: number,
 * }} input
 */
function resolveOrderLineVariant(input) {
  const productId = Number(input.productId);
  const qty = Math.max(1, Number(input.qty) || 1);

  let variant = null;
  if (input.variantId) {
    variant = db
      .prepare(
        `
          SELECT id, product_id, size, color, price, stock_qty
          FROM product_variants
          WHERE id = ? AND product_id = ? AND is_active = 1
        `
      )
      .get(Number(input.variantId), productId);
  }
  if (!variant) {
    variant = resolveVariantForProduct(productId, {
      size: input.size,
      color: input.color,
    });
  }
  if (!variant) {
    return { ok: false, reason: "variant_not_found" };
  }
  if (Number(variant.stock_qty) < qty) {
    return { ok: false, reason: "insufficient_stock", variant_id: variant.id, stock: variant.stock_qty };
  }

  const product = db
    .prepare(`SELECT base_price FROM products WHERE id = ?`)
    .get(productId);
  const unitPrice =
    variant.price != null && variant.price !== ""
      ? Number(variant.price)
      : Number(product?.base_price || 0);

  return {
    ok: true,
    variant_id: Number(variant.id),
    size: variant.size || input.size || null,
    color: variant.color || input.color || null,
    unit_price: unitPrice,
    qty,
    line_total: unitPrice * qty,
  };
}

module.exports = {
  isClothingStore,
  customerEncountersApparelIssue,
  productHasActiveVariants,
  listVariantOptions,
  resolveVariantForProduct,
  extractSizeColorFromText,
  reduceVariantStock,
  getProductAvailability,
  resolveOrderLineVariant,
};
