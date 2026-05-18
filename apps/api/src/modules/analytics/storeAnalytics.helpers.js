/**
 * Small helpers for store analytics SQL + formatting.
 */

function roundMoney2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/** Last n calendar dates aligned to SQLite date('now'). */
function sqlLastNDates(db, n) {
  const safeN = Math.min(Math.max(Number(n) || 0, 1), 31);
  return db
    .prepare(
      `
        WITH RECURSIVE seq(x) AS (
          SELECT 0 UNION ALL SELECT x + 1 FROM seq WHERE x + 1 < ?
        )
        SELECT date('now', '-' || (? - 1 - x) || ' days') AS d
        FROM seq
        ORDER BY d ASC
      `
    )
    .all(safeN, safeN)
    .map((r) => r.d);
}

function dualRevenueForDateBuckets(db, storeId, buckets) {
  if (!buckets.length) return [];
  const placeholders = buckets.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT
          date(created_at) AS bucket,
          SUM(
            CASE
              WHEN status IN ('delivered', 'shipped') THEN total_amount
              ELSE 0
            END
          ) AS settled,
          SUM(
            CASE
              WHEN status IN ('new', 'confirmed') THEN total_amount
              ELSE 0
            END
          ) AS pipeline
        FROM orders
        WHERE store_id = ?
          AND status != 'cancelled'
          AND date(created_at) IN (${placeholders})
        GROUP BY date(created_at)
      `
    )
    .all(storeId, ...buckets);
  const map = new Map(
    rows.map((r) => [
      r.bucket,
      { settled: Number(r.settled) || 0, pipeline: Number(r.pipeline) || 0 },
    ])
  );
  return buckets.map((d) => ({
    key: d,
    settled: roundMoney2(map.get(d)?.settled ?? 0),
    pipeline: roundMoney2(map.get(d)?.pipeline ?? 0),
  }));
}

function dualRevenueForStrBuckets(db, storeId, buckets, strftimeExpr) {
  if (!buckets.length) return [];
  const placeholders = buckets.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
        SELECT
          ${strftimeExpr} AS bucket,
          SUM(
            CASE
              WHEN status IN ('delivered', 'shipped') THEN total_amount
              ELSE 0
            END
          ) AS settled,
          SUM(
            CASE
              WHEN status IN ('new', 'confirmed') THEN total_amount
              ELSE 0
            END
          ) AS pipeline
        FROM orders
        WHERE store_id = ?
          AND status != 'cancelled'
          AND ${strftimeExpr} IN (${placeholders})
        GROUP BY ${strftimeExpr}
      `
    )
    .all(storeId, ...buckets);
  const map = new Map(
    rows.map((r) => [
      String(r.bucket),
      { settled: Number(r.settled) || 0, pipeline: Number(r.pipeline) || 0 },
    ])
  );
  return buckets.map((k) => ({
    key: k,
    settled: roundMoney2(map.get(String(k))?.settled ?? 0),
    pipeline: roundMoney2(map.get(String(k))?.pipeline ?? 0),
  }));
}

function monthShortEn(ym) {
  const p = String(ym).split("-");
  const y = Number(p[0]);
  const m = Number(p[1]) || 1;
  if (!Number.isFinite(y)) return String(ym);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function narrowWeekdayLetter(sqlDate) {
  const d = new Date(`${sqlDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "?";
  return ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
}

module.exports = {
  roundMoney2,
  sqlLastNDates,
  dualRevenueForDateBuckets,
  dualRevenueForStrBuckets,
  monthShortEn,
  narrowWeekdayLetter,
};
