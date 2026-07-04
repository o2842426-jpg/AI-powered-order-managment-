const { db } = require("../../db/client");
const { ORDER_STATES } = require("./orderState.constants");
const { hardResetConversationOrderState } = require("./channel.repository");

/**
 * @param {object} orderState
 * @param {number | null | undefined} linkedOrderId
 */
function canCreateOrderFromState(orderState, linkedOrderId) {
  if (linkedOrderId) {
    return false;
  }

  const state = orderState?.order_state;
  if (
    state !== ORDER_STATES.CONFIRMED_AWAITING_FINALIZE &&
    state !== ORDER_STATES.CONFIRMED
  ) {
    return false;
  }

  return Boolean(
    orderState.order_product_id &&
    orderState.customer_phone &&
    (orderState.customer_city || orderState.customer_address)
  );
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
    !/ثبّ?ت|تثبّ?ت|سجّ?لنا|سجلنا|سجّ?ل|سجل|راح\s*يوصل|وصلك|٢\s*[-–]\s*٣|2\s*[-–]\s*3\s*أيام/i.test(
      reply
    )
  ) {
    return false;
  }
  return canCreateOrderFromState(orderState, null);
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

  const linkedOrderId =
    meta.linked_order_id != null && Number(meta.linked_order_id) > 0
      ? Number(meta.linked_order_id)
      : null;

  if (!canCreateOrderFromState(orderState, linkedOrderId)) {
    return {
      created: false,
      reason: linkedOrderId ? "already_linked" : "incomplete_state",
      order_id: linkedOrderId,
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
    let customerId =
      meta.customer_id != null && Number(meta.customer_id) > 0
        ? Number(meta.customer_id)
        : null;

    if (!customerId) {
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
  createOrderFromConversationState,
  aiIndicatesOrderFinalized,
  buildDeliveryAddress,
};
