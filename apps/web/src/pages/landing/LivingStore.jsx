import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Reveal, SectionHead } from "./ui";

/* ============================================================
   ACT 1 — Watch a dead catalog become a living store.
   One click. The category shift, felt in 3 seconds.
   ============================================================ */

const EVENTS = [
  { icon: "💬", who: "عميل", text: "عندكم حذاء رياضي مقاس 42؟" },
  { icon: "🤖", who: "ShopIQ", text: "نعم متوفر 👟 سعره 75,000 د.ع — أثبتلك الطلب؟" },
  { icon: "✅", who: "طلب", text: "طلب جديد مؤكد — البصرة", amount: 75000 },
  { icon: "💬", who: "عميل", text: "شكد يكلف التوصيل؟" },
  { icon: "🤖", who: "ShopIQ", text: "التوصيل داخل بغداد 24 ساعة، والدفع عند الاستلام 🚚" },
  { icon: "✅", who: "طلب", text: "طلب جديد مؤكد — بغداد", amount: 120000 },
  { icon: "💬", who: "عميل", text: "أريد نفس الجاكيت بلون أسود" },
  { icon: "🤖", who: "ShopIQ", text: "اختيار موفّق 🖤 متوفر بمقاسك، أثبته لك؟" },
  { icon: "✅", who: "طلب", text: "طلب جديد مؤكد — أربيل", amount: 95000 },
];

const TILES = ["👟", "🧥", "👜", "⌚", "👕", "🧢"];

export function LivingStore() {
  const reduce = useReducedMotion();
  const [awake, setAwake] = useState(false);
  const [feed, setFeed] = useState([]);
  const [revenue, setRevenue] = useState(0);
  const [orders, setOrders] = useState(0);
  const idx = useRef(0);

  useEffect(() => {
    if (!awake) {
      setFeed([]);
      setRevenue(0);
      setOrders(0);
      idx.current = 0;
      return undefined;
    }
    const push = () => {
      const e = EVENTS[idx.current % EVENTS.length];
      idx.current += 1;
      setFeed((f) => [...f, { ...e, key: `${Date.now()}-${Math.random()}` }].slice(-5));
      if (e.amount) {
        setRevenue((r) => r + e.amount);
        setOrders((o) => o + 1);
      }
    };
    push();
    const id = setInterval(push, reduce ? 1400 : 1700);
    return () => clearInterval(id);
  }, [awake, reduce]);

  return (
    <section className="lp-section lp-shell" id="awaken">
      <SectionHead
        eyebrow="اللحظة التي يتغيّر فيها كل شيء"
        title={
          <>
            متجرك الآن... <span className="lp-gtext">ثم اضغط الزر</span>
          </>
        }
        lead="متجر عادي: رفوف صامتة تنتظر. اضغط «أيقظ المتجر»، وشاهد ما يحدث حين يسكنه عقل."
      />

      <Reveal className={`lp-wake${awake ? " is-awake" : ""}`}>
        <div className="lp-wake__stage">
          <div className={`lp-wake__store${awake ? "" : " is-asleep"}`}>
            <div className="lp-wake__store-head">
              <span className="lp-wake__badge">
                <span className={`lp-wake__pip${awake ? " is-live" : ""}`} />
                {awake ? "المتجر حيّ" : "المتجر نائم"}
              </span>
              <span className="lp-wake__lastreply">
                {awake ? "يرد الآن خلال ثوانٍ" : "آخر رد: قبل 3 ساعات"}
              </span>
            </div>
            <div className="lp-wake__tiles">
              {TILES.map((t, i) => (
                <div className="lp-wake__tile" key={i}>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-wake__panel">
            <div className="lp-wake__metrics">
              <div className="lp-wake__metric">
                <div className="lp-wake__metric-label">الإيرادات الآن</div>
                <div className="lp-wake__metric-val lp-gtext">
                  {revenue.toLocaleString("en-US")}
                  <span> د.ع</span>
                </div>
              </div>
              <div className="lp-wake__metric">
                <div className="lp-wake__metric-label">طلبات مؤكدة</div>
                <div className="lp-wake__metric-val">{orders}</div>
              </div>
            </div>

            <div className="lp-wake__feed" aria-live="polite">
              <div className="lp-wake__feed-title">نبض المتجر</div>
              {!awake && <div className="lp-wake__idle">— لا نشاط —</div>}
              <AnimatePresence initial={false}>
                {feed.map((e) => (
                  <motion.div
                    key={e.key}
                    className={`lp-wake__event lp-wake__event--${e.who === "طلب" ? "order" : e.who === "ShopIQ" ? "ai" : "cust"}`}
                    initial={{ opacity: 0, x: 24, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, x: -24, height: 0 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <span className="lp-wake__event-ico">{e.icon}</span>
                    <span className="lp-wake__event-text">{e.text}</span>
                    {e.amount ? <span className="lp-wake__event-amt">+{e.amount.toLocaleString("en-US")}</span> : null}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <button
              type="button"
              className={`lp-btn lp-btn--lg lp-btn--full ${awake ? "lp-btn--outline" : "lp-btn--gradient lp-btn--glow"}`}
              onClick={() => setAwake((v) => !v)}
              aria-pressed={awake}
            >
              {awake ? "متجرك حيّ الآن ✓ — أعد العرض" : "⚡ أيقظ المتجر"}
            </button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
