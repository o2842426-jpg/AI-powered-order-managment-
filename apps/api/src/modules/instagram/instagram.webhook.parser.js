const ACCEPTED_WEBHOOK_OBJECTS = new Set(["instagram", "page"]);

/**
 * Extract inbound text + image DM events from a Meta webhook payload (Instagram v1).
 * Skips: echoes, events without mid, messages with neither text nor image.
 *
 * @param {unknown} payload
 * @returns {Array<{
 *   mid: string,
 *   senderIgsid: string,
 *   senderHandle: string | null,
 *   recipientIgId: string,
 *   text: string,
 *   imageUrls: string[],
 *   timestamp: number | null,
 *   entryId: string | null,
 *   raw: object
 * }>}
 */
function extractInboundImageUrls(message) {
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const urls = [];
  const seen = new Set();

  for (const att of attachments) {
    if (!att || typeof att !== "object") continue;
    const type = String(att.type || "").toLowerCase();
    if (type !== "image") continue;

    const url =
      att.payload?.url != null
        ? String(att.payload.url).trim()
        : att.payload?.story_media_url != null
          ? String(att.payload.story_media_url).trim()
          : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

/**
 * Best-effort extraction of the sender's human-readable handle (Instagram username or
 * display name) from a messaging event. Meta's payload shape varies by product/version,
 * so we probe the known locations and normalize (strip a leading "@").
 *
 * @param {object} item — one entry.messaging[] element
 * @returns {string | null}
 */
function extractSenderHandle(item) {
  const candidates = [
    item?.sender?.username,
    item?.sender?.name,
    item?.message?.from?.username,
    item?.message?.from?.name,
    item?.user_profile?.username,
    item?.user_profile?.name,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    const handle = String(candidate).trim().replace(/^@+/, "").trim();
    if (handle) {
      return handle.slice(0, 120);
    }
  }

  return null;
}

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
      const imageUrls = extractInboundImageUrls(item.message);
      if (!text && !imageUrls.length) {
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
        senderHandle: extractSenderHandle(item),
        recipientIgId,
        text,
        imageUrls,
        timestamp: item.timestamp != null ? Number(item.timestamp) : null,
        entryId,
        raw: item,
      });
    }
  }

  return events;
}

module.exports = {
  parseInstagramMessagingEvents,
  extractInboundImageUrls,
  extractSenderHandle,
};
