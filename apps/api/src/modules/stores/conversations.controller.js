const { db } = require("../../db/client");
const { attachLeadPayloadToMessageRow } = require("../leads/leadScoring.service");
const { assertStoreScope } = require("./storeScope");
const {
  storeHasFeature,
  sanitizeLeadScoreRow,
  sanitizeLeadScoreMessages,
} = require("../plans/planEntitlements");

/**
 * GET /api/stores/:storeId/chat-sessions
 * Query: limit (default 50, max 100), offset (default 0), q (optional search on message text)
 */
function listChatSessions(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const qRaw = req.query.q != null ? String(req.query.q).trim() : "";
    const qClean = qRaw.replace(/[%_]/g, "").slice(0, 120);

    const params = [storeId];
    let searchClause = "";
    if (qClean) {
      searchClause = `
        AND EXISTS (
          SELECT 1 FROM chat_messages cm2
          WHERE cm2.session_id = cs.id
            AND cm2.message_text LIKE ?
        )
      `;
      params.push(`%${qClean}%`);
    }

    params.push(limit, offset);

    const rows = db
      .prepare(
        `
          SELECT
            cs.id,
            cs.store_id,
            cs.customer_id,
            cs.channel,
            cs.started_at,
            cs.last_message_at,
            cs.owner_takeover,
            cs.lead_score,
            cs.lead_score_reason,
            cs.lead_scored_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            (
              SELECT COUNT(*)
              FROM chat_messages cm
              WHERE cm.session_id = cs.id
            ) AS message_count,
            (
              SELECT cm.message_text
              FROM chat_messages cm
              WHERE cm.session_id = cs.id
              ORDER BY cm.id DESC
              LIMIT 1
            ) AS last_message_preview,
            (
              SELECT cm.sender_type
              FROM chat_messages cm
              WHERE cm.session_id = cs.id
              ORDER BY cm.id DESC
              LIMIT 1
            ) AS last_sender_type
          FROM chat_sessions cs
          LEFT JOIN customers c ON c.id = cs.customer_id
          WHERE cs.store_id = ?
          ${searchClause}
          ORDER BY datetime(COALESCE(cs.last_message_at, cs.started_at)) DESC, cs.id DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(...params);

    const allowLeadScoring = storeHasFeature(storeId, "lead_scoring");
    const data = rows.map((row) => sanitizeLeadScoreRow(row, allowLeadScoring));

    return res.status(200).json({ data });
  } catch (error) {
    return res.status(500).json({
      message: "Could not list chat sessions.",
      error: error.message,
    });
  }
}

/**
 * GET /api/stores/:storeId/chat-sessions/:sessionId
 */
function getChatSessionDetail(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const sessionId = Number(req.params.sessionId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "sessionId must be a valid positive number." });
    }

    const session = db
      .prepare(
        `
          SELECT
            cs.id,
            cs.store_id,
            cs.customer_id,
            cs.channel,
            cs.started_at,
            cs.last_message_at,
            cs.owner_takeover,
            cs.lead_score,
            cs.lead_score_reason,
            cs.lead_scored_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.address_text AS customer_address
          FROM chat_sessions cs
          LEFT JOIN customers c ON c.id = cs.customer_id
          WHERE cs.id = ? AND cs.store_id = ?
        `
      )
      .get(sessionId, storeId);

    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    const allowLeadScoring = storeHasFeature(storeId, "lead_scoring");

    const messages = sanitizeLeadScoreMessages(
      db
        .prepare(
          `
          SELECT id, session_id, sender_type, message_text, intent, payload, created_at
          FROM chat_messages
          WHERE session_id = ?
          ORDER BY id ASC
          LIMIT 500
        `
        )
        .all(sessionId)
        .map((row) => attachLeadPayloadToMessageRow(row)),
      allowLeadScoring
    );

    return res.status(200).json({
      data: {
        session: sanitizeLeadScoreRow(session, allowLeadScoring),
        messages,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load chat session.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/stores/:storeId/chat-sessions/:sessionId/takeover
 * Body: { enabled: boolean }
 */
function setChatSessionTakeover(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const sessionId = Number(req.params.sessionId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "sessionId must be a valid positive number." });
    }

    const enabled = req.body?.enabled;
    if (
      enabled !== true &&
      enabled !== false &&
      enabled !== 1 &&
      enabled !== 0
    ) {
      return res.status(400).json({ message: "enabled must be true or false." });
    }
    const flag = enabled === true || enabled === 1 ? 1 : 0;

    const result = db
      .prepare(
        `
          UPDATE chat_sessions
          SET owner_takeover = ?
          WHERE id = ? AND store_id = ?
        `
      )
      .run(flag, sessionId, storeId);

    if (result.changes === 0) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    const session = db
      .prepare(
        `
          SELECT
            cs.id,
            cs.store_id,
            cs.customer_id,
            cs.channel,
            cs.started_at,
            cs.last_message_at,
            cs.owner_takeover,
            cs.lead_score,
            cs.lead_score_reason,
            cs.lead_scored_at,
            c.name AS customer_name,
            c.phone AS customer_phone,
            c.address_text AS customer_address
          FROM chat_sessions cs
          LEFT JOIN customers c ON c.id = cs.customer_id
          WHERE cs.id = ? AND cs.store_id = ?
        `
      )
      .get(sessionId, storeId);

    const allowLeadScoring = storeHasFeature(storeId, "lead_scoring");

    return res.status(200).json({
      data: { session: sanitizeLeadScoreRow(session, allowLeadScoring) },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update takeover state.",
      error: error.message,
    });
  }
}

/**
 * POST /api/stores/:storeId/chat-sessions/:sessionId/owner-messages
 * Body: { message_text: string } — allowed only while owner_takeover is active.
 */
function postOwnerChatMessage(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const sessionId = Number(req.params.sessionId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(sessionId) || sessionId <= 0) {
      return res.status(400).json({ message: "sessionId must be a valid positive number." });
    }

    const messageText = String(req.body?.message_text ?? "").trim();
    if (!messageText) {
      return res.status(400).json({ message: "message_text is required." });
    }

    const session = db
      .prepare(
        `
          SELECT id, owner_takeover
          FROM chat_sessions
          WHERE id = ? AND store_id = ?
        `
      )
      .get(sessionId, storeId);

    if (!session) {
      return res.status(404).json({ message: "Chat session not found." });
    }

    if (Number(session.owner_takeover) !== 1) {
      return res.status(409).json({
        message: "Turn on human takeover for this chat before sending owner messages.",
        code: "TAKEOVER_REQUIRED",
      });
    }

    db.prepare(
      `
        INSERT INTO chat_messages (session_id, sender_type, message_text, intent, payload)
        VALUES (?, 'owner', ?, NULL, NULL)
      `
    ).run(sessionId, messageText);

    db.prepare(
      `
        UPDATE chat_sessions
        SET last_message_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `
    ).run(sessionId);

    const allowLeadScoring = storeHasFeature(storeId, "lead_scoring");

    const messages = sanitizeLeadScoreMessages(
      db
        .prepare(
          `
          SELECT id, session_id, sender_type, message_text, intent, payload, created_at
          FROM chat_messages
          WHERE session_id = ?
          ORDER BY id ASC
          LIMIT 500
        `
        )
        .all(sessionId)
        .map((row) => attachLeadPayloadToMessageRow(row)),
      allowLeadScoring
    );

    return res.status(201).json({
      message: "Message sent.",
      data: { session_id: sessionId, messages },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not send owner message.",
      error: error.message,
    });
  }
}

module.exports = {
  listChatSessions,
  getChatSessionDetail,
  setChatSessionTakeover,
  postOwnerChatMessage,
};
