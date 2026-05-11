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

async function generateStoreChatReply({
  store,
  products,
  messageText,
  conversationMessages,
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return FALLBACK_REPLY;
  }

  const client = new OpenAI({ apiKey });
  const catalogText = buildCatalogText(products);
  const ownerPrompt = buildOwnerPrompt(store);
  const historyMessages = buildConversationMessages(
    conversationMessages,
    messageText
  );

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `أنت مساعد مبيعات لمتجر اسمه "${store.name}".
أجب بالعربية بشكل مختصر وواضح وبنبرة ودودة.
اعتمد فقط على بيانات المنتجات والمخزون والأسعار الموجودة في السياق.
لا تخترع أسعارًا أو مقاسات أو ألوانًا أو مخزونًا.
إذا سأل العميل عن شيء غير موجود في البيانات، قل: "لا أملك هذه المعلومة حاليًا".
لا تؤكد الطلب النهائي بنفسك ولا تنشئ طلبًا بدل العميل؛ القرار الأخير والبيانات يجب أن يدخلها العميل.
تصرف كمساعد مبيعات: افهم الحاجة، رشح منتجًا أو منتجين كحد أقصى، ثم ادفع العميل للخطوة التالية بوضوح.
عند ترشيح منتج، اذكر اسم المنتج كما هو بالضبط من الكتالوج حتى تظهر أزرار الشراء في الواجهة.
اسأل سؤال متابعة واحد فقط إذا كان ضروريًا لمعرفة المقاس أو اللون أو الميزانية.
إذا كان المنتج مناسبًا، قل للعميل بوضوح أنه يمكنه الضغط على زر عرض المنتج أو إضافته للسلة من الشات.
التزم بتعليمات صاحب المتجر التالية طالما لا تخالف بيانات المنتجات:
${ownerPrompt}`,
      },
      {
        role: "system",
        content: `بيانات المتجر والمنتجات:
${catalogText}`,
      },
      ...historyMessages,
    ],
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content?.trim() || FALLBACK_REPLY;
}

module.exports = {
  generateStoreChatReply,
};
