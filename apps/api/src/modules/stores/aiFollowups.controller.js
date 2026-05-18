const { db } = require("../../db/client");
const { assertStoreScope } = require("./storeScope");

/**
 * GET /api/stores/:storeId/ai-followups
 */
function listStoreAiFollowups(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const rows = db
      .prepare(
        `
          SELECT id, store_id, followup_text, sort_order, created_at
          FROM store_ai_followups
          WHERE store_id = ?
          ORDER BY sort_order ASC, id ASC
          LIMIT 40
        `
      )
      .all(storeId);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load AI follow-ups.",
      error: error.message,
    });
  }
}

/**
 * POST /api/stores/:storeId/ai-followups
 * Body: { followup_text: string, sort_order?: number }
 */
function createStoreAiFollowup(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const followupText = String(req.body?.followup_text ?? "").trim();
    if (!followupText) {
      return res.status(400).json({ message: "followup_text is required." });
    }
    if (followupText.length > 1200) {
      return res.status(400).json({ message: "followup_text must be at most 1200 characters." });
    }

    const countRow = db
      .prepare(`SELECT COUNT(*) AS c FROM store_ai_followups WHERE store_id = ?`)
      .get(storeId);
    if (Number(countRow?.c) >= 40) {
      return res.status(400).json({ message: "Maximum 40 follow-up lines per store." });
    }

    const sortOrder = Number.isFinite(Number(req.body?.sort_order))
      ? Math.trunc(Number(req.body.sort_order))
      : 0;

    const result = db
      .prepare(
        `
          INSERT INTO store_ai_followups (store_id, followup_text, sort_order)
          VALUES (?, ?, ?)
        `
      )
      .run(storeId, followupText, sortOrder);

    const row = db
      .prepare(
        `
          SELECT id, store_id, followup_text, sort_order, created_at
          FROM store_ai_followups
          WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: row });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create AI follow-up.",
      error: error.message,
    });
  }
}

/**
 * DELETE /api/stores/:storeId/ai-followups/:followupId
 */
function deleteStoreAiFollowup(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const followupId = Number(req.params.followupId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(followupId) || followupId <= 0) {
      return res.status(400).json({ message: "followupId must be a valid positive number." });
    }

    const result = db
      .prepare(
        `
          DELETE FROM store_ai_followups
          WHERE id = ? AND store_id = ?
        `
      )
      .run(followupId, storeId);

    if (result.changes === 0) {
      return res.status(404).json({ message: "AI follow-up not found." });
    }

    return res.sendStatus(204);
  } catch (error) {
    return res.status(500).json({
      message: "Could not delete AI follow-up.",
      error: error.message,
    });
  }
}

module.exports = {
  listStoreAiFollowups,
  createStoreAiFollowup,
  deleteStoreAiFollowup,
};
