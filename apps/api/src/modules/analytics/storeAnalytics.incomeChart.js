const {
  roundMoney2,
  sqlLastNDates,
  dualRevenueForDateBuckets,
  dualRevenueForStrBuckets,
  monthShortEn,
  narrowWeekdayLetter,
} = require("./storeAnalytics.helpers");

/**
 * Revenue buckets: day / ISO week / month / year — settled vs pipeline.
 */
function computeIncomeChart(db, storeId) {
  const dayDates = sqlLastNDates(db, 7);
  const day = dualRevenueForDateBuckets(db, storeId, dayDates).map((row) => ({
    ...row,
    label: narrowWeekdayLetter(row.key),
  }));

  const weekRows = db
    .prepare(
      `
        SELECT
          strftime('%G-%V', created_at) AS bucket,
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
          AND date(created_at) >= date('now', '-98 days')
        GROUP BY bucket
        ORDER BY bucket DESC
        LIMIT 7
      `
    )
    .all(storeId);
  const week = [...weekRows].reverse().map((r) => {
    const k = String(r.bucket);
    const wk = k.length > 2 ? k.slice(-2) : k;
    return {
      key: k,
      label: `W${wk}`,
      settled: roundMoney2(r.settled),
      pipeline: roundMoney2(r.pipeline),
    };
  });

  const monthKeys = db
    .prepare(
      `
        WITH RECURSIVE m(i) AS (
          SELECT 0 UNION ALL SELECT i + 1 FROM m WHERE i < 5
        )
        SELECT strftime(
          '%Y-%m',
          date('now', 'start of month', '-' || (5 - i) || ' months')
        ) AS bucket
        FROM m
        ORDER BY bucket ASC
      `
    )
    .all()
    .map((r) => r.bucket);
  const monthAgg = dualRevenueForStrBuckets(
    db,
    storeId,
    monthKeys,
    "strftime('%Y-%m', created_at)"
  );
  const month = monthAgg.map((row) => ({
    ...row,
    label: monthShortEn(row.key),
  }));

  const y0 = new Date().getFullYear();
  const yearKeys = [];
  for (let i = 4; i >= 0; i -= 1) {
    yearKeys.push(String(y0 - i));
  }
  const year = dualRevenueForStrBuckets(
    db,
    storeId,
    yearKeys,
    "strftime('%Y', created_at)"
  ).map((row) => ({
    ...row,
    label: row.key,
  }));

  return { day, week, month, year };
}

module.exports = { computeIncomeChart };
