const { db } = require("../../db/client");

const TRACKED_STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];

/**
 * @param {number} storeId
 */
function getOrderStatusCountsForStore(storeId) {
  const rows = db
    .prepare(
      `
        SELECT status, COUNT(*) AS count
        FROM orders
        WHERE store_id = ?
        GROUP BY status
      `
    )
    .all(storeId);

  /** @type {Record<string, number>} */
  const counts = {
    all: 0,
    new: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };

  for (const row of rows) {
    const status = String(row.status || "").trim();
    const n = Number(row.count) || 0;
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] = n;
    }
    counts.all += n;
  }

  return counts;
}

module.exports = {
  TRACKED_STATUSES,
  getOrderStatusCountsForStore,
};
