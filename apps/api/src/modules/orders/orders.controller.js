const { db } = require("../../db/client");
const { getOrderStatusCountsForStore } = require("./orders.statusCounts.service");
const {
  notifyCustomerOrderStatusChange,
} = require("./orderStatusNotify.service");

const ORDER_LIST_SELECT = `
  SELECT
    o.id,
    o.status,
    o.total_amount,
    o.created_at,
    o.is_hidden,
    c.name AS customer_name,
    c.phone AS customer_phone,
    s.currency_code AS store_currency_code
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  JOIN stores s ON s.id = o.store_id
`;

function listOrders(req, res) {
  try {
    const storeId = Number(req.query.store_id);

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "Invalid store_id." });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const includeHidden =
      req.query.include_hidden === "1" ||
      req.query.include_hidden === "true";
    const hiddenOnly =
      req.query.hidden_only === "1" || req.query.hidden_only === "true";

    let visibilityClause = " AND o.is_hidden = 0";
    if (hiddenOnly) {
      visibilityClause = " AND o.is_hidden = 1";
    } else if (includeHidden) {
      visibilityClause = "";
    }

    const rows = db
      .prepare(
        `
          ${ORDER_LIST_SELECT}
          WHERE o.store_id = ?${visibilityClause}
          ORDER BY o.id DESC
        `
      )
      .all(storeId);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Error listing orders",
      error: error.message,
    });
  }
}

function getOrderStatusCounts(req, res) {
  try {
    const storeId = Number(req.query.store_id);

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "Invalid store_id." });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const counts = getOrderStatusCountsForStore(storeId);
    return res.status(200).json({ data: counts });
  } catch (error) {
    return res.status(500).json({
      message: "Error loading order status counts.",
      error: error.message,
    });
  }
}

function getOrderById(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order id." });
    }
    const order = db
      .prepare(
        `
            SELECT
  o.id,
  o.store_id,
  o.customer_id,
  o.status,
  o.total_amount,
  o.delivery_address,
  o.customer_note,
  o.is_hidden,
  o.created_at,
  c.name AS customer_name,
  c.phone AS customer_phone,
  s.currency_code AS store_currency_code
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
JOIN stores s ON s.id = o.store_id
WHERE o.id = ? AND o.store_id = ?
            `
      )
      .get(orderId, req.user.store_id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const orderItemsQuery = db
      .prepare(
        `
                SELECT
                oi.id,
                oi.order_id,
                oi.product_id,
                oi.variant_id,
                oi.qty,
                oi.unit_price,
                oi.line_total,
                p.name AS product_name,
                pv.size AS variant_size,
                pv.color AS variant_color,
                pv.sku AS variant_sku
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                LEFT JOIN product_variants pv ON pv.id = oi.variant_id
                WHERE oi.order_id = ?
                ORDER BY oi.id ASC
                `
      )
      .all(orderId);
    return res.status(200).json({ data: { order, items: orderItemsQuery } });
  } catch (error) {
    return res.status(500).json({
      message: "Error getting order by id",
      error: error.message,
    });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order id." });
    }
    const { status } = req.body;
    if (
      !status ||
      !["new", "confirmed", "shipped", "delivered", "cancelled"].includes(status)
    ) {
      return res.status(400).json({ message: "Invalid status." });
    }
    const executingOrder = db
      .prepare("SELECT id, status, store_id FROM orders WHERE id = ? AND store_id = ?")
      .get(orderId, req.user.store_id);

    if (!executingOrder) {
      return res.status(404).json({ message: "Order not found." });
    }

    const previousStatus = String(executingOrder.status || "");
    if (previousStatus === status) {
      const unchanged = db
        .prepare(
          "SELECT id, status, total_amount, created_at, is_hidden FROM orders WHERE id = ?"
        )
        .get(orderId);
      return res.status(200).json({
        message: "Order status unchanged.",
        data: unchanged,
      });
    }

    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);

    const updatedOrder = db
      .prepare(
        "SELECT id, status, total_amount, created_at, is_hidden FROM orders WHERE id = ?"
      )
      .get(orderId);

    setImmediate(() => {
      notifyCustomerOrderStatusChange({
        storeId: Number(executingOrder.store_id),
        orderId,
        previousStatus,
        newStatus: status,
      }).catch((err) => {
        console.error(`[order-notify] unhandled order=${orderId}:`, err?.message || err);
      });
    });

    return res.status(200).json({
      message: "Order status updated successfully.",
      data: updatedOrder,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error updating order status",
      error: error.message,
    });
  }
}

function updateOrderVisibility(req, res) {
  try {
    const orderId = Number(req.params.id);
    if (Number.isNaN(orderId) || orderId <= 0) {
      return res.status(400).json({ message: "Invalid order id." });
    }

    const hidden = req.body?.hidden;
    if (hidden !== true && hidden !== false && hidden !== 1 && hidden !== 0) {
      return res.status(400).json({ message: "hidden must be true or false." });
    }

    const flag = hidden === true || hidden === 1 ? 1 : 0;

    const existing = db
      .prepare("SELECT id FROM orders WHERE id = ? AND store_id = ?")
      .get(orderId, req.user.store_id);

    if (!existing) {
      return res.status(404).json({ message: "Order not found." });
    }

    db.prepare("UPDATE orders SET is_hidden = ? WHERE id = ?").run(flag, orderId);

    const updated = db
      .prepare(
        `
          SELECT id, status, total_amount, created_at, is_hidden
          FROM orders
          WHERE id = ?
        `
      )
      .get(orderId);

    return res.status(200).json({
      message: flag ? "Order hidden from dashboard." : "Order restored to dashboard.",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error updating order visibility.",
      error: error.message,
    });
  }
}

module.exports = {
  listOrders,
  getOrderStatusCounts,
  getOrderById,
  updateOrderStatus,
  updateOrderVisibility,
};
