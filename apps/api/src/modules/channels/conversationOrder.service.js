const { db } = require("../../db/client");
const { ORDER_STATES } = require("./orderState.constants");
const {
  hardResetConversationOrderState,
  getConversationLinkedOrderId,
} = require("./channel.repository");

const TERMINAL_ORDER_STATUSES = new Set(["shipped", "delivered", "cancelled"]);

function normalizeIraqiPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("964") && digits.length >= 12) {
    return `0${digits.slice(3, 13)}`;
  }
  if (digits.length === 10 && digits.startsWith("7")) {
    return `0${digits}`;
  }
  return digits;
}

/**
 * Clear stale linked_order_id left by pre–hard-reset deploys or wrong-store links.
 * Allows a new checkout when the customer picks a different product or phone.
 *
 * @param {number} conversationId
 * @param {number} storeId
 * @param {object} [orderState]
 */
function reconcileConversationLinkedOrder(conversationId, storeId, orderState = {}) {
  const linkedId = getConversationLinkedOrderId(conversationId);
  if (!linkedId) {
    return { linkedOrderId: null, existingOrderId: null, isHidden: false };
  }

  const clearLink = (reason) => {
    db.prepare(
      `UPDATE channel_conversations SET linked_order_id = NULL WHERE id = ?`
    ).run(conversationId);
    console.info(
      `[channel-order] cleared linked_order_id=${linkedId} conversation=${conversationId} (${reason})`
    );
  };

  const order = db
    .prepare(
      `
        SELECT o.id, o.store_id, o.is_hidden, o.status, c.phone AS customer_phone
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.id = ?
      `
    )
    .get(linkedId);

  if (!order || Number(order.store_id) !== Number(storeId)) {
    clearLink("missing or wrong store");
    return { linkedOrderId: null, existingOrderId: null, isHidden: false };
  }

  if (TERMINAL_ORDER_STATUSES.has(String(order.status || "").trim())) {
    clearLink(`linked order status=${order.status}`);
    return { linkedOrderId: null, existingOrderId: null, isHidden: false };
  }

  const linkedPhone = normalizeIraqiPhone(order.customer_phone);
  const currentPhone = normalizeIraqiPhone(orderState.customer_phone);
  if (linkedPhone && currentPhone && linkedPhone !== currentPhone) {
    clearLink(`phone changed ${linkedPhone} → ${currentPhone}`);
    return { linkedOrderId: null, existingOrderId: null, isHidden: false };
  }

  const linkedItem = db
    .prepare(`SELECT product_id FROM order_items WHERE order_id = ? LIMIT 1`)
    .get(linkedId);
  const linkedProductId = linkedItem?.product_id ? Number(linkedItem.product_id) : 0;
  const currentProductId = Number(orderState.order_product_id) || 0;

  if (
    currentProductId &&
    linkedProductId &&
    currentProductId !== linkedProductId
  ) {
    clearLink(`new product ${currentProductId} ≠ linked ${linkedProductId}`);
    return { linkedOrderId: null, existingOrderId: null, isHidden: false };
  }

  const isHidden = Boolean(Number(order.is_hidden));
  return {
    linkedOrderId: linkedId,
    existingOrderId: linkedId,
    isHidden,
  };
}

/**
 * Minimum fields required to insert an order row.
 * @param {object} orderState
 */
function hasMinimumOrderFields(orderState) {
  return Boolean(
    orderState?.order_product_id &&
    orderState?.customer_phone &&
    (orderState?.customer_city || orderState?.customer_address)
  );
}

/**
 * @param {object} orderState
 * @param {number | null | undefined} linkedOrderId
 */
function canCreateOrderFromState(orderState, linkedOrderId) {
  if (linkedOrderId) {
    return false;
  }

  if (!hasMinimumOrderFields(orderState)) {
    return false;
  }

  const state = orderState?.order_state;
  if (
    state === ORDER_STATES.CONFIRMED_AWAITING_FINALIZE ||
    state === ORDER_STATES.CONFIRMED
  ) {
    return true;
  }

  return Boolean(orderState.buy_committed);
}

/**
 * @param {object} orderState
 */
function buildDeliveryAddress(orderState) {
  const parts = [];
  if (orderState.customer_city) {
    parts.push(String(orderState.customer_city).trim());
  }
  if (orderState.customer_address) {
    parts.push(String(orderState.customer_address).trim());
  }
  return parts.length ? parts.join(" — ") : null;
}

/**
 * @param {{ reply?: string }} aiResult
 * @param {object} orderState
 */
function aiIndicatesOrderFinalized(aiResult, orderState) {
  const reply = String(aiResult?.reply || "");
  if (
    !/ثبّ?ت|تثبّ?ت|تثبت|الطلب\s*تثبت|سجّ?لنا|سجلنا|سجّ?ل|سجل|راح\s*يوصل|وصلك|يوصل\s*فريق|فريق\s*التوصيل|٢\s*[-–]\s*٣|2\s*[-–]\s*3\s*أيام/i.test(
      reply
    )
  ) {
    return false;
  }
  return hasMinimumOrderFields(orderState);
}

