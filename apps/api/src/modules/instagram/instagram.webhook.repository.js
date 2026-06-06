const { db } = require("../../db/client");

const PLATFORM = "instagram";

/**
 * @param {string} eventId — Meta message mid
 * @returns {boolean}
 */
function isWebhookEventProcessed(eventId) {
  const row = db
    .prepare(
      `
        SELECT id
        FROM webhook_events
        WHERE platform = ? AND event_id = ?
      `
    )
    .get(PLATFORM, eventId);
  return Boolean(row);
}

/**
 * @param {{
 *   eventId: string,
 *   eventType?: string,
 *   storeId?: number | null,
 *   rawPayload?: object,
 *   error?: string | null
 * }} row
 */
function insertWebhookEvent({
  eventId,
  eventType = "inbound_text",
  storeId = null,
  rawPayload = null,
  error = null,
}) {
  db.prepare(
    `
      INSERT INTO webhook_events (
        platform,
        event_id,
        event_type,
        store_id,
        processed_at,
        raw_payload,
        error
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    `
  ).run(
    PLATFORM,
    eventId,
    eventType,
    storeId,
    rawPayload ? JSON.stringify(rawPayload) : null,
    error
  );
}

module.exports = {
  PLATFORM,
  isWebhookEventProcessed,
  insertWebhookEvent,
};
