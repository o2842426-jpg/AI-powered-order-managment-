const { db } = require("../../db/client");
const { sendInstagramTextWithEncryptedToken } = require("../instagram/instagram.send.service");
const {
  getActiveConnectionById,
  insertOutboundChannelMessage,
} = require("../channels/channel.repository");

const STATUS_DM_TEMPLATES = {
  confirmed:
    "عيني الغالي، تم تأكيد طلبك بنجاح من قبل الإدارة وسيتم تجهيزه فوراً.",
  shipped:
    "عيوني، طلبك الحين طلع ويا شركة الشحن وهو بالطريق إلك لباب البيت.",
};

/**
 * @param {number} storeId
 * @param {number} orderId
 */
function findInstagramConversationForOrder(storeId, orderId) {
  const linked = db
    .prepare(
      `
        SELECT
          id,
          channel_connection_id,
          platform_thread_id,
          store_id
        FROM channel_conversations
        WHERE store_id = ? AND linked_order_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .get(storeId, orderId);

  if (linked) {
    return linked;
  }

  const order = db
    .prepare(`SELECT customer_id FROM orders WHERE id = ? AND store_id = ?`)
    .get(orderId, storeId);

  if (!order?.customer_id) {
    return null;
  }

  return (
    db
      .prepare(
        `
          SELECT
            id,
            channel_connection_id,
            platform_thread_id,
            store_id
          FROM channel_conversations
          WHERE store_id = ?
            AND customer_id = ?
            AND platform = 'instagram'
          ORDER BY datetime(COALESCE(last_message_at, created_at)) DESC, id DESC
          LIMIT 1
        `
      )
      .get(storeId, order.customer_id) || null
  );
}

/**
 * Direct Meta DM — static Iraqi copy only (no LLM).
 *
 * @param {{
 *   storeId: number,
 *   orderId: number,
 *   previousStatus: string,
 *   newStatus: string
 * }} input
 */
async function notifyCustomerOrderStatusChange({
  storeId,
  orderId,
  previousStatus,
  newStatus,
}) {
  const next = String(newStatus || "").trim().toLowerCase();
  const prev = String(previousStatus || "").trim().toLowerCase();

  if (!next || next === prev) {
    return { sent: false, reason: "unchanged_status" };
  }

  const template = STATUS_DM_TEMPLATES[next];
  if (!template) {
    return { sent: false, reason: "no_template_for_status" };
  }

  const conversation = findInstagramConversationForOrder(storeId, orderId);
  if (!conversation) {
    return { sent: false, reason: "no_instagram_thread" };
  }

  const connection = getActiveConnectionById(conversation.channel_connection_id);
  if (!connection || Number(connection.store_id) !== Number(storeId)) {
    return { sent: false, reason: "channel_unavailable" };
  }

  const sendResult = await sendInstagramTextWithEncryptedToken({
    connection,
    recipientIgsid: conversation.platform_thread_id,
    text: template,
  });

  if (sendResult.ok) {
    insertOutboundChannelMessage({
      conversationId: conversation.id,
      storeId,
      mid: sendResult.messageId,
      text: template,
      senderType: "system",
      deliveryStatus: "sent",
      payload: {
        order_id: orderId,
        order_status: next,
        notification_type: "order_status_update",
      },
    });

    console.info(
      `[order-notify] DM sent store=${storeId} order=${orderId} status=${next} conversation=${conversation.id}`
    );

    return { sent: true, conversation_id: conversation.id, message_id: sendResult.messageId };
  }

  insertOutboundChannelMessage({
    conversationId: conversation.id,
    storeId,
    mid: null,
    text: template,
    senderType: "system",
    deliveryStatus: "failed",
    payload: {
      order_id: orderId,
      order_status: next,
      notification_type: "order_status_update",
      send_error: sendResult.error,
    },
  });

  console.warn(
    `[order-notify] DM failed store=${storeId} order=${orderId}: ${sendResult.error}`
  );

  return { sent: false, reason: "instagram_send_failed", error: sendResult.error };
}

module.exports = {
  STATUS_DM_TEMPLATES,
  findInstagramConversationForOrder,
  notifyCustomerOrderStatusChange,
};
