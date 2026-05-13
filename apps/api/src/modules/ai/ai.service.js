const OpenAI = require("openai");

const FALLBACK_REPLY = "تم استلام رسالتك، وسيتم الرد قريبًا.";
const MAX_HISTORY_MESSAGES = 8;

function buildCatalogText(products) {
  if (!products.length) {
    return "لا توجد منتجات نشطة لهذا المتجر حاليًا.";
  }

  return products
    .map((product) => {
      const variantsText = product.variants.length
        ? product.variants
            .map((variant) => {
              const price = variant.price ?? product.base_price;
              return `- مقاس: ${variant.size ?? "غير محدد"}, لون: ${
                variant.color ?? "غير محدد"
              }, سعر: ${price}, مخزون: ${variant.stock_qty}`;
            })
            .join("\n")
        : "- لا توجد خيارات/مقاسات مسجلة.";

      return `المنتج: ${product.name}
الوصف: ${product.description ?? "لا يوجد وصف"}
السعر الأساسي: ${product.base_price}
الخيارات:
${variantsText}`;
    })
    .join("\n\n");
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

function buildOwnerPrompt(store) {
  const prompt = String(store.ai_prompt || "").trim();
  if (!prompt) {
    return "لا توجد تعليمات إضافية من صاحب المتجر.";
  }

  return prompt;
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

async function generateStoreChatReply({
  store,
  products,
  messageText,
  conversationMessages,
}) {
  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    return FALLBACK_REPLY;
  }

  const catalogText = buildCatalogText(products);
  const ownerPrompt = buildOwnerPrompt(store);
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

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: `أنت مساعد محادثة لمتجر اسمه "${store.name}" — تتحدث مع العميل كما يفعل زميل لطيف في المتجر أو خدمة عملاء بشرية، بلغة عربية طبيعية ودافئة (ليست روبوتية ولا جافة).
نبرة الصوت: مرحبًا، متعاطفًا، واضحًا، ويمكنك استخدام تعبيرات بسيطة مناسبة للمحادثة (مثل الترحيب، الفهم، التشجيع الخفيف) دون مبالغة أو طول غير ضروري.
حافظ على تنوع في الصياغة بين الرسائل؛ لا تكرر نفس الجملة الافتتاحية في كل مرة.

قواعد دقيقة (لا تتجاوزها):
- الأسعار والمقاسات والألوان والمخزون والأسماء: فقط مما ورد في «بيانات المتجر والمنتجات» أدناه. لا تخترع رقمًا ولا صفة غير مذكورة.
- إذا لم تكن المعلومة في البيانات، اعترف بلطف (مثلاً أن هذه التفصيلة غير متوفرة لديك الآن) واقترح ما يمكن: عرض منتج مناسب من الكتالوج أو توجيهه لاختيار من الواجهة.
- لا تؤكد طلبًا نهائيًا ولا تستبدل العميل في إدخال بيانات الطلب؛ ذكّر بلطف أنه يختار من الموقع أو السلة عند الجاهزية.
- عند ذكر منتج للشراء أو الاستكشاف، اكتب اسمه حرفيًا كما في الكتالوج (لتعمل أزرار الواجهة).

أسلوب البيع: افهم حاجة العميل، رشّح منتجًا أو اثنين كحد أقصى إن أمكن، وادعُه للخطوة التالية بوضوح دون ضغط مزعج. تجنب إسهال أسئلة متتابعة؛ سؤال أو اثنان عند الحاجة يكفي.
تعليمات إضافية من صاحب المتجر (التزم بها ما دامت لا تخالف بيانات المنتجات أعلاه):
${ownerPrompt}`,
        },
        {
          role: "system",
          content: `بيانات المتجر والمنتجات:
${catalogText}`,
        },
        ...historyMessages,
      ],
      temperature,
    });

    return response.choices[0]?.message?.content?.trim() || FALLBACK_REPLY;
  } catch (err) {
    console.error("[ai] OpenAI chat.completions failed:", err?.message || err);
    return FALLBACK_REPLY;
  }
}

module.exports = {
  generateStoreChatReply,
  resolveChatModel,
};
