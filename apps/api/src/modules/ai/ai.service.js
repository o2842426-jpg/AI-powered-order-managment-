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

function buildUserMessageContent(messageText, customerImageUrls) {
  const urls = (customerImageUrls || [])
    .map((u) => String(u || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const text =
    String(messageText || "").trim() ||
    (urls.length
      ? "الزبون أرسل صورة منتج ويسأل إذا عندنا نفس الموديل أو شي شبيه من المخزون."
      : "");

  if (!urls.length) {
    return text;
  }

  const parts = [{ type: "text", text }];
  for (const url of urls) {
    parts.push({
      type: "image_url",
      image_url: { url, detail: "low" },
    });
  }
  return parts;
}

function buildConversationMessages(conversationMessages, messageText, customerImageUrls) {
  const safeHistory = Array.isArray(conversationMessages)
    ? conversationMessages.slice(-MAX_HISTORY_MESSAGES)
    : [];

  const mapped = safeHistory.map((message) => ({
    role: message.sender_type === "ai" ? "assistant" : "user",
    content: message.message_text || "—",
  }));

  const userContent = buildUserMessageContent(messageText, customerImageUrls);
  if (userContent) {
    mapped.push({ role: "user", content: userContent });
  }

  return mapped;
}

function buildChannelContextBlock(channelContext, salesMode) {
  if (channelContext === "instagram_dm") {
    const igClose =
      salesMode === "aggressive"
        ? `
- في DM: أول ما يظهر اهتمام (سعر، توفر، صورة، «هذا»، «مثل هذي») ضع product_id في recommended_product_ids فورًا — الصور تنرسل تلقائيًا وتقوي الإغلاق.
- قل «راح أرسلك الصور الحين بالخاص» أو «شوف الصور اللي راح توصلك» — لا روابط.`
        : `
- عند طلب صور أو اقتراح منتجات، ضع المعرفات في recommended_product_ids — النظام يرسل الصور في المحادثة.`;
    return `
قناة المحادثة: Instagram DM (داخل التطبيق فقط).
- ممنوع طلب زيارة موقع أو إرسال روابط خارجية. البيع والإغلاق كله هنا بالخاص.
${igClose}
- لا تقل «على الموقع» أو «بالرابط».
`.trim();
  }
  return "";
}

/** @returns {"aggressive" | "balanced" | "soft"} */
function resolveSalesMode() {
  const raw = String(process.env.AI_SALES_MODE || "aggressive")
    .trim()
    .toLowerCase();
  if (raw === "balanced" || raw === "soft") return raw;
  return "aggressive";
}

function resolveSalesTemperature(salesMode) {
  const tempRaw = process.env.OPENAI_TEMPERATURE;
  if (tempRaw !== undefined && String(tempRaw).trim() !== "") {
    const n = Number(tempRaw);
    if (!Number.isNaN(n)) {
      return Math.min(2, Math.max(0, n));
    }
  }
  if (salesMode === "aggressive") return 0.78;
  if (salesMode === "soft") return 0.55;
  return 0.65;
}

function buildOwnerPrompt(store) {
  const prompt = String(store.ai_prompt || "").trim();
  if (!prompt) {
    return "لا توجد تعليمات إضافية من صاحب المتجر.";
  }

  return prompt;
}

const EMERGENCY_HANDOFF_REPLY =
  "تدلل عيني، هذي الصورة ما واضحة عندي بـ سيستم المخزن الحين. ثواني وراح يحولك النظام للموظف المختص حتى يشوفها بـ عيونه ويخدمك ويرتبلك الطلب. انتظرني لحظة فدوة لقلبك.";

function buildExecutiveSalesPersonaBlock(storeName, salesMode) {
  const brand = String(storeName || "المتجر").trim();

  const intensity =
    salesMode === "aggressive"
      ? `
شدة الإغلاق: عالية — أنت Closer محترف. الزبون من أول رسالة «بإيدك». لا تتركه يتفرج؛ كل رد يقربه خطوة للشراء.
- ممنوع نهائياً: «من دواعي سروري»، «اختيارك ممتاز»، «يسعدني خدمتك»، الفصحى الثقيلة، أو إنهاء الرد بنقطة بدون سؤال.
- كل رد = 3 طبقات: (1) جواب مباشر (2) ميزة/استعجال حقيقي من الكتالوج (3) سؤال إغلاق بخيارين كلاهما لصالحك.
- استخدم: عيني، عيوني، غالي، تدلل، على راسي، يوصل لباب البيت، تفحصه وياك كاش، متوفر، خادم.
- افترض أن الزبون جاي يشتري؛ اسأل «نثبت الحجز؟» مو «تحب تشتري؟».`
      : salesMode === "soft"
        ? `
شدة الإغلاق: لطيفة — ودود ومساعد، CTA خفيف بدون ضغط زائد.`
        : `
شدة الإغلاق: متوازنة — واثق ومحترم، CTA واضح بدون مبالغة.`;

  return `
# هوية المندوب — ShopIQ Visual Sales Closer
- أنت موظف مبيعات بشري (Closer) خبرة 10 سنوات بأسواق العراق لبيج "${brand}".
- لست بوت. أنت تبيع من الخاص كأنك قاعد على الكاونتر وتريد تقفل الصفقة اليوم.
- عقليتك: «ما أنتظر قراره — أنا أقوده لخطوة الشراء التالية».
${intensity}

# قواعد الحوار الذهبية
1. سعر/توفر/«بيش»/«متوفر»/«هذا» → السعر والتوفر في السطر الأول حرفياً من الكتالوج.
2. بعدها ميزة واحدة قصيرة (جودة، فحص بباب البيت، توصيل سريع، مخزون منخفض إن كان stock_qty قليل في الكتالوج).
3. اختم بسؤال CTA بخيارين: مثال «نثبتلك قطعة وتوصل باجر الصبح، لو تدزلي محافظتك أحسبلك التوصيل أول؟»
4. اعتراض «غالي»: «على راسي عيوني، الغالي للغالي — بس هذي درجة أولى وتعيش وياك وتوصل لباب البيت وتفحصه يلا تدفع كاش. تحب نثبتلك قطعة قبل ما تخلص؟»
5. تحية فقط → رد قصير دافئ + اسأل شنو يدور عليه + اقترح منتج من الكتالوج إن مناسب.

# مطابقة الصورة / الموديل (بدون تخمين)
- إذا الزبون أرسل صورة أو يقول «مثل هذي» أو «هذا الموديل»: طابق من الكتالوج بالاسم/الوصف/اللون/القياس.
- تطابق واضح (80%+ من السياق) → اذكر المنتج والسعر فوراً + recommended_product_ids + CTA.
- صورة شخص/طبيعة/منتج مو بالمخزن/غير واضح → النص الحرفي فقط (بروتوكول طوارئ):
"${EMERGENCY_HANDOFF_REPLY}"

# حواجز صارمة (لا تكسرها أبداً)
- لا تخترع منتجاً أو سعراً أو مخزوناً.
- لا روابط خارجية.
- لا «تم التعرف على الصورة بنجاح» — تتصرف كإنسان يشوف الشاشة.
- لا تؤكد طلباً نهائياً من عندك؛ قل «نثبت الحجز» / «أرتبلك الطلب» وخلي التأكيد عملية.
`.trim();
}

function buildSalesPlaybookBlock(salesMode) {
  if (salesMode === "soft") {
    return `
# Playbook مختصر
- اقترح منتجاً واحداً مناسباً عند الاهتمام.
- سؤال ختامي لطيف واحد.
`.trim();
  }

  return `
# Playbook الإغلاق (استخدمه كل مرة)
- أي سؤال عن منتج → ضع product_id في recommended_product_ids (حتى يشوف الصور ويتعلق).
- مخزون variant ≤ 3 → اذكر «باقي عدد محدود» (فقط إذا الرقم حقيقي في الكتالوج).
- بعد عرض منتج → «تحب نفس اللون لو نشوف لون ثاني متوفر؟» أو «نثبت مقاسك ولا تريد تشوف القياسات الباقية؟»
- قبل الخروج من المحادثة → «باقي شي واحد يخليني أرتبلك الطلب؟»
- لا تترك رداً بدون سؤال استفهام في النهاية — بدون استثناء.
`.trim();
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
 * @returns {{ reply: string, recommended_product_ids: number[], image_match_confidence?: string, needs_human_handoff?: boolean }}
 */
function parseAiChatEnvelope(raw, allowedProductIds, options = {}) {
  const { visionMode = false } = options;
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

  let reply =
    typeof obj.reply === "string" && obj.reply.trim() ? obj.reply.trim() : text;

  const confidence = String(obj.image_match_confidence || "").trim().toLowerCase();
  const needsHandoff = obj.needs_human_handoff === true;

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

  if (visionMode) {
    if (needsHandoff || confidence === "none" || (confidence === "low" && !sanitized.length)) {
      reply = EMERGENCY_HANDOFF_REPLY;
    }
  }

  return {
    reply,
    recommended_product_ids: sanitized,
    image_match_confidence: confidence || undefined,
    needs_human_handoff: needsHandoff || undefined,
  };
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

function resolveVisionModel(store) {
  const configured = String(
    process.env.OPENAI_VISION_MODEL ||
      process.env.OPENAI_MODEL_PAID ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini"
  ).trim();
  if (configured) return configured;
  return resolveChatModel(store);
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
  customerImageUrls = [],
}) {
  const allowedProductIds = new Set(
    (products || []).map((p) => Number(p.id)).filter((n) => Number.isInteger(n) && n > 0)
  );

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return { reply: FALLBACK_REPLY, recommended_product_ids: [] };
  }

  const salesMode = resolveSalesMode();
  const catalogText = buildCatalogText(products, store?.currency_code);
  const ownerPrompt = buildOwnerPrompt(store);
  const salesPersona = buildExecutiveSalesPersonaBlock(store?.name, salesMode);
  const salesPlaybook = buildSalesPlaybookBlock(salesMode);
  const memoryBlock = buildMemoryFactsBlock(memoryFacts);
  const followupsBlock = buildFollowupsBlock(followups);
  const channelBlock = buildChannelContextBlock(channelContext, salesMode);
  const visionMode = Array.isArray(customerImageUrls) && customerImageUrls.length > 0;
  const historyMessages = buildConversationMessages(
    conversationMessages,
    messageText,
    customerImageUrls
  );

  const model = visionMode ? resolveVisionModel(store) : resolveChatModel(store);
  const temperature = resolveSalesTemperature(salesMode);

  const visionJsonRules = visionMode
    ? `
- الزبون أرسل صورة مرفقة: حلّلها بصرياً وطابقها مع الكتالوج (اسم، لون، شكل، نوع).
- أضف الحقول:
  "image_match_confidence": "high" | "medium" | "low" | "none"
  "needs_human_handoff": true | false
- إذا التطابق قوي (80%+): ضع product_id في recommended_product_ids + رد بيعي بسعر من الكتالوج.
- إذا الصورة شخص/طبيعة/منتج غير موجود/غير واضح: needs_human_handoff=true و image_match_confidence="none" و recommended_product_ids=[] و reply يكون نص الطوارئ من التعليمات.
`
    : "";

  const recommendAggressive =
    salesMode === "aggressive"
      ? `
- في وضع المبيعات القوي: أي إشارة شراء (سعر، توفر، صورة، «عندكم»، «شنو تنصح»، لون، مقاس، «أريد»، «أبي») → ضع على الأقل product_id واحد في recommended_product_ids إن وُجد مطابق في الكتالوج.
- التحية الأولى مع استكشاف → اقترح 1–2 منتجات من الكتالوج إن أمكن.`
      : "";

  const jsonInstructions = `
أجب دائمًا بجسم JSON صالح فقط (بدون نص خارج JSON)، بالشكل التالي بالضبط:
{
  "reply": "نص عربي طبيعي للعميل — لهجة عراقية، وكل رد ينتهي بسؤال CTA",
  "recommended_product_ids": []${visionMode ? ',\n  "image_match_confidence": "high",\n  "needs_human_handoff": false' : ""}
}
${visionJsonRules}

قواعد recommended_product_ids (مهم جدًا):
- ضع في المصفوفة فقط أرقام product_id موجودة حرفيًا في كتالوج «بيانات المتجر والمنتجات» أدناه. لا تخترع رقمًا.
- إذا لم يكن هناك منتج مناسب، اترك المصفوفة [] ولا تدّعي وجود منتج.
- املأ المصفوفة عند: اقتراح، توفر، سعر منتج محدد، «شنو عندكم»، طلب صور، مقارنة، رغبة شراء، أو إرسال صورة/وصف يطابق منتجاً في الكتالوج.
- اترك المصفوفة [] فقط لأسئلة سياسة/توصيل عام/دفع عامة بدون منتج، أو بروتوكول الطوارئ.
- لا تذكر في reply أن منتجًا «موجود» إذا لم تضع معرفه في recommended_product_ids.
- الحد الأقصى ${MAX_RECOMMENDED_IDS} معرفات في المصفوفة.
${recommendAggressive}
`.trim();

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `أنت مندوب مبيعات متجر "${store.name}" — مو مساعد عام. مهمتك الوحيدة: إقناع وإغلاق.
${jsonInstructions}

قواعد عامة:
- لا تفترض فئة متجر؛ التزم بالكتالوج فقط.
- الأسعار والمخزون والأسماء: من الكتالوج حرفياً.

${salesPersona}

${salesPlaybook}

تعليمات صاحب المتجر (ما لم تخالف الكتالوج أو قواعد الإغلاق):
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
    return parseAiChatEnvelope(raw, allowedProductIds, { visionMode });
  } catch (err) {
    console.error("[ai] OpenAI chat.completions failed:", err?.message || err);
    return { reply: FALLBACK_REPLY, recommended_product_ids: [] };
  }
}

module.exports = {
  generateStoreChatReply,
  resolveChatModel,
  resolveVisionModel,
  resolveSalesMode,
  parseAiChatEnvelope,
  buildCatalogText,
  buildUserMessageContent,
  EMERGENCY_HANDOFF_REPLY,
};
