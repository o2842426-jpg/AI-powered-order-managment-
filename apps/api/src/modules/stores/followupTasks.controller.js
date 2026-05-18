const { db } = require("../../db/client");
const { assertStoreScope } = require("./storeScope");

/**
 * Sessions whose latest message is from the customer (owner may want to follow up).
 * @param {import("better-sqlite3").Database} db
 * @param {number} storeId
 */
function loadCustomerLastMessageSessions(db, storeId) {
  return db
    .prepare(
      `
        SELECT
          cs.id AS session_id,
          cm.id AS last_customer_message_id,
          substr(cm.message_text, 1, 140) AS preview
        FROM chat_sessions cs
        INNER JOIN chat_messages cm
          ON cm.id = (SELECT MAX(id) FROM chat_messages WHERE session_id = cs.id)
        WHERE cs.store_id = ?
          AND cm.sender_type = 'customer'
      `
    )
    .all(storeId);
}

/**
 * Upsert task rows + auto-close stale open tasks (AI/owner replied after).
 */
function syncFollowupTasksForStore(db, storeId) {
  const candidates = loadCustomerLastMessageSessions(db, storeId);
  const candidateSessionIds = candidates.map((c) => c.session_id);

  if (candidateSessionIds.length === 0) {
    db.prepare(
      `
        UPDATE chat_followup_tasks
        SET status = 'done',
            updated_at = CURRENT_TIMESTAMP
        WHERE store_id = ? AND status = 'open'
      `
    ).run(storeId);
  } else {
    const ph = candidateSessionIds.map(() => "?").join(", ");
    db.prepare(
      `
        UPDATE chat_followup_tasks
        SET status = 'done',
            updated_at = CURRENT_TIMESTAMP
        WHERE store_id = ?
          AND status = 'open'
          AND session_id NOT IN (${ph})
      `
    ).run(storeId, ...candidateSessionIds);
  }

  const selectTask = db.prepare(
    `SELECT id, status, last_customer_message_id FROM chat_followup_tasks WHERE store_id = ? AND session_id = ?`
  );
  const insertTask = db.prepare(
    `
      INSERT INTO chat_followup_tasks (store_id, session_id, status, last_customer_message_id, title)
      VALUES (?, ?, 'open', ?, ?)
    `
  );
  const reopenTask = db.prepare(
    `
      UPDATE chat_followup_tasks
      SET status = 'open',
          last_customer_message_id = ?,
          title = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `
  );

  for (const c of candidates) {
    const title = `آخر رسالة من العميل — تابع جلسة #${c.session_id}`;
    const row = selectTask.get(storeId, c.session_id);
    if (!row) {
      insertTask.run(storeId, c.session_id, c.last_customer_message_id, title);
    } else if (c.last_customer_message_id > row.last_customer_message_id) {
      reopenTask.run(c.last_customer_message_id, title, row.id);
    }
  }
}

/**
 * GET /api/stores/:storeId/followup-tasks
 */
function listFollowupTasks(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    syncFollowupTasksForStore(db, storeId);

    const rows = db
      .prepare(
        `
          SELECT
            t.id,
            t.store_id,
            t.session_id,
            t.status,
            t.last_customer_message_id,
            t.title,
            t.created_at,
            t.updated_at,
            cs.last_message_at,
            cs.owner_takeover,
            c.name AS customer_name,
            c.phone AS customer_phone,
            (
              SELECT substr(cm.message_text, 1, 160)
              FROM chat_messages cm
              WHERE cm.session_id = cs.id
              ORDER BY cm.id DESC
              LIMIT 1
            ) AS last_message_preview
          FROM chat_followup_tasks t
          INNER JOIN chat_sessions cs ON cs.id = t.session_id AND cs.store_id = t.store_id
          LEFT JOIN customers c ON c.id = cs.customer_id
          WHERE t.store_id = ? AND t.status = 'open'
          ORDER BY datetime(COALESCE(cs.last_message_at, cs.started_at)) DESC, t.id DESC
          LIMIT 80
        `
      )
      .all(storeId);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load follow-up tasks.",
      error: error.message,
    });
  }
}

/**
 * PATCH /api/stores/:storeId/followup-tasks/:taskId
 * Body: { status: "done" | "dismissed" }
 */
function patchFollowupTask(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const taskId = Number(req.params.taskId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(taskId) || taskId <= 0) {
      return res.status(400).json({ message: "taskId must be a valid positive number." });
    }

    const next = String(req.body?.status ?? "").trim().toLowerCase();
    if (next !== "done" && next !== "dismissed") {
      return res.status(400).json({ message: "status must be done or dismissed." });
    }

    const result = db
      .prepare(
        `
          UPDATE chat_followup_tasks
          SET status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND store_id = ?
        `
      )
      .run(next, taskId, storeId);

    if (result.changes === 0) {
      return res.status(404).json({ message: "Follow-up task not found." });
    }

    const row = db
      .prepare(
        `
          SELECT id, store_id, session_id, status, last_customer_message_id, title, created_at, updated_at
          FROM chat_followup_tasks
          WHERE id = ?
        `
      )
      .get(taskId);

    return res.status(200).json({ data: row });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update follow-up task.",
      error: error.message,
    });
  }
}

module.exports = {
  listFollowupTasks,
  patchFollowupTask,
  syncFollowupTasksForStore,
};
