const { db } = require("../../db/client");
const {
  MAX_PRODUCT_IMAGES,
  loadProductImagesMap,
  countProductImages,
} = require("../../lib/productImages");

function attachImagesToProducts(products) {
  const imageMap = loadProductImagesMap(
    db,
    products.map((p) => p.id)
  );
  return products.map((product) => ({
    ...product,
    images: imageMap.get(product.id) || [],
  }));
}

function listProducts(req, res) {
  try {
    const query = db.prepare(`
      SELECT
        id,
        store_id,
        name,
        description,
        image_url,
        base_price,
        is_active,
        created_at
      FROM products
      WHERE store_id = ?
      ORDER BY id DESC
    `);

    const products = attachImagesToProducts(query.all(req.user.store_id));
    return res.status(200).json({ data: products });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load products. Make sure DB schema is initialized.",
      error: error.message,
    });
  }
}

function createProduct(req, res) {
  try {
    const { store_id, name, description, image_url, base_price } = req.body;

    if (!store_id || !name || base_price === undefined) {
      return res.status(400).json({
        message: "store_id, name, and base_price are required.",
      });
    }

    const numericPrice = Number(base_price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        message: "base_price must be a number greater than or equal to 0.",
      });
    }

    const storeId = Number(store_id);
    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: "store_id must be a valid positive number.",
      });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const existingStore = db
      .prepare("SELECT id FROM stores WHERE id = ?")
      .get(storeId);
    if (!existingStore) {
      return res.status(400).json({
        message: "Invalid store_id. Store does not exist.",
      });
    }

    const insert = db.prepare(`
      INSERT INTO products (store_id, name, description, image_url, base_price)
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      storeId,
      String(name).trim(),
      description ?? null,
      image_url ? String(image_url).trim() : null,
      numericPrice
    );

    const selectOne = db.prepare(`
      SELECT id, store_id, name, description, image_url, base_price, is_active, created_at
      FROM products
      WHERE id = ?
    `);

    const createdProduct = selectOne.get(result.lastInsertRowid);
    return res.status(201).json({ data: createdProduct });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create product.",
      error: error.message,
    });
  }
}

function updateProduct(req, res) {
  try {
    const productId = Number(req.params.id);
    const { name, description, image_url, base_price, is_active } = req.body;

    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    const existingProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND store_id = ?")
      .get(productId, req.user.store_id);

    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required." });
    }

    const numericPrice = Number(base_price);
    if (Number.isNaN(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        message: "base_price must be a number greater than or equal to 0.",
      });
    }

    const activeValue = is_active ? 1 : 0;

    db.prepare(
      `
        UPDATE products
        SET name = ?, description = ?, image_url = ?, base_price = ?, is_active = ?
        WHERE id = ?
      `
    ).run(
      String(name).trim(),
      description ? String(description).trim() : null,
      image_url ? String(image_url).trim() : null,
      numericPrice,
      activeValue,
      productId
    );

    const updatedProduct = db
      .prepare(
        `
          SELECT id, store_id, name, description, image_url, base_price, is_active, created_at
          FROM products
          WHERE id = ?
        `
      )
      .get(productId);

    return res.status(200).json({ data: updatedProduct });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update product.",
      error: error.message,
    });
  }
}

function listVariants(req, res) {
  try {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    const existingProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND store_id = ?")
      .get(productId, req.user.store_id);
    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    const variants = db
      .prepare(
        `
      SELECT id, product_id, size, color, price, stock_qty, sku, is_active
      FROM product_variants
      WHERE product_id = ?
      ORDER BY id DESC
    `
      )
      .all(productId);

    return res.status(200).json({ data: variants });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load product variants.",
      error: error.message,
    });
  }
}

function createVariant(req, res) {
  try {
    const productId = Number(req.params.id);
    const { size, color, price, stock_qty, sku } = req.body;

    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    const existingProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND store_id = ?")
      .get(productId, req.user.store_id);
    if (!existingProduct) {
      return res.status(404).json({
        message: "Product not found.",
      });
    }

    if (stock_qty === undefined) {
      return res.status(400).json({
        message: "stock_qty is required.",
      });
    }

    const numericStock = Number(stock_qty);
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({
        message: "stock_qty must be an integer greater than or equal to 0.",
      });
    }

    let numericPrice = null;
    if (price !== undefined && price !== null && price !== "") {
      numericPrice = Number(price);
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          message: "price must be a number greater than or equal to 0.",
        });
      }
    }

    const insert = db.prepare(`
      INSERT INTO product_variants (product_id, size, color, price, stock_qty, sku)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      productId,
      size ?? null,
      color ?? null,
      numericPrice,
      numericStock,
      sku ?? null
    );

    const createdVariant = db
      .prepare(
        `
      SELECT id, product_id, size, color, price, stock_qty, sku, is_active
      FROM product_variants
      WHERE id = ?
    `
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: createdVariant });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create product variant.",
      error: error.message,
    });
  }
}

