import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { SectionHead, Reveal } from "./ui";

const QA = [
  {
    id: "shoe",
    q: "عندكم حذاء رياضي رجالي مقاس 42؟",
    a: "بالتأكيد 👟 متوفر لدينا موديل رياضي مريح بمقاس 42، وهذا أفضل خيار حالياً:",
    product: { emoji: "👟", name: "حذاء رياضي كلاسيك", price: "75,000 د.ع" },
  },
  {
    id: "price",
    q: "شكد سعر الجاكيت الجلد؟",
    a: "جاكيت الجلد الطبيعي متوفر بسعر 120,000 د.ع، بجودة ممتازة ومتوفر بعدة مقاسات. تحب أرسلك الصور؟ 🧥",
  },
  {
    id: "delivery",
    q: "التوصيل شكد ياخذ وقت؟",
    a: "التوصيل داخل بغداد خلال 24 ساعة، وباقي المحافظات من يومين لثلاثة أيام. والدفع عند الاستلام 💵🚚",
  },
  {
    id: "order",
    q: "أريد أطلب، شنو الخطوة؟",
    a: "تمام! أرسل لي اسمك الكامل، رقم هاتفك، والمدينة، وأثبتلك الطلب فوراً ✅",
  },
  {
    id: "colors",
    q: "ممكن أشوف ألوان ثانية؟",
    a: "أكيد! متوفر بالأسود، الأبيض، والكحلي 🎨 أي لون يعجبك أكثر؟",
  },
];

const GREETING = {
  role: "ai",
  text: "هلا وغلا في متجرنا 👋 أني مساعد ShopIQ الذكي — اسألني عن أي منتج أو سعر أو توصيل!",
};

export function InteractiveDemo() {
  const reduce = useReducedMotion();
  const [messages, setMessages] = useState([GREETING]);
  const [used, setUsed] = useState([]);
  const [typing, setTyping] = useState(false);
  const threadRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const ask = (item) => {
    if (typing || used.includes(item.id)) return;
    setUsed((u) => [...u, item.id]);
    setMessages((m) => [...m, { role: "customer", text: item.q }]);
    setTyping(true);
    const t = setTimeout(
      () => {
        setTyping(false);
        setMessages((m) => [...m, { role: "ai", text: item.a, product: item.product }]);
      },
      reduce ? 250 : 1050
    );
    timers.current.push(t);
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setMessages([GREETING]);
    setUsed([]);
    setTyping(false);
  };

  return (
    <section className="lp-section lp-shell" id="demo">
      <SectionHead
        eyebrow="لا تصدّقنا — جرّب"
        title={<>اسأل مثل عميل... <span className="lp-gtext">وشوف الرد بنفسك</span></>}
        lead="اضغط أي سؤال، وراقب الرد خلال ثوانٍ. بدون تسجيل."
      />

      <Reveal className="lp-demo">
        <div className="lp-demo__panel">
          <div className="lp-demo__head">
            <span className="lp-demo__avatar">🤖</span>
            <div>
              <div className="lp-demo__name">مساعد ShopIQ</div>
              <div className="lp-demo__status">
                <span className="lp-app__online" /> يرد خلال ثوانٍ
              </div>
            </div>
          </div>

          <div className="lp-demo__thread" ref={threadRef} aria-live="polite">
            <AnimatePresence initial={false}>
              {messages.map((msg, i) => (
                <motion.div
                  key={`${i}-${msg.role}`}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className={msg.role === "customer" ? "lp-msg lp-msg--out" : "lp-msg lp-msg--in"}
                  style={msg.product ? { background: "transparent", padding: 0, maxWidth: "82%" } : undefined}
                >
                  {msg.product ? (
                    <ProductBubble text={msg.text} product={msg.product} />
                  ) : (
                    msg.text
                  )}
                </motion.div>
              ))}
              {typing && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="lp-typing"
                  style={{ alignSelf: "flex-start" }}
                >
                  <span />
                  <span />
                  <span />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="lp-demo__side">
          <p className="lp-demo__hint">اختر سؤالًا كأنك عميل:</p>
          {QA.map((item) => (
            <button
              key={item.id}
              type="button"
              className="lp-demo__chip"
              onClick={() => ask(item)}
              disabled={typing || used.includes(item.id)}
            >
              <span>{item.q}</span>
              <span className="lp-demo__chip-arrow" aria-hidden="true">↩</span>
            </button>
          ))}
          {used.length > 0 && (
            <button type="button" className="lp-demo__reset" onClick={reset}>
              إعادة المحادثة من البداية
            </button>
          )}
        </div>
      </Reveal>
    </section>
  );
}

function ProductBubble({ text, product }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "flex-end" }}>
      <div className="lp-msg lp-msg--in" style={{ maxWidth: "100%" }}>
        {text}
      </div>
      <div className="lp-demo__prod">
        <div className="lp-demo__prod-img">{product.emoji}</div>
        <div className="lp-demo__prod-body">
          <div className="lp-demo__prod-name">{product.name}</div>
          <div className="lp-demo__prod-price">{product.price}</div>
          <button type="button" className="lp-demo__prod-btn">
            عرض المنتج
          </button>
        </div>
      </div>
    </div>
  );
}
