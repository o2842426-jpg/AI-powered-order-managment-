const { db } = require("../../db/client");
const { assertStoreScope } = require("../stores/storeScope");
const {
  evaluateAiMessageQuota,
  incrementAiMessageUsage,
} = require("../plans/aiUsage");
const { generateManagerAiReply } = require("./managerAi.service");

/**
 * POST /api/stores/:storeId/manager-ai/chat
 * Body: { message: string, history?: { role, content }[] }
 */
async function postManagerAiChat(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    if (!assertStoreScope(req, res, storeId)) return;

    const store = db
      .prepare(
        `
          SELECT
            id,
            name,
            subscription_status,
            plan_tier,
            trial_ends_at,
            ai_messages_used,
            ai_messages_period_ym
          FROM stores
          WHERE id = ?
        `
      )
      .get(storeId);

    if (!store) {
      return res.status(404).json({ message: "Store not found." });
    }

    const quota = evaluateAiMessageQuota(store);
    if (!quota.ok) {
      return res.status(403).json({
        code: quota.code || "AI_QUOTA_EXCEEDED",
        message: quota.message || "تم استهلاك حصة رسائل الذكاء الاصطناعي لهذا الشهر.",
        used: quota.used,
        limit: quota.limit,
      });
    }

    const result = await generateManagerAiReply(store, {
      message: req.body?.message,
      history: req.body?.history,
    });

    if (!result.ok) {
      const status =
        result.code === "BAD_REQUEST"
          ? 400
          : result.code === "NOT_FOUND"
            ? 404
            : result.code === "AI_UNAVAILABLE"
              ? 503
              : 500;
      return res.status(status).json({
        code: result.code || "AI_ERROR",
        message: result.error || "تعذّر الرد.",
      });
    }

    incrementAiMessageUsage(storeId);
    console.info(`[manager-ai] reply store=${storeId} chars=${result.reply.length}`);

    return res.status(200).json({
      data: { reply: result.reply },
    });
  } catch (error) {
    console.error("[manager-ai] chat error:", error?.message || error);
    return res.status(500).json({
      message: "تعذّر معالجة رسالة مساعد المدير.",
      error: error.message,
    });
  }
}

module.exports = { postManagerAiChat };
