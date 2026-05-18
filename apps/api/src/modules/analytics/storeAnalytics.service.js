/**
 * Store analytics from real SQL (orders, chat_sessions, inventory).
 * Split: helpers → storeAnalytics.helpers.js, income charts → storeAnalytics.incomeChart.js.
 */

const { roundMoney2 } = require("./storeAnalytics.helpers");
const { computeIncomeChart } = require("./storeAnalytics.incomeChart");

/**
 * Light analytics bundle for the store — no extra tables, from orders/sessions/inventory.
 */
function computeStoreAnalytics(db, storeId) {
  const lifetime = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(total_amount), 0) AS revenue,
          COUNT(DISTINCT customer_id) AS customers
        FROM orders
        WHERE store_id = ?
          AND status != 'cancelled'
      `
    )
    .get(storeId);

  const customers = Number(lifetime.customers) || 0;
  const revenue = Number(lifetime.revenue) || 0;
  const clvAvg = customers > 0 ? revenue / customers : 0;

  const retention = db
    .prepare(
      `
        WITH o30 AS (
          SELECT customer_id, COUNT(*) AS c
          FROM orders
          WHERE store_id = ?
            AND status != 'cancelled'
            AND datetime(created_at) >= datetime('now', '-30 days')
          GROUP BY customer_id
        )
        SELECT
          COUNT(*) AS ordering_customers_30d,
          SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) AS repeat_customers_30d
        FROM o30
      `
    )
    .get(storeId);

  const ord30 = Number(retention.ordering_customers_30d) || 0;
  const rep30 = Number(retention.repeat_customers_30d) || 0;
  const retentionRate = ord30 > 0 ? (rep30 / ord30) * 100 : null;

  const sessionAgg = db
    .prepare(
      `
        SELECT
          SUM(
            CASE
              WHEN cs.customer_id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM chat_messages m
                  WHERE m.session_id = cs.id AND m.sender_type = 'customer'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM orders o
                  WHERE o.store_id = cs.store_id
                    AND o.customer_id = cs.customer_id
                    AND o.status != 'cancelled'
                    AND datetime(o.created_at) >= datetime(cs.started_at)
                )
              THEN 1 ELSE 0 END
          ) AS abandoned,
          SUM(
            CASE
              WHEN cs.customer_id IS NOT NULL
                AND EXISTS (
                  SELECT 1 FROM chat_messages m
                  WHERE m.session_id = cs.id AND m.sender_type = 'customer'
                )
              THEN 1 ELSE 0 END
          ) AS engaged
        FROM chat_sessions cs
        WHERE cs.store_id = ?
          AND datetime(cs.started_at) >= datetime('now', '-30 days')
      `
    )
    .get(storeId);

  const abandoned = Number(sessionAgg.abandoned) || 0;
  const engaged = Number(sessionAgg.engaged) || 0;
  const abandonmentRate = engaged > 0 ? (abandoned / engaged) * 100 : null;

  const variantVelocity = db
    .prepare(
      `
        SELECT
          p.name AS product_name,
          pv.id AS variant_id,
          pv.size,
          pv.color,
          pv.stock_qty,
          COALESCE(SUM(oi.qty), 0) AS sold_30d
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        LEFT JOIN order_items oi ON oi.variant_id = pv.id
        LEFT JOIN orders o ON o.id = oi.order_id
          AND o.store_id = p.store_id
          AND o.status != 'cancelled'
          AND datetime(o.created_at) >= datetime('now', '-30 days')
        WHERE p.store_id = ?
          AND p.is_active = 1
          AND pv.is_active = 1
        GROUP BY pv.id
        HAVING pv.stock_qty > 0
      `
    )
    .all(storeId);

  const label = (row) => {
    const parts = [row.size, row.color]
      .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
      .filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  };

  const slowMovers = variantVelocity
    .filter((r) => Number(r.sold_30d) <= 1 && Number(r.stock_qty) >= 8)
    .sort(
      (a, b) =>
        Number(a.sold_30d) - Number(b.sold_30d) ||
        Number(b.stock_qty) - Number(a.stock_qty)
    )
    .slice(0, 5)
    .map((r) => ({
      product_name: r.product_name,
      variant_label: label(r),
      sold_30d: Number(r.sold_30d),
      stock_qty: Number(r.stock_qty),
    }));

  const fastMovers = variantVelocity
    .filter(
      (r) =>
        Number(r.sold_30d) >= 3 ||
        (Number(r.sold_30d) >= 1 && Number(r.stock_qty) <= 4)
    )
    .sort((a, b) => Number(b.sold_30d) - Number(a.sold_30d))
    .slice(0, 5)
    .map((r) => ({
      product_name: r.product_name,
      variant_label: label(r),
      sold_30d: Number(r.sold_30d),
      stock_qty: Number(r.stock_qty),
    }));

  const monthlyRows = db
    .prepare(
      `
        SELECT
          strftime('%Y-%m', created_at) AS ym,
          SUM(total_amount) AS revenue
        FROM orders
        WHERE store_id = ?
          AND status != 'cancelled'
        GROUP BY ym
        ORDER BY ym DESC
        LIMIT 6
      `
    )
    .all(storeId);

  const seriesAsc = [...monthlyRows].reverse();
  const revenues = seriesAsc.map((r) => Number(r.revenue) || 0);
  const n = revenues.length;
  let nextMonthExpected = null;
  let trendSlopePerMonth = null;
  if (n >= 2) {
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    for (let i = 0; i < n; i += 1) {
      const x = i;
      const y = revenues[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      const b = (n * sumXY - sumX * sumY) / denom;
      const a = (sumY - b * sumX) / n;
      trendSlopePerMonth = b;
      nextMonthExpected = Math.max(0, a + b * n);
    }
  }

  return {
    clv: {
      avg_revenue_per_customer: Math.round(clvAvg * 100) / 100,
      ordering_customers: customers,
      lifetime_revenue: Math.round(revenue * 100) / 100,
    },
    retention_30d: {
      rate_percent:
        retentionRate == null ? null : Math.round(retentionRate * 10) / 10,
      ordering_customers_30d: ord30,
      repeat_customers_30d: rep30,
    },
    cart_abandonment: {
      rate_percent:
        abandonmentRate == null
          ? null
          : Math.round(abandonmentRate * 10) / 10,
      abandoned_sessions: abandoned,
      engaged_sessions: engaged,
    },
    inventory_turnover: {
      slow_movers: slowMovers,
      fast_movers: fastMovers,
    },
    sales_forecast: {
      next_month_expected:
        nextMonthExpected == null
          ? null
          : Math.round(nextMonthExpected * 100) / 100,
      trend_slope_per_month:
        trendSlopePerMonth == null
          ? null
          : Math.round(trendSlopePerMonth * 100) / 100,
      monthly_series: seriesAsc.map((r) => ({
        month: r.ym,
        revenue: Math.round((Number(r.revenue) || 0) * 100) / 100,
      })),
      method: "linear_regression",
    },
    income_chart: computeIncomeChart(db, storeId),
  };
}

module.exports = { computeStoreAnalytics };
