const { db } = require("../../db/client");

const ALLOWED_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trial",
  "suspended",
  "trialing",
  "past_due",
  "unpaid",
]);

function listStores(req, res) {
  try {
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(200, Math.floor(limitRaw)) : 50;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0;

    const stores = db
      .prepare(
        `
          SELECT
            s.id,
            s.name,
            s.slug,
            s.phone,
            s.subscription_status,
            s.trial_started_at,
            s.trial_ends_at,
            s.subscription_current_period_end,
            s.stripe_customer_id,
            s.stripe_subscription_id,
            s.created_at,
            (
              SELECT u.email
              FROM users u
              WHERE u.store_id = s.id
              ORDER BY u.id ASC
              LIMIT 1
            ) AS owner_email
          FROM stores s
          ORDER BY s.id DESC
          LIMIT ? OFFSET ?
        `
      )
      .all(limit, offset);

    const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM stores`).get();

    return res.status(200).json({
      data: {
        stores,
        limit,
        offset,
        total: Number(totalRow?.c) || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not list stores.",
      error: error.message,
    });
  }
}

function patchStore(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (Number.isNaN(storeId) || storeId <= 0) {
      return res.status(400).json({ message: "storeId must be a positive number." });
    }

    const row = db
      .prepare(
        `
          SELECT
            id,
            subscription_status,
            trial_started_at,
            trial_ends_at,
            stripe_customer_id,
            stripe_subscription_id
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    if (!row) {
      return res.status(404).json({ message: "Store not found." });
    }

    const body = req.body || {};
    let nextStatus = String(row.subscription_status || "active").toLowerCase();
    if (body.subscription_status != null && String(body.subscription_status).trim() !== "") {
      const candidate = String(body.subscription_status).trim().toLowerCase();
      if (!ALLOWED_SUBSCRIPTION_STATUSES.has(candidate)) {
        return res.status(400).json({
          message: `subscription_status must be one of: ${[...ALLOWED_SUBSCRIPTION_STATUSES].join(", ")}`,
        });
      }
      nextStatus = candidate;
    }

    let trialStartedAt = row.trial_started_at;
    let trialEndsAt = row.trial_ends_at;
    if (nextStatus === "trial" && (trialStartedAt == null || String(trialStartedAt).trim() === "")) {
      trialStartedAt = new Date().toISOString();
    }

    if (body.trial_ends_at != null && String(body.trial_ends_at).trim() !== "") {
      const parsed = Date.parse(String(body.trial_ends_at).trim());
      if (Number.isNaN(parsed)) {
        return res.status(400).json({ message: "trial_ends_at must be a valid ISO date string." });
      }
      trialEndsAt = new Date(parsed).toISOString();
    }

    const extendDays = Number(body.extend_trial_days);
    if (body.extend_trial_days != null && body.extend_trial_days !== "") {
      if (!Number.isFinite(extendDays) || extendDays <= 0 || extendDays > 365) {
        return res.status(400).json({ message: "extend_trial_days must be between 1 and 365." });
      }
      const currentEnd = trialEndsAt != null && String(trialEndsAt).trim() !== "" ? Date.parse(trialEndsAt) : NaN;
      const baseMs = !Number.isNaN(currentEnd) ? Math.max(Date.now(), currentEnd) : Date.now();
      const d = new Date(baseMs);
      d.setUTCDate(d.getUTCDate() + Math.floor(extendDays));
      trialEndsAt = d.toISOString();
    }

    let stripeCustomerId = row.stripe_customer_id;
    let stripeSubscriptionId = row.stripe_subscription_id;
    if (body.clear_stripe === true) {
      stripeCustomerId = null;
      stripeSubscriptionId = null;
    }

    db.prepare(
      `
        UPDATE stores
        SET
          subscription_status = ?,
          trial_started_at = ?,
          trial_ends_at = ?,
          stripe_customer_id = ?,
          stripe_subscription_id = ?
        WHERE id = ?
      `
    ).run(
      nextStatus,
      trialStartedAt ?? null,
      trialEndsAt ?? null,
      stripeCustomerId,
      stripeSubscriptionId,
      storeId
    );

    const updated = db
      .prepare(
        `
          SELECT
            id,
            name,
            slug,
            subscription_status,
            trial_started_at,
            trial_ends_at,
            subscription_current_period_end,
            stripe_customer_id,
            stripe_subscription_id,
            created_at
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    return res.status(200).json({ data: updated });
  } catch (error) {
    return res.status(500).json({
      message: "Could not update store.",
      error: error.message,
    });
  }
}

module.exports = { listStores, patchStore };
