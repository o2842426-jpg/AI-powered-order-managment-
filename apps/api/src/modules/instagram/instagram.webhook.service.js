const { parseInstagramMessagingEvents } = require("./instagram.webhook.parser");
const {
  isWebhookEventProcessed,
  insertWebhookEvent,
} = require("./instagram.webhook.repository");

/**
 * Phase 1 POST: signature already verified — parse, dedupe, persist audit rows.
 * AI / channel_conversations wiring comes in the next step.
 *
 * @param {object} payload — parsed Meta webhook JSON
 * @returns {{ received: number, recorded: number, skipped_duplicate: number, skipped_no_text: number }}
 */
function processInstagramWebhookPayload(payload) {
  const events = parseInstagramMessagingEvents(payload);
  const stats = {
    received: events.length,
    recorded: 0,
    skipped_duplicate: 0,
    skipped_no_text: 0,
  };

  for (const event of events) {
    if (isWebhookEventProcessed(event.mid)) {
      stats.skipped_duplicate += 1;
      continue;
    }

    try {
      insertWebhookEvent({
        eventId: event.mid,
        eventType: "inbound_text",
        storeId: null,
        rawPayload: {
          mid: event.mid,
          senderIgsid: event.senderIgsid,
          recipientIgId: event.recipientIgId,
          text: event.text,
          timestamp: event.timestamp,
          entryId: event.entryId,
        },
        error: null,
      });
      stats.recorded += 1;

      console.info(
        `[instagram-webhook] inbound text mid=${event.mid} from=${event.senderIgsid} to=${event.recipientIgId} len=${event.text.length}`
      );
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes("UNIQUE") || msg.includes("unique")) {
        stats.skipped_duplicate += 1;
        continue;
      }
      console.error(`[instagram-webhook] failed to record mid=${event.mid}:`, msg);
      try {
        insertWebhookEvent({
          eventId: event.mid,
          eventType: "inbound_text",
          storeId: null,
          rawPayload: { mid: event.mid },
          error: msg,
        });
      } catch {
        /* race on duplicate — ignore */
      }
    }
  }

  return stats;
}

module.exports = { processInstagramWebhookPayload };
