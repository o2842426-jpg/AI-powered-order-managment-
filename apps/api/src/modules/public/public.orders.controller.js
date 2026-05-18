const { db } = require("../../db/client");
const { normalizePublicStoreSlug } = require("./publicSlug");

function createPublicOrder(req, res) {
  try {
    const storeSlug = normalizePublicStoreSlug(req.params.storeSlug);
    const { customer, items, customer_note } = req.body;

    if (!storeSlug) {
      return res.status(400).json({
        message: "storeSlug is required.",
      });
    }

    const store = db.prepare("SELECT id, name, slug FROM stores WHERE slug = ?").get(storeSlug);
    if (!store) {
      return res.status(404).json({
        message: "Store not found.",
      });
    }

    if (!customer || !customer.name || !customer.phone) {
      return res.status(400).json({
        message: "customer.name and customer.phone are required.",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "items must be a non-empty array.",
      });
    }

    const runCreateOrder = db.transaction((payload) => {
      const customerResult = db
        .prepare(
          `
        INSERT INTO customers (store_id, name, phone, address_text, notes)
        VALUES (?, ?, ?, ?, ?)
      `
        )
        .run(
          store.id,
          String(payload.customer.name).trim(),
          String(payload.customer.phone).trim(),
          payload.customer.address_text ?? null,
          payload.customer.notes ?? null
        );

      const customerId = customerResult.lastInsertRowid;

      const orderResult = db
        .prepare(
          `
        INSERT INTO orders (store_id, customer_id, status, total_amount, delivery_address, customer_note)
        VALUES (?, ?, 'new', 0, ?, ?)
      `
        )
        .run(
          store.id,
          customerId,
          payload.customer.address_text ?? null,
          customer_note ?? null
        );

      const orderId = orderResult.lastInsertRowid;
      let totalAmount = 0;
      let itemsCount = 0;

      for (const item of payload.items) {
        const productId = Number(item.product_id);
        const qty = Number(item.qty);
        const variantId =
          item.variant_id === undefined || item.variant_id === null ? null : Number(item.variant_id);

        if (Number.isNaN(productId) || productId <= 0) {
          throw new Error("Invalid product_id in items.");
        }
        if (!Number.isInteger(qty) || qty <= 0) {
          throw new Error("qty must be an integer greater than 0.");
        }

        const product = db
          .prepare(
            `
          SELECT id, base_price
          FROM products
          WHERE id = ? AND store_id = ? AND is_active = 1
        `
          )
          .get(productId, store.id);

        if (!product) {
          throw new Error(`Product ${productId} not found in this store.`);
        }

        let unitPrice = Number(product.base_price);
        let resolvedVariantId = null;

        if (variantId !== null) {
          if (Number.isNaN(variantId) || variantId <= 0) {
            throw new Error("Invalid variant_id in items.");
          }

          const variant = db
            .prepare(
              `
            SELECT id, product_id, price, stock_qty
            FROM product_variants
            WHERE id = ? AND product_id = ? AND is_active = 1
          `
            )
            .get(variantId, productId);

          if (!variant) {
            throw new Error(`Variant ${variantId} is invalid for product ${productId}.`);
          }

          if (variant.stock_qty < qty) {
            throw new Error(`Insufficient stock for variant ${variantId}.`);
          }

          unitPrice =
            variant.price !== null && variant.price !== undefined ? Number(variant.price) : unitPrice;
          resolvedVariantId = variant.id;

          db.prepare(
            `
            UPDATE product_variants
            SET stock_qty = stock_qty - ?
            WHERE id = ?
          `
          ).run(qty, variant.id);
        }

        if (Number.isNaN(unitPrice) || unitPrice < 0) {
          throw new Error("Invalid item price.");
        }

        const lineTotal = unitPrice * qty;
        totalAmount += lineTotal;
        itemsCount += 1;

        db.prepare(
          `
          INSERT INTO order_items (order_id, product_id, variant_id, qty, unit_price, line_total)
          VALUES (?, ?, ?, ?, ?, ?)
        `
        ).run(orderId, productId, resolvedVariantId, qty, unitPrice, lineTotal);
      }

      db.prepare("UPDATE orders SET total_amount = ? WHERE id = ?").run(totalAmount, orderId);

      return {
        order_id: orderId,
        customer_id: customerId,
        status: "new",
        total_amount: totalAmount,
        items_count: itemsCount,
      };
    });

    const createdOrder = runCreateOrder({ customer, items });

    return res.status(201).json({
      message: "Order created successfully.",
      data: createdOrder,
    });
  } catch (error) {
    return res.status(400).json({
      message: "Could not create order.",
      error: error.message,
    });
  }
}

module.exports = {
  createPublicOrder,
};
