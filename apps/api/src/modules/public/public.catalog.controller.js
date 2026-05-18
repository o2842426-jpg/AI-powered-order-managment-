const { db } = require("../../db/client");
const { normalizePublicStoreSlug } = require("./publicSlug");

function listPublicProducts(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    const store = db
      .prepare(
        `
      SELECT
        id,
        name,
        slug,
        phone,
        delivery_info,
        logo_url,
        theme_color,
        accent_color,
        policy_text,
        currency_code
      FROM stores
      WHERE slug = ?
    `
      )
      .get(storeSlug);

    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    const products = db
      .prepare(
        `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE store_id = ? AND is_active = 1
      ORDER BY id DESC
    `
      )
      .all(store.id);

    const productsWithVariants = products.map((product) => {
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

      return {
        ...product,
        variants,
      };
    });

    return res.status(200).json({
      store,
      products: productsWithVariants,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load public products.",
      error: error.message,
    });
  }
}

function getSpecificProduct(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { productId } = req.params;
    const productIdNumber = Number(productId);

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    if (Number.isNaN(productIdNumber) || productIdNumber <= 0) {
      return res.status(400).json({
        message: "productId must be a valid positive number.",
      });
    }

    const store = db
      .prepare(
        `
      SELECT
        id,
        name,
        slug,
        phone,
        delivery_info,
        logo_url,
        theme_color,
        accent_color,
        policy_text,
        currency_code
      FROM stores
      WHERE slug = ?
    `
      )
      .get(storeSlug);

    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    const product = db
      .prepare(
        `
      SELECT id, name, description, image_url, base_price
      FROM products
      WHERE id = ? AND store_id = ? AND is_active = 1
    `
      )
      .get(productIdNumber, store.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    const variants = db
      .prepare(
        `
      SELECT id, product_id, size, color, price, stock_qty, sku
      FROM product_variants
      WHERE product_id = ? AND is_active = 1
      ORDER BY id DESC
    `
      )
      .all(productIdNumber);

    return res.status(200).json({
      store,
      product: {
        ...product,
        variants,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not get specific product.",
      error: error.message,
    });
  }
}

module.exports = {
  listPublicProducts,
  getSpecificProduct,
};
