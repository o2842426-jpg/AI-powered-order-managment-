const MAX_PRODUCT_IMAGES = 5;
const MAX_DM_IMAGES_PER_MESSAGE = 10;

/**
 * @param {{ image_url?: string | null, images?: { image_url?: string }[] }} product
 * @returns {string[]}
 */
function getProductImagePaths(product) {
  const paths = [];
  const seen = new Set();

  const primary = String(product?.image_url || "").trim();
  if (primary) {
    paths.push(primary);
    seen.add(primary);
  }

  for (const row of product?.images || []) {
    const url = String(row?.image_url || "").trim();
    if (!url || seen.has(url)) continue;
    paths.push(url);
    seen.add(url);
  }

  return paths.slice(0, MAX_PRODUCT_IMAGES);
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number[]} productIds
 * @returns {Map<number, { id: number, image_url: string, sort_order: number }[]>}
 */
function loadProductImagesMap(db, productIds) {
  const map = new Map();
  const ids = productIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return map;

  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT id, product_id, image_url, sort_order
        FROM product_images
        WHERE product_id IN (${placeholders})
        ORDER BY sort_order ASC, id ASC
      `
    )
    .all(...ids);

  for (const row of rows) {
    if (!map.has(row.product_id)) {
      map.set(row.product_id, []);
    }
    map.get(row.product_id).push(row);
  }

  return map;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} productId
 * @returns {number}
 */
function countProductImages(db, productId) {
  const product = db
    .prepare("SELECT image_url FROM products WHERE id = ?")
    .get(productId);
  const extra = db
    .prepare("SELECT COUNT(*) AS c FROM product_images WHERE product_id = ?")
    .get(productId);
  return (product?.image_url ? 1 : 0) + Number(extra?.c || 0);
}

module.exports = {
  MAX_PRODUCT_IMAGES,
  MAX_DM_IMAGES_PER_MESSAGE,
  getProductImagePaths,
  loadProductImagesMap,
  countProductImages,
};
