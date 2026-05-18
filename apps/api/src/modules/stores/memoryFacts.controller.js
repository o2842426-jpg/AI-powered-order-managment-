const { db } = require("../../db/client");
const { assertStoreScope } = require("./storeScope");

/**
 * GET /api/stores/:storeId/memory-facts
 */
function listStoreMemoryFacts(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const rows = db
      .prepare(
        `
          SELECT id, store_id, fact_text, sort_order, created_at
          FROM store_memory_facts
          WHERE store_id = ?
          ORDER BY sort_order ASC, id ASC
          LIMIT 100
        `
      )
      .all(storeId);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load memory facts.",
      error: error.message,
    });
  }
}

/**
 * POST /api/stores/:storeId/memory-facts
 * Body: { fact_text: string, sort_order?: number }
 */
function createStoreMemoryFact(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const factText = String(req.body?.fact_text ?? "").trim();
    if (!factText) {
      return res.status(400).json({ message: "fact_text is required." });
    }
    if (factText.length > 2000) {
      return res.status(400).json({ message: "fact_text must be at most 2000 characters." });
    }

    const sortOrder = Number.isFinite(Number(req.body?.sort_order))
      ? Math.trunc(Number(req.body.sort_order))
      : 0;

    const result = db
      .prepare(
        `
          INSERT INTO store_memory_facts (store_id, fact_text, sort_order)
          VALUES (?, ?, ?)
        `
      )
      .run(storeId, factText, sortOrder);

    const row = db
      .prepare(
        `
          SELECT id, store_id, fact_text, sort_order, created_at
          FROM store_memory_facts
          WHERE id = ?
        `
      )
      .get(result.lastInsertRowid);

    return res.status(201).json({ data: row });
  } catch (error) {
    return res.status(500).json({
      message: "Could not create memory fact.",
      error: error.message,
    });
  }
}

/**
 * DELETE /api/stores/:storeId/memory-facts/:factId
 */
function deleteStoreMemoryFact(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const factId = Number(req.params.factId);
    if (!assertStoreScope(req, res, storeId)) return;

    if (Number.isNaN(factId) || factId <= 0) {
      return res.status(400).json({ message: "factId must be a valid positive number." });
    }

    const result = db
      .prepare(
        `
          DELETE FROM store_memory_facts
          WHERE id = ? AND store_id = ?
        `
      )
      .run(factId, storeId);

    if (result.changes === 0) {
      return res.status(404).json({ message: "Memory fact not found." });
    }

    return res.sendStatus(204);
  } catch (error) {
    return res.status(500).json({
      message: "Could not delete memory fact.",
      error: error.message,
    });
  }
}

module.exports = {
  listStoreMemoryFacts,
  createStoreMemoryFact,
  deleteStoreMemoryFact,
};
