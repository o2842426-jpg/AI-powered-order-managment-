const { parseInstagramMessagingEvents } = require("./instagram.webhook.parser");
const {
  isWebhookEventProcessed,
  insertWebhookEvent,
} = require("./instagram.webhook.repository");
const {
  isChannelMessageRecorded,
  persistInboundDmEvent,
} = require("../channels/channel.repository");
const { processChannelAiReply } = require("../channels/channel.ai.service");

/**
 * POST: signature verified — parse, dedupe, audit webhook_events, persist channel_*,
 * then trigger AI reply asynchronously (phase 4B).
 *
 * @param {object} payload — parsed Meta webhook JSON
 * @returns {{
 *   received: number,
 *   recorded: number,
 *   channel_recorded: number,
 *   ai_triggered: number,
 *   skipped_duplicate: number,
 *   skipped_no_content: number,
 *   skipped_no_connection: number
 * }}
 */
function processInstagramWebhookPayload(payload) {
  const events = parseInstagramMessagingEvents(payload);
  const stats = {
    received: events.length,
    recorded: 0,
    channel_recorded: 0,
    ai_triggered: 0,
    skipped_duplicate: 0,
    skipped_no_content: 0,
    skipped_no_connection: 0,
  };

  for (const event of events) {
    if (
      isWebhookEventProcessed(event.mid) ||
      isChannelMessageRecorded(event.mid)
    ) {
      stats.skipped_duplicate += 1;
      continue;
    }

    const rawPayload = {
      mid: event.mid,
      senderIgsid: event.senderIgsid,
      recipientIgId: event.recipientIgId,
      text: event.text,
      imageUrls: event.imageUrls,
      timestamp: event.timestamp,
      entryId: event.entryId,
    };

    try {
      const channelResult = persistInboundDmEvent(event);
      const storeId = channelResult.storeId;
      const channelError = channelResult.ok ? null : channelResult.reason;

      if (channelResult.ok) {
        stats.channel_recorded += 1;
        stats.ai_triggered += 1;

        setImmediate(() => {
          processChannelAiReply({
            storeId: channelResult.storeId,
            conversationId: channelResult.conversationId,
            connectionId: channelResult.connectionId,
            customerIgsid: event.senderIgsid,
            inboundText: event.text,
            inboundImageUrls: event.imageUrls,
          }).catch((err) => {
            console.error(
              `[channel-ai] unhandled conversation=${channelResult.conversationId}:`,
              err?.message || err
            );
          });
        });
      } else if (channelResult.reason === "no_connection") {
        stats.skipped_no_connection += 1;
      }

      insertWebhookEvent({
        eventId: event.mid,
        eventType: event.imageUrls?.length ? "inbound_image" : "inbound_text",
        storeId,
        rawPayload,
        error: channelError,
      });
      stats.recorded += 1;

      if (channelResult.ok) {
        console.info(
          `[instagram-webhook] channel inbound mid=${event.mid} store=${storeId} conversation=${channelResult.conversationId} from=${event.senderIgsid} images=${event.imageUrls?.length || 0}`
        );
      } else {
        console.warn(
          `[instagram-webhook] inbound mid=${event.mid} audit only (${channelError}) from=${event.senderIgsid} to=${event.recipientIgId}`
        );
      }
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
