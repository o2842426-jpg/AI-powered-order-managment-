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
 *   messageAt?: string | null,
 *   messageType?: string,
 *   payload?: object | null
 * }} input
 */
function insertInboundChannelMessage({
  conversationId,
  storeId,
  mid,
  text,
  messageAt,
  messageType = "text",
  payload = null,
}) {
  const normalizedType = String(messageType || "text").trim() || "text";
  const bodyText =
    String(text || "").trim() ||
    (normalizedType === "image" ? "[صورة من العميل]" : "");

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
      VALUES (?, ?, ?, 'inbound', 'customer', ?, ?, ?, ?, 'received', ?)
    `
  ).run(
    conversationId,
    storeId,
    PLATFORM,
    mid,
    normalizedType,
    bodyText,
    payload ? JSON.stringify(payload) : null,
    messageAt
  );
}

/**
 * Persist one inbound DM into channel_conversations + channel_messages.
 *
 * @param {{
 *   mid: string,
 *   senderIgsid: string,
 *   recipientIgId: string,
 *   text: string,
 *   imageUrls?: string[],
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
  const imageUrls = Array.isArray(event.imageUrls)
    ? event.imageUrls.filter((u) => typeof u === "string" && u.trim())
    : [];
  const hasImages = imageUrls.length > 0;
  const messageType = hasImages ? "image" : "text";
  const payload = hasImages ? { customer_image_urls: imageUrls } : null;

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
      messageType,
      payload,
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
 *   sentAt?: string | null,
 *   messageType?: string
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
  messageType = "text",
}) {
  const at = sentAt || new Date().toISOString();
  const normalizedType = String(messageType || "text").trim() || "text";

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
      VALUES (?, ?, ?, 'outbound', ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    conversationId,
    storeId,
    PLATFORM,
    senderType,
    mid,
    normalizedType,
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

/**
 * Public connection summary for owner dashboard (no token fields).
 *
 * @param {number} storeId
 * @returns {object | null}
 */
function getInstagramConnectionForStore(storeId) {
  return (
    db
      .prepare(
        `
          SELECT
            id,
            store_id,
            platform,
            platform_page_id,
            platform_instagram_id,
            page_name,
            token_expires_at,
            webhook_subscribed,
            status,
            connected_at,
            updated_at
          FROM channel_connections
          WHERE store_id = ? AND platform = ? AND status = 'active'
          LIMIT 1
        `
      )
      .get(storeId, PLATFORM) || null
  );
}

/**
 * @param {{
 *   storeId: number,
 *   platformPageId: string,
 *   platformInstagramId: string,
 *   pageName: string,
 *   accessTokenEnc: string,
 *   tokenExpiresAt?: string | null,
 *   webhookSubscribed?: number,
 *   metadata?: object | null
 * }} input
 * @returns {{ id: number, created: boolean }}
 */
function upsertInstagramChannelConnection({
  storeId,
  platformPageId,
  platformInstagramId,
  pageName,
  accessTokenEnc,
  tokenExpiresAt = null,
  webhookSubscribed = 1,
  metadata = null,
}) {
  const igOwner = db
    .prepare(
      `
        SELECT id, store_id
        FROM channel_connections
        WHERE platform = ? AND platform_instagram_id = ?
      `
    )
    .get(PLATFORM, platformInstagramId);

  if (igOwner && Number(igOwner.store_id) !== Number(storeId)) {
    const err = new Error(
      `Instagram account ${platformInstagramId} is already linked to store ${igOwner.store_id}.`
    );
    err.code = "IG_ALREADY_LINKED";
    throw err;
  }

  const existing = db
    .prepare(
      `
        SELECT id
        FROM channel_connections
        WHERE store_id = ? AND platform = ?
      `
    )
    .get(storeId, PLATFORM);

  if (existing) {
    db.prepare(
      `
        UPDATE channel_connections
        SET
          platform_page_id = ?,
          platform_instagram_id = ?,
          page_name = ?,
          access_token_enc = ?,
          token_expires_at = ?,
          webhook_subscribed = ?,
          status = 'active',
          metadata = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(
      platformPageId,
      platformInstagramId,
      pageName,
      accessTokenEnc,
      tokenExpiresAt,
      webhookSubscribed ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null,
      existing.id
    );
    return { id: existing.id, created: false };
  }

  const result = db
    .prepare(
      `
        INSERT INTO channel_connections (
          store_id,
          platform,
          platform_page_id,
          platform_instagram_id,
          page_name,
          access_token_enc,
          token_expires_at,
          webhook_subscribed,
          status,
          metadata
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `
    )
    .run(
      storeId,
      PLATFORM,
      platformPageId,
      platformInstagramId,
      pageName,
      accessTokenEnc,
      tokenExpiresAt,
      webhookSubscribed ? 1 : 0,
      metadata ? JSON.stringify(metadata) : null
    );

  return { id: Number(result.lastInsertRowid), created: true };
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
  getInstagramConnectionForStore,
  upsertInstagramChannelConnection,
};
