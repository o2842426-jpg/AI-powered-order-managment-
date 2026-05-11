const { db } = require("../../db/client");

function roundMoney2(v) {
  return Math.round(Number(v) * 100) / 100;
}

/** تواريخ آخر n أيام تقويمية (محاذاة لـ SQLite date('now')). */
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

/**
 * إيراد مجمّع حسب يوم / أسبوع ISO / شهر / سنة — عمودان: مكتمل (شحن/تسليم) مقابل قيد المعالجة (جديد/مؤكد).
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

/**
 * لوحة تحليلات خفيفة لنفس المتجر — بدون جداول جديدة، من الطلبات والجلسات والمخزون.
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

  const label = (row) =>
    [row.size || "—", row.color || "—"].filter(Boolean).join(" · ");

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

function getStoreSettings(req, res) {
  try {
    const storeId = Number(req.params.storeId);

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: "storeId must be a valid positive number.",
      });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const store = db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            phone,
            delivery_info,
            ai_prompt,
            logo_url,
            theme_color,
            accent_color,
            policy_text,
            created_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    if (!store) {
      return res.status(404).json({ message: "Store not found." });
    }

    return res.status(200).json({ data: store });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load store settings.",
      error: error.message,
    });
  }
}

function updateStoreSettings(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const {
      name,
      phone,
      delivery_info,
      ai_prompt,
      logo_url,
      theme_color,
      accent_color,
      policy_text,
    } = req.body;

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: "storeId must be a valid positive number.",
      });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const existingStore = db
      .prepare("SELECT id FROM stores WHERE id = ?")
      .get(storeId);

    if (!existingStore) {
      return res.status(404).json({ message: "Store not found." });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: "name is required." });
    }

    db.prepare(
      `
        UPDATE stores
        SET
          name = ?,
          phone = ?,
          delivery_info = ?,
          ai_prompt = ?,
          logo_url = ?,
          theme_color = ?,
          accent_color = ?,
          policy_text = ?
        WHERE id = ?
      `
    ).run(
      String(name).trim(),
      phone ? String(phone).trim() : null,
      delivery_info ? String(delivery_info).trim() : null,
      ai_prompt ? String(ai_prompt).trim() : null,
      logo_url ? String(logo_url).trim() : null,
      theme_color ? String(theme_color).trim() : null,
      accent_color ? String(accent_color).trim() : null,
      policy_text ? String(policy_text).trim() : null,
      storeId
    );

    const updatedStore = db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            phone,
            delivery_info,
            ai_prompt,
            logo_url,
            theme_color,
            accent_color,
            policy_text,
            created_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    return res.status(200).json({ data: updatedStore });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update store settings.",
      error: error.message,
    });
  }
}

function getStoreSummary(req, res) {
  try {
    const storeId = Number(req.params.storeId);

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: "storeId must be a valid positive number.",
      });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const productStats = db
      .prepare(
        `
          SELECT
            COUNT(*) AS total_products,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active_products
          FROM products
          WHERE store_id = ?
        `
      )
      .get(storeId);

    const newOrders = db
      .prepare("SELECT COUNT(*) AS count FROM orders WHERE store_id = ? AND status = 'new'")
      .get(storeId);

    const lowStock = db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE p.store_id = ? AND pv.stock_qty > 0 AND pv.stock_qty <= 3
        `
      )
      .get(storeId);

    const latestOrder = db
      .prepare(
        `
          SELECT
            o.id,
            o.status,
            o.total_amount,
            o.created_at,
            c.name AS customer_name
          FROM orders o
          LEFT JOIN customers c ON c.id = o.customer_id
          WHERE o.store_id = ?
          ORDER BY o.id DESC
          LIMIT 1
        `
      )
      .get(storeId);

    const analytics = computeStoreAnalytics(db, storeId);

    return res.status(200).json({
      data: {
        total_products: productStats.total_products || 0,
        active_products: productStats.active_products || 0,
        new_orders: newOrders.count || 0,
        low_stock_variants: lowStock.count || 0,
        latest_order: latestOrder || null,
        analytics,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load store summary.",
      error: error.message,
    });
  }
}

function getStoreLowStock(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const threshold = Math.max(0, Number(req.query.threshold ?? 3));

    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({
        message: "storeId must be a valid positive number.",
      });
    }
    if (req.user?.store_id !== storeId) {
      return res.status(403).json({ message: "Forbidden for this store." });
    }

    const rows = db
      .prepare(
        `
          SELECT
            pv.id,
            pv.product_id,
            pv.size,
            pv.color,
            pv.price,
            pv.stock_qty,
            pv.sku,
            pv.is_active,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.base_price AS product_base_price
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE p.store_id = ?
            AND p.is_active = 1
            AND pv.is_active = 1
            AND pv.stock_qty <= ?
          ORDER BY pv.stock_qty ASC, p.id DESC, pv.id DESC
        `
      )
      .all(storeId, threshold);

    return res.status(200).json({ data: rows });
  } catch (error) {
    return res.status(500).json({
      message: "Could not load low stock variants.",
      error: error.message,
    });
  }
}

module.exports = {
  getStoreLowStock,
  getStoreSettings,
  getStoreSummary,
  updateStoreSettings,
};
