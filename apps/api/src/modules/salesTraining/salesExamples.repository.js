const { db } = require("../../db/client");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * @param {number} storeId
 * @param {{ limit?: number, category?: string }} [opts]
 */
function listSalesExamplesForStore(storeId, opts = {}) {
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(opts.limit) || DEFAULT_LIMIT));
  const category = opts.category != null ? String(opts.category).trim() : "";

  if (category) {
    return db
      .prepare(
        `
          SELECT id, store_id, category, user_input, ideal_response, created_at
          FROM sales_examples
          WHERE store_id = ? AND category = ?
          ORDER BY id DESC
          LIMIT ?
        `
      )
      .all(storeId, category, limit);
  }

  return db
    .prepare(
      `
        SELECT id, store_id, category, user_input, ideal_response, created_at
        FROM sales_examples
        WHERE store_id = ?
        ORDER BY id DESC
        LIMIT ?
      `
    )
    .all(storeId, limit);
}

/**
 * @param {{
 *   storeId: number,
 *   category: string,
 *   userInput: string,
 *   idealResponse: string
 * }} input
 */
function insertSalesExample({ storeId, category, userInput, idealResponse }) {
  const result = db
    .prepare(
      `
        INSERT INTO sales_examples (store_id, category, user_input, ideal_response)
        VALUES (?, ?, ?, ?)
      `
    )
    .run(storeId, category, userInput, idealResponse);

  return (
    db
      .prepare(
        `
          SELECT id, store_id, category, user_input, ideal_response, created_at
          FROM sales_examples
          WHERE id = ?
        `
      )
      .get(result.lastInsertRowid) || null
  );
}

module.exports = {
  listSalesExamplesForStore,
  insertSalesExample,
  DEFAULT_LIMIT,
  MAX_LIMIT,
};