/**
 * @param {{
 *   conversationId: number,
 *   storeId: number,
 *   orderState: object,
 *   platformUsername?: string | null
 * }} input
 */
function createOrderFromConversationState({
  conversationId,
  storeId,
  orderState,
  platformUsername = null,
}) {
  const meta = db
    .prepare(
      `
        SELECT id, store_id, customer_id, linked_order_id, platform_username
        FROM channel_conversations
        WHERE id = ?
      `
    )
    .get(conversationId);

  if (!meta || Number(meta.store_id) !== Number(storeId)) {
    return { created: false, reason: "conversation_not_found" };
  }

  const linkMeta = reconcileConversationLinkedOrder(
    conversationId,
    storeId,
    orderState
  );
  const linkedOrderId = linkMeta.linkedOrderId;

  if (!canCreateOrderFromState(orderState, linkedOrderId)) {
    if (linkedOrderId && linkMeta.existingOrderId) {
      return {
        created: false,
        reason: "already_created",
        order_id: linkedOrderId,
        is_hidden: linkMeta.isHidden,
        debug: {
          order_state: orderState.order_state,
          product_id: orderState.order_product_id,
          phone: Boolean(orderState.customer_phone),
          city: Boolean(orderState.customer_city),
          buy_committed: Boolean(orderState.buy_committed),
        },
      };
    }
    return {
      created: false,
      reason: "incomplete_state",
      order_id: null,
      debug: {
        order_state: orderState.order_state,
        product_id: orderState.order_product_id,
        phone: Boolean(orderState.customer_phone),
        city: Boolean(orderState.customer_city),
        buy_committed: Boolean(orderState.buy_committed),
      },
    };
  }

  const productId = Number(orderState.order_product_id);
  const product = db
    .prepare(
      `
        SELECT id, base_price, name
        FROM products
        WHERE id = ? AND store_id = ? AND is_active = 1
      `
    )
    .get(productId, storeId);

  if (!product) {
    return { created: false, reason: "product_not_found" };
  }

  const customerName = String(
    orderState.customer_name ||
      platformUsername ||
      meta.platform_username ||
      "عميل إنستغرام"
  ).trim();
  const customerPhone = String(orderState.customer_phone).trim();
  const deliveryAddress = buildDeliveryAddress(orderState);
  const paymentNote =
    orderState.payment_method === "cash_on_delivery"
      ? "كاش عند الاستلام"
      : orderState.payment_method || "غير محدد";
  const customerNote = `طلب إنستغرام DM · ${paymentNote}`;

  const created = db.transaction(() => {
    let customerId = null;
    const existing = db
      .prepare(`SELECT id FROM customers WHERE store_id = ? AND phone = ?`)
      .get(storeId, customerPhone);

    if (existing) {
      customerId = Number(existing.id);
      db.prepare(
        `UPDATE customers SET name = ?, address_text = ? WHERE id = ?`
      ).run(customerName, deliveryAddress, customerId);
    } else {
      const ins = db
        .prepare(
          `
              INSERT INTO customers (store_id, name, phone, address_text, notes)
              VALUES (?, ?, ?, ?, ?)
            `
        )
        .run(
          storeId,
          customerName,
          customerPhone,
          deliveryAddress,
          "Instagram DM"
        );
      customerId = Number(ins.lastInsertRowid);
    }

    if (Number(meta.customer_id) !== customerId) {
      db.prepare(`UPDATE channel_conversations SET customer_id = ? WHERE id = ?`).run(
        customerId,
        conversationId
      );
    }

    const orderIns = db
      .prepare(
        `
          INSERT INTO orders (store_id, customer_id, status, total_amount, delivery_address, customer_note)
          VALUES (?, ?, 'new', 0, ?, ?)
        `
      )
      .run(storeId, customerId, deliveryAddress, customerNote);

    const orderId = Number(orderIns.lastInsertRowid);
    const unitPrice = Number(product.base_price);
    const qty = 1;
    const lineTotal = unitPrice * qty;

    db.prepare(
      `
        INSERT INTO order_items (order_id, product_id, variant_id, qty, unit_price, line_total)
        VALUES (?, ?, NULL, ?, ?, ?)
      `
    ).run(orderId, productId, qty, unitPrice, lineTotal);

    db.prepare(`UPDATE orders SET total_amount = ? WHERE id = ?`).run(lineTotal, orderId);

    // Hard reset in the same transaction — canvas clear for the next order in this DM thread.
    hardResetConversationOrderState(conversationId);

    return {
      order_id: orderId,
      customer_id: customerId,
      total_amount: lineTotal,
      product_name: product.name,
    };
  })();

  console.info(
    `[channel-order] created order=${created.order_id} conversation=${conversationId} store=${storeId} product=${productId} — canvas hard-reset`
  );

  return { created: true, ...created };
}

module.exports = {
  canCreateOrderFromState,
  hasMinimumOrderFields,
  reconcileConversationLinkedOrder,
  createOrderFromConversationState,
  aiIndicatesOrderFinalized,
  buildDeliveryAddress,
};
