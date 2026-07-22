const OpenAI = require("openai");
const { SHOPIQ_MANAGER_KNOWLEDGE } = require("./managerAi.knowledge");
const {
  buildManagerStoreSnapshot,
  formatSnapshotForPrompt,
} = require("./managerAi.context");
const { resolveChatModel } = require("../ai/ai.service");

const FALLBACK_REPLY =
  "تعذّر الرد الآن. حاول مرة أخرى بعد لحظات، أو راجع لوحة التحكم مباشرة.";

const MAX_HISTORY = 10;
const MAX_MESSAGE_CHARS = 2000;

/**
 * @param {unknown} history
 * @returns {{ role: "user" | "assistant", content: string }[]}
 */
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const item of history.slice(-MAX_HISTORY)) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null;
    const content = String(item?.content || "").trim();
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  return out;
}

/**
 * @param {object} storeRow — stores row (at least id, name)
 * @param {{ message: string, history?: unknown }} input
 * @returns {Promise<{ ok: true, reply: string } | { ok: false, error: string, code?: string }>}
 */
async function generateManagerAiReply(storeRow, input) {
  const message = String(input?.message || "").trim().slice(0, MAX_MESSAGE_CHARS);
  if (!message) {
    return { ok: false, error: "message is required", code: "BAD_REQUEST" };
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, error: "AI is not configured", code: "AI_UNAVAILABLE" };
  }

  const snapshot = buildManagerStoreSnapshot(Number(storeRow.id));
  if (!snapshot) {
    return { ok: false, error: "Store not found", code: "NOT_FOUND" };
  }

  const systemPrompt = `
أنت «مساعد المدير» داخل لوحة تحكم ShopIQ لمتجر "${storeRow.name || snapshot.store.name}".
أنت تساعد **مالك المتجر / المدير** فقط — لست بوت مبيعات للزبائن، ولا تتكلم بأسلوب مندوب المبيعات للعملاء.

## قواعد صارمة
1. اشرح وشخّص فقط. **ممنوع** الادعاء أنك عدّلت طلباً أو منتجاً أو إعداداً أو ربط إنستغرام.
2. اعتمد فقط على «دليل المنتج» و«لقطة بيانات المتجر» أدناه. لا تخترع أرقام طلبات أو إيرادات أو حالات.
3. إذا نقصت معلومة: قل ذلك بصراحة ووجّه المدير للشاشة الصحيحة (الطلبات / المحادثات / الإعدادات / المنتجات).
4. أجب بالعربية بلهجة واضحة ومباشرة. كن مختصراً وعملياً (خطوات رقمية عند الحاجة).
5. فرّق دائماً بين «مساعد AI» في القائمة (إعدادات بوت الزبائن) وبينك (مساعد المدير).

## دليل المنتج
${SHOPIQ_MANAGER_KNOWLEDGE}

## لقطة بيانات المتجر الحية (JSON — مصدر الحقيقة للعمليات)
${formatSnapshotForPrompt(snapshot)}
`.trim();

  const history = normalizeHistory(input.history);
  const model = resolveChatModel(storeRow);

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      temperature: 0.35,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ],
    });

    const reply = String(response.choices[0]?.message?.content || "").trim();
    if (!reply) {
      return { ok: true, reply: FALLBACK_REPLY };
    }
    return { ok: true, reply };
  } catch (err) {
    console.error("[manager-ai] OpenAI failed:", err?.message || err);
    return { ok: false, error: err?.message || "AI request failed", code: "AI_ERROR" };
  }
}

module.exports = {
  generateManagerAiReply,
  normalizeHistory,
  FALLBACK_REPLY,
};
