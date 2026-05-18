/**
 * P6 — Rule-based lead scoring (not absolute truth). Reasons stay short for transparency.
 * Persisted on `chat_sessions` + last customer message `payload` JSON.
 */

const PURCHASE_HINTS = [
  "شراء",
  "طلب",
  "سلة",
  "دفع",
  "فاتورة",
  "طلبية",
  "كم السعر",
  "سعر",
  "توصيل اليوم",
  "عاجل",
  "urgent",
  "order",
  "buy",
  "checkout",
];

/**
 * @param {import("better-sqlite3").Database} db
 * @param {number} sessionId
 * @param {number} storeId
 * @returns {{ score: number, reason: string }}
 */
function computeLeadScoreForSession(db, sessionId, storeId) {
  const session = db
    .prepare(
      `
        SELECT id, customer_id
        FROM chat_sessions
        WHERE id = ? AND store_id = ?
      `
    )
    .get(sessionId, storeId);

  if (!session) {
    return { score: 0, reason: "جلسة غير معروفة" };
  }

  const stats = db
    .prepare(
      `
        SELECT COUNT(*) AS customer_msgs
        FROM chat_messages
        WHERE session_id = ? AND sender_type = 'customer'
      `
    )
    .get(sessionId);

  const customerMsgs = Number(stats?.customer_msgs) || 0;

  const last = db
    .prepare(
      `
        SELECT message_text
        FROM chat_messages
        WHERE session_id = ? AND sender_type = 'customer'
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .get(sessionId);

  const lastText = String(last?.message_text || "");
  const lower = lastText.toLowerCase();

  let points = 8;
  const reasonParts = [];

  points += Math.min(22, customerMsgs * 4);
  if (customerMsgs >= 2) {
    reasonParts.push("تعدد رسائل العميل");
  }

  if (PURCHASE_HINTS.some((h) => lower.includes(String(h).toLowerCase()))) {
    points += 28;
    reasonParts.push("كلمات تشير للشراء أو التسعير");
  }

  if (lastText.length > 100) {
    points += 12;
    reasonParts.push("رسالة تفصيلية");
  }

  if (session.customer_id) {
    const oc = db
      .prepare(
        `
          SELECT COUNT(*) AS c
          FROM orders
          WHERE store_id = ?
            AND customer_id = ?
            AND status != 'cancelled'
        `
      )
      .get(storeId, session.customer_id);
    const orderCount = Number(oc?.c) || 0;
    if (orderCount > 0) {
      points += 24;
      reasonParts.push("سجل طلبات سابق لنفس العميل");
    }
  }

  const score = Math.min(100, Math.max(0, Math.round(points)));
  let reason = reasonParts.length ? reasonParts.slice(0, 4).join(" · ") : "تقييم أولي بعد أول رسالة";
  if (reason.length > 220) {
    reason = `${reason.slice(0, 217)}…`;
  }

  return { score, reason };
}

/**
 * Writes score to session + JSON payload on the customer message row.
 * @returns {{ lead_score: number, lead_score_reason: string }}
 */
function refreshLeadScoreAfterCustomerMessage(db, sessionId, storeId, customerMessageId) {
  const { score, reason } = computeLeadScoreForSession(db, sessionId, storeId);
  const payload = JSON.stringify({
    lead_score: score,
    lead_score_reason: reason,
  });

  db.prepare(
    `
      UPDATE chat_sessions
      SET lead_score = ?,
          lead_score_reason = ?,
          lead_scored_at = CURRENT_TIMESTAMP
      WHERE id = ? AND store_id = ?
    `
  ).run(score, reason, sessionId, storeId);

  db.prepare(
    `
      UPDATE chat_messages
      SET payload = ?
      WHERE id = ?
    `
  ).run(payload, customerMessageId);

  return { lead_score: score, lead_score_reason: reason };
}

/**
 * Expose lead snapshot on message objects for owner APIs / enriched public rows.
 * @param {object} row
 */
function attachLeadPayloadToMessageRow(row) {
  const m = { ...row };
  if (row.sender_type === "customer" && row.payload) {
    try {
      const p = JSON.parse(row.payload);
      if (p.lead_score != null) {
        m.lead_score = Number(p.lead_score);
        m.lead_score_reason =
          typeof p.lead_score_reason === "string" ? p.lead_score_reason : "";
      }
    } catch {
      /* ignore */
    }
  }
  return m;
}

module.exports = {
  computeLeadScoreForSession,
  refreshLeadScoreAfterCustomerMessage,
  attachLeadPayloadToMessageRow,
};
