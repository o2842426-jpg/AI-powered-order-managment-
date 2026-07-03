const { db } = require("../../db/client");
const { getOrderStatusCountsForStore } = require("./orders.statusCounts.service");
const {
  notifyCustomerOrderStatusChange,
} = require("./orderStatusNotify.service");

function listOrders(req, res) {
    try {
        const storeId = Number(req.query.store_id);
        
        if(Number.isNaN(storeId) || storeId <= 0) {
            return res.status(400).json({ message: "Invalid store_id." });
        }
        if (req.user?.store_id !== storeId) {
            return res.status(403).json({ message: "Forbidden for this store." });
        }

        const findingOrdersQuery = db
        .prepare(`
            SELECT
  o.id,
  o.status,
  o.total_amount,
  o.created_at,
  c.name AS customer_name,
  c.phone AS customer_phone,
  s.currency_code AS store_currency_code
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
JOIN stores s ON s.id = o.store_id
WHERE o.store_id = ?
ORDER BY o.id DESC
            `).all(storeId);

            res.status(200).json({data: findingOrdersQuery});

        
        
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
        if(Number.isNaN(orderId) || orderId <= 0) {
            return res.status(400).json({message: "Invalid order id."});
        }
        const findingOrderQuery = db
        .prepare(`
            SELECT
  o.id,
  o.store_id,
  o.customer_id,
  o.status,
  o.total_amount,
  o.delivery_address,
  o.customer_note,
  o.created_at,
  c.name AS customer_name,
  c.phone AS customer_phone,
  s.currency_code AS store_currency_code
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
JOIN stores s ON s.id = o.store_id
WHERE o.id = ? AND o.store_id = ?
            `).get(orderId, req.user.store_id);

        if (!findingOrderQuery) {
            return res.status(404).json({ message: "Order not found." });
        }

            const orderItemsQuery = db
            .prepare(`
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
                `).all(orderId);
            res.status(200).json({data: {order: findingOrderQuery, items: orderItemsQuery}});
    } catch (error) {
        return res.status(500).json({message: "Error getting order by id", error: error.message});
    }
}


async function updateOrderStatus(req, res) {
    try {
        const orderId = Number(req.params.id);
        if(Number.isNaN(orderId) || orderId <= 0) {
            return res.status(400).json({message: "Invalid order id."});
        }
        const {status} = req.body;
        if(!status || !['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) {
            return res.status(400).json({message: "Invalid status."});
        }
        const executingOrder = db
            .prepare("SELECT id, status, store_id FROM orders WHERE id = ? AND store_id = ?")
            .get(orderId, req.user.store_id);

        if (!executingOrder) {
            return res.status(404).json({message: "Order not found."});
        }

        const previousStatus = String(executingOrder.status || "");
        if (previousStatus === status) {
            const unchanged = db
              .prepare("SELECT id, status, total_amount, created_at FROM orders WHERE id = ?")
              .get(orderId);
            return res.status(200).json({
              message: "Order status unchanged.",
              data: unchanged,
            });
        }

        db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, orderId);

        const updatedOrder = db
            .prepare("SELECT id, status, total_amount, created_at FROM orders WHERE id = ?")
            .get(orderId);

        setImmediate(() => {
          notifyCustomerOrderStatusChange({
            storeId: Number(executingOrder.store_id),
            orderId,
            previousStatus,
            newStatus: status,
          }).catch((err) => {
            console.error(
              `[order-notify] unhandled order=${orderId}:`,
              err?.message || err
            );
          });
        });

        res.status(200).json({
            message: "Order status updated successfully.",
            data: updatedOrder
        });

    } catch (error) {
        return res.status(500).json({message: "Error updating order status", error: error.message});
    }
}
module.exports = { listOrders, getOrderStatusCounts, getOrderById, updateOrderStatus }