function updateVariant(req, res) {
  try {
    const productId = Number(req.params.id);
    const variantId = Number(req.params.variantId);
    const { size, color, price, stock_qty, sku, is_active } = req.body;

    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    if (Number.isNaN(variantId) || variantId <= 0) {
      return res.status(400).json({
        message: "Variant id must be a valid positive number.",
      });
    }

    const existingVariant = db
      .prepare(
        `
          SELECT pv.id
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE pv.id = ? AND pv.product_id = ? AND p.store_id = ?
        `
      )
      .get(variantId, productId, req.user.store_id);

    if (!existingVariant) {
      return res.status(404).json({ message: "Product variant not found." });
    }

    if (stock_qty === undefined) {
      return res.status(400).json({ message: "stock_qty is required." });
    }

    const numericStock = Number(stock_qty);
    if (!Number.isInteger(numericStock) || numericStock < 0) {
      return res.status(400).json({
        message: "stock_qty must be an integer greater than or equal to 0.",
      });
    }

    let numericPrice = null;
    if (price !== undefined && price !== null && price !== "") {
      numericPrice = Number(price);
      if (Number.isNaN(numericPrice) || numericPrice < 0) {
        return res.status(400).json({
          message: "price must be a number greater than or equal to 0.",
        });
      }
    }

    db.prepare(
      `
        UPDATE product_variants
        SET size = ?, color = ?, price = ?, stock_qty = ?, sku = ?, is_active = ?
        WHERE id = ? AND product_id = ?
      `
    ).run(
      size ? String(size).trim() : null,
      color ? String(color).trim() : null,
      numericPrice,
      numericStock,
      sku ? String(sku).trim() : null,
      is_active === undefined ? 1 : is_active ? 1 : 0,
      variantId,
      productId
    );

    const updatedVariant = db
      .prepare(
        `
          SELECT id, product_id, size, color, price, stock_qty, sku, is_active
          FROM product_variants
          WHERE id = ?
        `
      )
      .get(variantId);

    return res.status(200).json({ data: updatedVariant });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update product variant.",
      error: error.message,
    });
  }
}

function listProductImages(req, res) {
  try {
    const productId = Number(req.params.id);
    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    const existingProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND store_id = ?")
      .get(productId, req.user.store_id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    const images = db
      .prepare(
        `
          SELECT id, product_id, image_url, sort_order, created_at
          FROM product_images
          WHERE product_id = ?
          ORDER BY sort_order ASC, id ASC
        `
      )
      .all(productId);

    return res.status(200).json({ data: images });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load product images.",
      error: error.message,
    });
  }
}

function addProductImage(req, res) {
  try {
    const productId = Number(req.params.id);
    const { image_url } = req.body;

    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }

    const normalizedUrl = String(image_url || "").trim();
    if (!normalizedUrl) {
      return res.status(400).json({ message: "image_url is required." });
    }

    const existingProduct = db
      .prepare("SELECT id FROM products WHERE id = ? AND store_id = ?")
      .get(productId, req.user.store_id);
    if (!existingProduct) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (countProductImages(db, productId) >= MAX_PRODUCT_IMAGES) {
      return res.status(400).json({
        message: `Each product can have at most ${MAX_PRODUCT_IMAGES} images.`,
      });
    }

    const nextSort = db
      .prepare(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort FROM product_images WHERE product_id = ?"
      )
      .get(productId);

    const result = db
      .prepare(
        `
          INSERT INTO product_images (product_id, image_url, sort_order)
          VALUES (?, ?, ?)
        `
      )
      .run(productId, normalizedUrl, Number(nextSort?.next_sort || 0));

    const created = db
      .prepare(
        `
          SELECT id, product_id, image_url, sort_order, created_at
          FROM product_images
          WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: created });
  } catch (error) {
    return res.status(500).json({
      message: "Could not add product image.",
      error: error.message,
    });
  }
}

function deleteProductImage(req, res) {
  try {
    const productId = Number(req.params.id);
    const imageId = Number(req.params.imageId);

    if (Number.isNaN(productId) || productId <= 0) {
      return res.status(400).json({
        message: "Product id must be a valid positive number.",
      });
    }
    if (Number.isNaN(imageId) || imageId <= 0) {
      return res.status(400).json({
        message: "Image id must be a valid positive number.",
      });
    }

    const existingImage = db
      .prepare(
        `
          SELECT pi.id
          FROM product_images pi
          JOIN products p ON p.id = pi.product_id
          WHERE pi.id = ? AND pi.product_id = ? AND p.store_id = ?
        `
      )
      .get(imageId, productId, req.user.store_id);

    if (!existingImage) {
      return res.status(404).json({ message: "Product image not found." });
    }

    db.prepare("DELETE FROM product_images WHERE id = ? AND product_id = ?").run(
      imageId,
      productId
    );

    return res.status(200).json({ data: { deleted: true } });
  } catch (error) {
    return res.status(500).json({
      message: "Could not delete product image.",
      error: error.message,
    });
  }
}

module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  listVariants,
  createVariant,
  updateVariant,
  listProductImages,
  addProductImage,
  deleteProductImage,
};
