const { db } = require("../../db/client");

const PLATFORM = "instagram";

/**
 * @param {number | null | undefined} timestamp — Meta messaging timestamp (sec or ms)
 * @returns {string | null}
 */
function metaTimestampToIso(timestamp) {
  if (timestamp == null || !Number.isFinite(Number(timestamp))) {
    return null;
  }
  const n = Number(timestamp);
  const ms = n > 1e12 ? n : n * 1000;
  return new Date(ms).toISOString();
}

/**
 * @param {string} externalMessageId — Meta mid
 * @returns {boolean}
 */
function isChannelMessageRecorded(externalMessageId) {
  const row = db
    .prepare(
      `
        SELECT id
        FROM channel_messages
        WHERE platform = ? AND external_message_id = ?
      `
    )
    .get(PLATFORM, externalMessageId);
  return Boolean(row);
}

/**
 * Resolve an active Instagram connection for the webhook recipient / entry id.
 *
 * @param {{ recipientId?: string | null, entryId?: string | null }} ids
 * @returns {{ id: number, store_id: number, platform_page_id: string, platform_instagram_id: string } | null}
 */
function findActiveConnectionByRecipientIds({ recipientId, entryId }) {
  const lookupIds = [...new Set([recipientId, entryId].filter(Boolean).map(String))];
  if (!lookupIds.length) {
    return null;
  }

  const stmt = db.prepare(
    `
      SELECT id, store_id, platform_page_id, platform_instagram_id
      FROM channel_connections
      WHERE platform = ?
        AND status = 'active'
        AND (platform_page_id = ? OR platform_instagram_id = ?)
      LIMIT 1
    `
  );

  for (const id of lookupIds) {
    const row = stmt.get(PLATFORM, id, id);
    if (row) {
      return row;
    }
  }

  return null;
}

/**
 * @param {{
 *   storeId: number,
 *   connectionId: number,
 *   senderIgsid: string,
 *   messageAt?: string | null
 * }} input
 * @returns {{ id: number }}
 */
function upsertConversationForInbound({
  storeId,
  connectionId,
  senderIgsid,
  messageAt,
}) {
  const at = messageAt || new Date().toISOString();

  const existing = db
    .prepare(
      `
        SELECT id
        FROM channel_conversations
        WHERE store_id = ? AND platform = ? AND platform_thread_id = ?
      `
    )
    .get(storeId, PLATFORM, senderIgsid);

  if (existing) {
    db.prepare(
      `
        UPDATE channel_conversations
        SET
          last_message_at = ?,
          last_customer_message_at = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(at, at, existing.id);
    return { id: existing.id };
  }

  const result = db
    .prepare(
      `
        INSERT INTO channel_conversations (
          store_id,
          channel_connection_id,
          platform,
          platform_thread_id,
          platform_user_id,
          last_message_at,
          last_customer_message_at,
          status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
      `
    )
    .run(storeId, connectionId, PLATFORM, senderIgsid, senderIgsid, at, at);

  return { id: Number(result.lastInsertRowid) };
}

/**
 * @param {{
 *   conversationId: number,
 *   storeId: number,
 *   mid: string,
 *   text: string,
 *   messageAt?: string | null
 * }} input
 */
function insertInboundChannelMessage({
  conversationId,
  storeId,
  mid,
  text,
  messageAt,
}) {
  db.prepare(
    `
      INSERT INTO channel_messages (
        conversation_id,
        store_id,
        platform,
        direction,
        sender_type,
        external_message_id,
        message_type,
        body_text,
        delivery_status,
        sent_at
      )
      VALUES (?, ?, ?, 'inbound', 'customer', ?, 'text', ?, 'received', ?)
    `
  ).run(conversationId, storeId, PLATFORM, mid, text, messageAt);
}

/**
 * Persist one inbound DM into channel_conversations + channel_messages.
 *
 * @param {{
 *   mid: string,
 *   senderIgsid: string,
 *   recipientIgId: string,
 *   text: string,
 *   timestamp?: number | null,
 *   entryId?: string | null
 * }} event
 * @returns {{
 *   ok: boolean,
 *   reason?: string,
 *   storeId: number | null,
 *   conversationId?: number,
 *   connectionId?: number
 * }}
 */
function persistInboundDmEvent(event) {
  const connection = findActiveConnectionByRecipientIds({
    recipientId: event.recipientIgId,
    entryId: event.entryId,
  });

  if (!connection) {
    return { ok: false, reason: "no_connection", storeId: null };
  }

  const messageAt = metaTimestampToIso(event.timestamp);

  const run = db.transaction(() => {
    const conversation = upsertConversationForInbound({
      storeId: connection.store_id,
      connectionId: connection.id,
      senderIgsid: event.senderIgsid,
      messageAt,
    });

    insertInboundChannelMessage({
      conversationId: conversation.id,
      storeId: connection.store_id,
      mid: event.mid,
      text: event.text,
      messageAt,
    });

    return {
      ok: true,
      storeId: connection.store_id,
      conversationId: conversation.id,
      connectionId: connection.id,
    };
  });

  return run();
}

module.exports = {
  PLATFORM,
  metaTimestampToIso,
  isChannelMessageRecorded,
  findActiveConnectionByRecipientIds,
  upsertConversationForInbound,
  insertInboundChannelMessage,
  persistInboundDmEvent,
};
