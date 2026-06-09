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

/**
 * @param {number} connectionId
 * @returns {{
 *   id: number,
 *   store_id: number,
 *   platform_instagram_id: string,
 *   platform_page_id: string,
 *   access_token_enc: string,
 *   status: string
 * } | null}
 */
function getActiveConnectionById(connectionId) {
  return (
    db
      .prepare(
        `
          SELECT
            id,
            store_id,
            platform_instagram_id,
            platform_page_id,
            access_token_enc,
            status
          FROM channel_connections
          WHERE id = ? AND platform = ? AND status = 'active'
        `
      )
      .get(connectionId, PLATFORM) || null
  );
}

/**
 * @param {number} conversationId
 * @returns {{
 *   id: number,
 *   store_id: number,
 *   channel_connection_id: number,
 *   platform_thread_id: string,
 *   platform_user_id: string,
 *   owner_takeover: number,
 *   status: string
 * } | null}
 */
function getConversationById(conversationId) {
  return (
    db
      .prepare(
        `
          SELECT
            id,
            store_id,
            channel_connection_id,
            platform_thread_id,
            platform_user_id,
            owner_takeover,
            status
          FROM channel_conversations
          WHERE id = ?
        `
      )
      .get(conversationId) || null
  );
}

/**
 * @param {number} conversationId
 * @param {number} [limit]
 * @returns {Array<{ sender_type: string, message_text: string }>}
 */
function listChannelMessagesForAi(conversationId, limit = 8) {
  return db
    .prepare(
      `
        SELECT sender_type, body_text AS message_text
        FROM channel_messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      `
    )
    .all(conversationId, limit)
    .reverse();
}

/**
 * @param {{
 *   conversationId: number,
 *   storeId: number,
 *   mid?: string | null,
 *   text: string,
 *   senderType?: string,
 *   deliveryStatus?: string,
 *   payload?: object | null,
 *   sentAt?: string | null
 * }} input
 */
function insertOutboundChannelMessage({
  conversationId,
  storeId,
  mid = null,
  text,
  senderType = "ai",
  deliveryStatus = "sent",
  payload = null,
  sentAt = null,
}) {
  const at = sentAt || new Date().toISOString();

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
        payload,
        delivery_status,
        sent_at
      )
      VALUES (?, ?, ?, 'outbound', ?, ?, 'text', ?, ?, ?, ?)
    `
  ).run(
    conversationId,
    storeId,
    PLATFORM,
    senderType,
    mid,
    text,
    payload ? JSON.stringify(payload) : null,
    deliveryStatus,
    at
  );

  db.prepare(
    `
      UPDATE channel_conversations
      SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  ).run(at, conversationId);
}

/**
 * @param {number} conversationId
 * @param {number} storeId
 * @returns {object | null}
 */
/**
 * @param {number} conversationId
 * @param {number} [limit]
 * @returns {Array<object>}
 */
function listChannelMessagesForStore(conversationId, limit = 500) {
  return db
    .prepare(
      `
        SELECT
          id,
          conversation_id,
          store_id,
          platform,
          direction,
          sender_type,
          external_message_id,
          message_type,
          body_text,
          body_text AS message_text,
          payload,
          delivery_status,
          sent_at,
          created_at
        FROM channel_messages
        WHERE conversation_id = ?
        ORDER BY id ASC
        LIMIT ?
      `
    )
    .all(conversationId, limit);
}

/**
 * @param {number} conversationId
 * @param {number} storeId
 * @returns {object | null}
 */
function getChannelConversationForStore(conversationId, storeId) {
  return (
    db
      .prepare(
        `
          SELECT
            id,
            store_id,
            channel_connection_id,
            platform,
            platform_thread_id,
            platform_user_id,
            platform_username,
            customer_id,
            owner_takeover,
            lead_score,
            lead_score_reason,
            lead_scored_at,
            last_message_at,
            last_customer_message_at,
            status,
            metadata,
            created_at,
            updated_at
          FROM channel_conversations
          WHERE id = ? AND store_id = ?
        `
      )
      .get(conversationId, storeId) || null
  );
}

/**
 * Takeover ON (1) = human handling, OFF (0) = AI handling.
 *
 * @param {{
 *   conversationId: number,
 *   storeId: number,
 *   ownerTakeover: boolean
 * }} input
 * @returns {boolean}
 */
function updateChannelConversationTakeover({
  conversationId,
  storeId,
  ownerTakeover,
}) {
  const flag = ownerTakeover ? 1 : 0;

  const result = db
    .prepare(
      `
        UPDATE channel_conversations
        SET
          owner_takeover = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND store_id = ?
      `
    )
    .run(flag, conversationId, storeId);

  return result.changes > 0;
}

module.exports = {
  PLATFORM,
  metaTimestampToIso,
  isChannelMessageRecorded,
  findActiveConnectionByRecipientIds,
  upsertConversationForInbound,
  insertInboundChannelMessage,
  persistInboundDmEvent,
  getActiveConnectionById,
  getConversationById,
  listChannelMessagesForAi,
  insertOutboundChannelMessage,
  getChannelConversationForStore,
  updateChannelConversationTakeover,
  listChannelMessagesForStore,
};
