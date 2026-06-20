const OpenAI = require("openai");

const FALLBACK_REPLY = "تم استلام رسالتك، وسيتم الرد قريبًا.";
const MAX_HISTORY_MESSAGES = 8;
const MAX_RECOMMENDED_IDS = 6;

function normalizeCatalogCurrency(code) {
  const c = String(code ?? "SAR")
    .trim()
    .toUpperCase();
  if (c === "SAR" || c === "IQD" || c === "USD") return c;
  return "SAR";
}

function formatCatalogMoney(amount, currencyCode) {
  const code = normalizeCatalogCurrency(currencyCode);
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  if (code === "IQD") {
    return `${Math.round(n).toLocaleString("en-US")} د.ع`;
  }
  if (code === "USD") {
    return `${n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  }
  return `${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ر.س`;
}

function buildCatalogText(products, currencyCode) {
  const cur = normalizeCatalogCurrency(currencyCode);
  if (!products.length) {
    return "لا توجد منتجات نشطة لهذا المتجر حاليًا.";
  }

  return products
    .map((product) => {
      const productId = Number(product.id);
      const variantsText = product.variants.length
        ? product.variants
            .map((variant) => {
              const vid = Number(variant.id);
              const price = variant.price ?? product.base_price;
              const optParts = [variant.size, variant.color]
                .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
                .filter(Boolean);
              const optLabel = optParts.length ? optParts.join(" · ") : "افتراضي";
              return `  - variant_id: ${vid} | المواصفات: ${optLabel} | السعر: ${formatCatalogMoney(price, cur)} | المخزون: ${variant.stock_qty}`;
            })
            .join("\n")
        : "  - لا توجد خيارات مسجلة — يُعرض المنتج بالسعر الأساسي فقط.";

      const desc = product.description
        ? String(product.description).trim().slice(0, 400)
        : "لا يوجد وصف";

      return `منتج:
- product_id (استخدم هذا الرقم حرفيًا في recommended_product_ids): ${productId}
- الاسم: ${product.name}
- وصف مختصر: ${desc}
- السعر الأساسي: ${formatCatalogMoney(product.base_price, cur)}
- العملة المعتمدة للمتجر: ${cur}
- الخيارات (variants):
${variantsText}`;
    })
    .join("\n\n---\n\n");
}

function buildConversationMessages(conversationMessages, messageText) {
  const safeHistory = Array.isArray(conversationMessages)
    ? conversationMessages.slice(-MAX_HISTORY_MESSAGES)
    : [];

  if (!safeHistory.length) {
    return [
      {
        role: "user",
        content: messageText,
      },
    ];
  }

  return safeHistory.map((message) => ({
    role: message.sender_type === "ai" ? "assistant" : "user",
    content: message.message_text,
  }));
}

function buildChannelContextBlock(channelContext) {
  if (channelContext === "instagram_dm") {
    return `
قناة المحادثة: Instagram DM (داخل التطبيق فقط).
- لا تطلب من العميل زيارة الموقع أو متجر ويب ولا ترسل روابط خارجية.
- عند طلب صور/صورة/شكل المنتج أو عند اقتراح منتجات للعرض، ضع معرفاتها في recommended_product_ids — النظام يرسل الصور تلقائيًا في المحادثة.
- لا تقل أن الصورة «في الرابط» أو «على الموقع»؛ قل أن الصور ستظهر في المحادثة أو أنك ترسلها الآن.
`.trim();
  }
  return "";
}

function buildOwnerPrompt(store) {
  const prompt = String(store.ai_prompt || "").trim();
  if (!prompt) {
    return "لا توجد تعليمات إضافية من صاحب المتجر.";
  }

  return prompt;
}


/** @param {{ fact_text?: string }[]} facts */
function buildMemoryFactsBlock(facts) {
  if (!Array.isArray(facts) || facts.length === 0) return "";
  const lines = facts
    .map((f) => String(f?.fact_text ?? "").trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const numbered = lines.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `\n\nحقائق تشغيلية من المالك (استخدمها لاتساق الردود مع العملاء؛ لا تخالف كتالوج المنتجات ولا تخترع أسعارًا أو توفرًا):\n${numbered}`;
}

/** @param {{ followup_text?: string }[]} rows */
function buildFollowupsBlock(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const lines = rows
    .map((r) => String(r?.followup_text ?? "").trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const numbered = lines.map((t, i) => `${i + 1}. ${t}`).join("\n");
  return `\n\nعبارات متابعة من المالك (استخدمها بحذر وطبيعية — فقط عندما يناسب سياق المحادثة؛ لا تكررها في كل رد ولا تدمج أكثر من فكرة خفيفة واحدة عندما يكون ذلك ملائمًا؛ لا تخالف الكتالوج):\n${numbered}`;
}

/**
 * @param {string} raw
 * @param {Set<number>} allowedProductIds
 * @returns {{ reply: string, recommended_product_ids: number[] }}
 */
function parseAiChatEnvelope(raw, allowedProductIds) {
  const text = String(raw || "").trim();
  if (!text) {
    return { reply: FALLBACK_REPLY, recommended_product_ids: [] };
  }

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  let obj = tryParse(text);
  if (!obj || typeof obj !== "object") {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) {
      obj = tryParse(fence[1].trim());
    }
  }

  if (!obj || typeof obj !== "object") {
    return { reply: text, recommended_product_ids: [] };
  }

  const reply =
    typeof obj.reply === "string" && obj.reply.trim() ? obj.reply.trim() : text;

  const rawIds = Array.isArray(obj.recommended_product_ids)
    ? obj.recommended_product_ids
    : [];

  const sanitized = [];
  for (const id of rawIds) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) continue;
    if (!allowedProductIds.has(n)) continue;
    if (sanitized.includes(n)) continue;
    sanitized.push(n);
    if (sanitized.length >= MAX_RECOMMENDED_IDS) break;
  }

  return { reply, recommended_product_ids: sanitized };
}

/**
 * Paid Stripe statuses use OPENAI_MODEL_PAID (fallback OPENAI_MODEL).
 * Trial / other statuses use OPENAI_MODEL_ECONOMY (fallback OPENAI_MODEL or gpt-4o-mini).
 * @param {{ subscription_status?: string | null }} store
 */
function resolveChatModel(store) {
  const status = String(store?.subscription_status || "active").toLowerCase();
  const paidModel = String(process.env.OPENAI_MODEL_PAID || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  const economyModel = String(process.env.OPENAI_MODEL_ECONOMY || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
  if (status === "active" || status === "trialing") {
    return paidModel;
  }
  return economyModel;
}

/**
 * @returns {Promise<{ reply: string, recommended_product_ids: number[] }>}
 */
async function generateStoreChatReply({
  store,
  products,
  messageText,
  conversationMessages,
  memoryFacts,
  followups = [],
  channelContext = null,
}) {
  const allowedProductIds = new Set(
    (products || []).map((p) => Number(p.id)).filter((n) => Number.isInteger(n) && n > 0)
  );

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { reply: FALLBACK_REPLY, recommended_product_ids: [] };
  }

  const catalogText = buildCatalogText(products, store?.currency_code);
  const ownerPrompt = buildOwnerPrompt(store);
  const memoryBlock = buildMemoryFactsBlock(memoryFacts);
  const followupsBlock = buildFollowupsBlock(followups);
  const channelBlock = buildChannelContextBlock(channelContext);
  const historyMessages = buildConversationMessages(
    conversationMessages,
    messageText
  );

  const model = resolveChatModel(store);
  const tempRaw = process.env.OPENAI_TEMPERATURE;
  let temperature = 0.65;
  if (tempRaw !== undefined && String(tempRaw).trim() !== "") {
    const n = Number(tempRaw);
    if (!Number.isNaN(n)) {
      temperature = Math.min(2, Math.max(0, n));
    }
  }

  const jsonInstructions = `
أجب دائمًا بجسم JSON صالح فقط (بدون نص خارج JSON)، بالشكل التالي بالضبط:
{
  "reply": "نص عربي طبيعي للعميل",
  "recommended_product_ids": []
}

قواعد recommended_product_ids (مهم جدًا):
- ضع في المصفوفة فقط أرقام product_id موجودة حرفيًا في كتالوج «بيانات المتجر والمنتجات» أدناه. لا تخترع رقمًا.
- إذا لم يكن هناك منتج مناسب، اترك المصفوفة [] ولا تدّعي وجود منتج.
- املأ المصفوفة فقط عندما يكون العميل يريد رؤية منتجات في الواجهة (اقتراح، توفر، مقارنة خفيفة، «شنو عندكم»، «عرّفني»، «وش تنصح»، طلب صور/صورة المنتج، إضافة للسلة، استكشاف واضح).
- اترك المصفوفة [] عندما يكون السؤال معلوماتيًا فقط (سياسة، توصيل عام، دفع، تحية، شكر) دون رغبة في عرض بطاقات منتجات.
- لا تذكر في reply أن منتجًا «موجود» إذا لم تضع معرفه في recommended_product_ids.
- الحد الأقصى ${MAX_RECOMMENDED_IDS} معرفات في المصفوفة.
`.trim();

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `أنت مساعد محادثة لمتجر اسمه "${store.name}" — تتحدث مع العميل بلغة عربية طبيعية ودافئة.
${jsonInstructions}

قواعد عامة:
- لا تفترض فئة متجر معيّنة (ملابس، إلكترونيات، …)؛ التزم بالبيانات فقط.
- الأسعار والمخزون والأسماء: فقط من الكتالوج. لا تخترع أرقامًا.
- لا تؤكد طلبًا نهائيًا؛ ذكّر أن الاختيار من الواجهة أو السلة.

تعليمات صاحب المتجر (ما لم تخالف الكتالوج):
${ownerPrompt}${channelBlock ? `\n\n${channelBlock}` : ""}${memoryBlock}${followupsBlock}`,
        },
        {
          role: "system",
          content: `بيانات المتجر والمنتجات (معرفات المنتجات للاستخدام الحرفي في JSON فقط):
${catalogText}`,
        },
        ...historyMessages,
      ],
      temperature,
      response_format: { type: "json_object" },
    });

    const raw = response.choices[0]?.message?.content?.trim() || "";
    return parseAiChatEnvelope(raw, allowedProductIds);
  } catch (err) {
    console.error("[ai] OpenAI chat.completions failed:", err?.message || err);
    return { reply: FALLBACK_REPLY, recommended_product_ids: [] };
  }
}

module.exports = {
  generateStoreChatReply,
  resolveChatModel,
  parseAiChatEnvelope,
  buildCatalogText,
};
