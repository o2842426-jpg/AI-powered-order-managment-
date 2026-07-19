import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PRODUCT_LOGO_URL, PRODUCT_NAME } from "../../lib/brand";

/* ============================================================
   ACT 0 — The category launch.
   Not "a chatbot for stores". A new species of store.
   ============================================================ */

export function Manifesto({ onStartTrial, onScrollTo }) {
  return (
    <section className="lp-mani lp-shell" id="top">
      <div className="lp-mani__grid">
        <div className="lp-mani__copy">
          <motion.span
            className="lp-mani__tag"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            ◆ فئة جديدة كليًا
          </motion.span>

          <TypeLine text="المتاجر لا يجب أن تبقى رفوفًا صامتة." />

          <motion.h1
            className="lp-mani__title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            نُقدّم <span className="lp-gtext">التجارة الحيّة</span>.
          </motion.h1>

          <motion.p
            className="lp-mani__sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.7 }}
          >
            متجرك يفهم عملاءك، يتكلّم معهم بالعربية، ويبيع بنفسه على مدار الساعة. ليس روبوت
            دردشة — بل <b>عقلٌ</b> يسكن متجرك.
          </motion.p>

          <motion.div
            className="lp-mani__cta"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9 }}
          >
            <button
              type="button"
              className="lp-btn lp-btn--gradient lp-btn--lg"
              onClick={onStartTrial}
            >
              أيقظ متجرك مجانًا
            </button>
            <button
              type="button"
              className="lp-btn lp-btn--ghost lp-btn--lg"
              onClick={() => onScrollTo("awaken")}
            >
              شاهده يستيقظ ↓
            </button>
          </motion.div>
        </div>

        <div className="lp-mani__stage">
          <StoreMind />
        </div>
      </div>
    </section>
  );
}

function TypeLine({ text }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);

  useEffect(() => {
    if (reduce) {
      setN(text.length);
      return undefined;
    }
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [text, reduce]);

  return (
    <p className="lp-mani__type" aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
      <span className="lp-mani__caret" aria-hidden="true" />
    </p>
  );
}

/* The store's mind: a living core that pulls conversations in and emits orders. */
function StoreMind() {
  const reduce = useReducedMotion();
  const spin = (dur, dir = 1) =>
    reduce ? {} : { rotate: dir * 360, transition: { duration: dur, repeat: Infinity, ease: "linear" } };

  return (
    <div className="lp-mind" role="img" aria-label="عقل المتجر الحي يعالج المحادثات ويحوّلها إلى طلبات">
      {[0, 1].map((i) => (
        <motion.span
          key={i}
          className="lp-mind__pulse"
          initial={{ scale: 0.6, opacity: 0.4 }}
          animate={reduce ? {} : { scale: [0.6, 1.9], opacity: [0.4, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, delay: i * 1.7, ease: "easeOut" }}
        />
      ))}

      <motion.div className="lp-mind__ring lp-mind__ring--1" animate={spin(32, 1)}>
        <span className="lp-mind__node" style={{ top: "-16px", insetInlineStart: "50%" }}>💬</span>
        <span className="lp-mind__node" style={{ top: "50%", insetInlineStart: "-16px" }}>❓</span>
        <span className="lp-mind__node" style={{ top: "50%", insetInlineEnd: "-16px" }}>🛍️</span>
      </motion.div>

      <motion.div
        className="lp-mind__core"
        animate={
          reduce
            ? {}
            : {
                scale: [1, 1.06, 1],
                boxShadow: [
                  "0 0 60px rgba(139,92,246,0.45)",
                  "0 0 100px rgba(34,211,238,0.6)",
                  "0 0 60px rgba(139,92,246,0.45)",
                ],
              }
        }
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      >
        <img src={PRODUCT_LOGO_URL} alt="" />
        <span className="lp-mind__core-label">{PRODUCT_NAME}</span>
      </motion.div>

      <FloatLabel className="lp-mind__tag lp-mind__tag--order" delay={0.4}>
        <b>✓</b> طلب مؤكد
      </FloatLabel>
      <FloatLabel className="lp-mind__tag lp-mind__tag--rev" delay={1.8}>
        +75,000 د.ع
      </FloatLabel>
    </div>
  );
}

function FloatLabel({ children, className, delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: [8, -8, 8] }}
      transition={{ duration: 5, repeat: reduce ? 0 : Infinity, delay, ease: "easeInOut" }}
    >
      {children}
    </motion.span>
  );
}
