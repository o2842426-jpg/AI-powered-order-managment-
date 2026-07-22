const { db } = require("../../db/client");
const { computeStoreAnalytics } = require("../analytics/storeAnalytics.service");
const { getOrderStatusCountsForStore } = require("../orders/orders.statusCounts.service");
const { storeHasFeature, getStorePlanContext } = require("../plans/planEntitlements");
const {
  getAiMessageMonthlyLimit,
  normalizePlanTier,
} = require("../plans/planMatrix");

/**
 * Read-only live snapshot of a store for the Manager AI.
 * @param {number} storeId
 */
function buildManagerStoreSnapshot(storeId) {
  const store = db
    .prepare(
      `
        SELECT
          id,
          name,
          slug,
          currency_code,
          subscription_status,
          plan_tier,
          delivery_info,
          policy_text,
          ai_messages_used,
          ai_messages_period_ym
        FROM stores
        WHERE id = ?
      `
    )
    .get(storeId);

  if (!store) return null;

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
    .prepare(
      `SELECT COUNT(*) AS count FROM orders WHERE store_id = ? AND status = 'new' AND is_hidden = 0`
    )
    .get(storeId);

  const hiddenOrders = db
    .prepare(
      `SELECT COUNT(*) AS count FROM orders WHERE store_id = ? AND is_hidden = 1`
    )
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

  const recentOrders = db
    .prepare(
      `
        SELECT
          o.id,
          o.status,
          o.total_amount,
          o.is_hidden,
          o.created_at,
          c.name AS customer_name,
          c.phone AS customer_phone
        FROM orders o
        LEFT JOIN customers c ON c.id = o.customer_id
        WHERE o.store_id = ?
        ORDER BY o.id DESC
        LIMIT 8
      `
    )
    .all(storeId);

  const ig = db
    .prepare(
      `
        SELECT
          id,
          page_name,
          platform_instagram_id,
          status,
          webhook_subscribed,
          token_expires_at,
          connected_at,
          CASE
            WHEN access_token_enc IS NOT NULL AND length(access_token_enc) > 10 THEN 1
            ELSE 0
          END AS has_token
        FROM channel_connections
        WHERE store_id = ? AND platform = 'instagram'
        ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `
    )
    .get(storeId);

  const conversationStats = db
    .prepare(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_human_takeover = 1 THEN 1 ELSE 0 END) AS human_takeover,
          SUM(CASE WHEN owner_takeover = 1 THEN 1 ELSE 0 END) AS owner_takeover
        FROM channel_conversations
        WHERE store_id = ?
      `
    )
    .get(storeId);

  const orderStatusCounts = getOrderStatusCountsForStore(storeId);
  const analytics = computeStoreAnalytics(db, storeId, {
    advanced: storeHasFeature(storeId, "advanced_analytics"),
  });

  const { tier } = getStorePlanContext(storeId);
  const limit = getAiMessageMonthlyLimit(tier);
  const used = Number(store.ai_messages_used || 0);

  return {
    store: {
      id: store.id,
      name: store.name,
      slug: store.slug,
      currency_code: store.currency_code,
      subscription_status: store.subscription_status,
      plan_tier: normalizePlanTier(store.plan_tier),
      effective_tier: tier,
      delivery_info: store.delivery_info || null,
      policy_text: store.policy_text || null,
    },
    products: {
      total: Number(productStats?.total_products || 0),
      active: Number(productStats?.active_products || 0),
      low_stock_variants: Number(lowStock?.count || 0),
    },
    orders: {
      new_visible: Number(newOrders?.count || 0),
      hidden: Number(hiddenOrders?.count || 0),
      status_counts: orderStatusCounts,
      recent: recentOrders,
    },
    instagram: ig
      ? {
          connected: String(ig.status) === "active" && Number(ig.has_token) === 1,
          status: ig.status,
          page_name: ig.page_name || null,
          platform_instagram_id: ig.platform_instagram_id || null,
          webhook_subscribed: Number(ig.webhook_subscribed) === 1,
          has_token: Number(ig.has_token) === 1,
          token_expires_at: ig.token_expires_at || null,
          connected_at: ig.connected_at || null,
        }
      : {
          connected: false,
          status: "none",
          page_name: null,
          has_token: false,
        },
    conversations: {
      total: Number(conversationStats?.total || 0),
      needing_human: Number(conversationStats?.human_takeover || 0),
      owner_takeover: Number(conversationStats?.owner_takeover || 0),
    },
    ai_usage: {
      used,
      limit,
      period_ym: store.ai_messages_period_ym || null,
      remaining: limit == null ? null : Math.max(0, limit - used),
    },
    analytics: {
      level: analytics?.level || "basic",
      summary: analytics || null,
    },
    features: {
      owner_manager_ai: storeHasFeature(storeId, "owner_manager_ai"),
      conversations_dashboard: storeHasFeature(storeId, "conversations_dashboard"),
      clothing_sales_engine: storeHasFeature(storeId, "clothing_sales_engine"),
      human_takeover: storeHasFeature(storeId, "human_takeover"),
    },
  };
}

/**
 * Compact text block for the LLM (avoid dumping huge objects).
 * @param {object} snapshot
 */
function formatSnapshotForPrompt(snapshot) {
  if (!snapshot) return "لا تتوفر لقطة بيانات للمتجر.";
  return JSON.stringify(snapshot, null, 2);
}

module.exports = {
  buildManagerStoreSnapshot,
  formatSnapshotForPrompt,
};
