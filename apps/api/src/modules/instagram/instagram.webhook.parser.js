const ACCEPTED_WEBHOOK_OBJECTS = new Set(["instagram", "page"]);

/**
 * Extract inbound text DM events from a Meta webhook payload (Instagram v1).
 * Skips: echoes, non-text messages, events without mid.
 *
 * @param {unknown} payload
 * @returns {Array<{
 *   mid: string,
 *   senderIgsid: string,
 *   recipientIgId: string,
 *   text: string,
 *   timestamp: number | null,
 *   entryId: string | null,
 *   raw: object
 * }>}
 */
function parseInstagramMessagingEvents(payload) {
  const events = [];
  if (!payload || typeof payload !== "object") {
    return events;
  }

  const objectType = String(payload.object || "");
  if (objectType && !ACCEPTED_WEBHOOK_OBJECTS.has(objectType)) {
    console.warn(
      `[instagram-webhook] unexpected payload.object="${objectType}" — parsing entry.messaging anyway`
    );
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;

    const entryId = entry.id != null ? String(entry.id) : null;
    const messaging = Array.isArray(entry.messaging) ? entry.messaging : [];

    for (const item of messaging) {
      if (!item || typeof item !== "object") continue;

      if (item.message?.is_echo === true) {
        continue;
      }

      const mid = item.message?.mid != null ? String(item.message.mid) : "";
      if (!mid) {
        continue;
      }

      const text =
        item.message?.text != null ? String(item.message.text).trim() : "";
      if (!text) {
        continue;
      }

      const senderIgsid =
        item.sender?.id != null ? String(item.sender.id) : "";
      const recipientIgId =
        item.recipient?.id != null ? String(item.recipient.id) : "";
      if (!senderIgsid || !recipientIgId) {
        continue;
      }

      events.push({
        mid,
        senderIgsid,
        recipientIgId,
        text,
        timestamp: item.timestamp != null ? Number(item.timestamp) : null,
        entryId,
        raw: item,
      });
    }
  }

  return events;
}

module.exports = { parseInstagramMessagingEvents };
