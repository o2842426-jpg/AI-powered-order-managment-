import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PRODUCT_LOGO_URL, PRODUCT_NAME } from "../../lib/brand";
import { Reveal, fadeUp } from "./ui";

const TAGS = ["يدعم اللغة العربية", "إعداد خلال أقل من 5 دقائق", "لا تحتاج بطاقة ائتمانية"];

export function Hero({ onStartTrial, onDemo }) {
  return (
    <section className="lp-hero lp-shell" id="top">
      <div className="lp-hero__copy">
        <Reveal>
          <span className="lp-badge">
            <span className="lp-badge__dot" />
            الأول في العراق 🇮🇶
          </span>
        </Reveal>

        <Reveal>
          <h1 className="lp-hero__title">
            بينما أنت نائم،
            <br />
            متجرك <span className="lp-gtext">يبيع</span>.
          </h1>
        </Reveal>

        <Reveal>
          <p className="lp-hero__sub">
            {PRODUCT_NAME} يرد على كل عميل خلال ثوانٍ، يقنعه بالعربية، ويكمّل الطلب بدالك — ليل
            نهار. تصحى الصباح على طلبات جديدة، لا على رسائل فاتتك.
          </p>
        </Reveal>

        <Reveal className="lp-hero__cta">
          <button
            type="button"
            className="lp-btn lp-btn--gradient lp-btn--lg lp-btn--glow"
            onClick={onStartTrial}
          >
            ابدأ مجانًا
          </button>
          <button type="button" className="lp-btn lp-btn--outline lp-btn--lg" onClick={onDemo}>
            <span className="lp-btn__play">▶</span>
            شاهده وهو يبيع
          </button>
        </Reveal>

        <Reveal>
          <ul className="lp-hero__tags">
            {TAGS.map((tag) => (
              <li key={tag}>
                <span className="lp-check">✓</span>
                {tag}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>

      <Reveal className="lp-hero__visual" variants={fadeUp}>
        <LaptopDemo />
      </Reveal>
    </section>
  );
}

function LaptopDemo() {
  const reduce = useReducedMotion();

  const floatAnim = reduce
    ? {}
    : {
        y: [0, -16, 0],
        transition: { duration: 6, repeat: Infinity, ease: "easeInOut" },
      };

  const toastAnim = reduce
    ? { opacity: 1 }
    : {
        opacity: [0, 0, 1, 1, 0],
        y: [14, 14, 0, 0, 14],
        transition: { duration: 5.5, repeat: Infinity, times: [0, 0.35, 0.45, 0.85, 1], ease: "easeInOut" },
      };

  return (
    <div className="lp-mock">
      <motion.div
        className="lp-mock__float"
        style={{ rotateX: 4, rotateY: -6 }}
        animate={floatAnim}
      >
        <div className="lp-laptop">
          <div className="lp-laptop__screen">
            <div className="lp-app">
              <aside className="lp-app__side">
                <img src={PRODUCT_LOGO_URL} alt="" />
                <span className="lp-app__dot lp-app__dot--active" />
                <span className="lp-app__dot" />
                <span className="lp-app__dot" />
                <span className="lp-app__dot" />
              </aside>

              <main className="lp-app__chat">
                <header className="lp-app__chat-head">
                  <span className="lp-app__avatar">م</span>
                  <div>
                    <div className="lp-app__name">محمد — إنستغرام</div>
                    <div className="lp-app__status">
                      <span className="lp-app__online" /> نشط الآن
                    </div>
                  </div>
                </header>

                <div className="lp-app__thread">
                  <Msg delay={0.2} cls="lp-bubble lp-bubble--in">
                    أريد حذاء رياضي رجالي مقاس 42
                  </Msg>
                  <Msg delay={0.7} cls="lp-bubble lp-bubble--out">
                    بالتأكيد! إليك أفضل الخيارات المتاحة 👟
                  </Msg>
                  <motion.div
                    className="lp-prodcard"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.1, duration: 0.5 }}
                  >
                    <div className="lp-prodcard__img">👟</div>
                    <div className="lp-prodcard__body">
                      <div className="lp-prodcard__name">حذاء رياضي كلاسيك</div>
                      <div className="lp-prodcard__price">75,000 د.ع</div>
                    </div>
                    <button type="button" className="lp-prodcard__cta">
                      عرض المنتج
                    </button>
                  </motion.div>
                  <Msg delay={1.5} cls="lp-bubble lp-bubble--in">
                    ممتاز، أريد أطلبه للبصرة
                  </Msg>
                  <motion.div
                    className="lp-typing"
                    style={{ alignSelf: "flex-end" }}
                    initial={reduce ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1.95, duration: 0.4 }}
                    aria-label="الذكاء الاصطناعي يكتب"
                  >
                    <span />
                    <span />
                    <span />
                  </motion.div>
                </div>
              </main>

              <aside className="lp-app__analytics">
                <Metric rev live label="إجمالي الإيرادات" value={<LiveRevenue />} unit="د.ع" delay={0.3} />
                <Metric label="الطلبات اليوم" value="87" delay={0.45} />
                <Metric label="معدل التحويل" value="%34" spark delay={0.6} />
              </aside>
            </div>
          </div>
          <div className="lp-laptop__base" />

          <motion.div className="lp-order-toast" animate={toastAnim}>
            <span className="lp-order-toast__check">✓</span>
            تم إنشاء الطلب — البصرة
          </motion.div>
        </div>

        <motion.div
          className="lp-chip lp-chip--order"
          animate={reduce ? {} : { y: [0, -10, 0], transition: { duration: 5, repeat: Infinity, ease: "easeInOut" } }}
        >
          <span className="lp-chip__icon">✓</span>
          طلب جديد
        </motion.div>
        <motion.div
          className="lp-chip lp-chip--ai"
          animate={reduce ? {} : { y: [0, 10, 0], transition: { duration: 5.5, repeat: Infinity, ease: "easeInOut" } }}
        >
          <span className="lp-chip__pulse" />
          الذكاء الاصطناعي يرد الآن
        </motion.div>
      </motion.div>
    </div>
  );
}

function Msg({ children, cls, delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cls}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.45 }}
    >
      {children}
    </motion.div>
  );
}

function LiveRevenue() {
  const reduce = useReducedMotion();
  const [val, setVal] = useState(12450000);
  useEffect(() => {
    if (reduce) return undefined;
    const id = setInterval(() => {
      setVal((v) => {
        const inc = [25000, 50000, 75000][Math.floor(Math.random() * 3)];
        const next = v + inc;
        return next > 14500000 ? 12450000 : next;
      });
    }, 2400);
    return () => clearInterval(id);
  }, [reduce]);
  return <>{Math.round(val).toLocaleString("en-US")}</>;
}

function Metric({ label, value, unit, rev, spark, live, delay }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`lp-metric${rev ? " lp-metric--rev" : ""}`}
      initial={reduce ? false : { opacity: 0, x: 10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
    >
      <div className="lp-metric__label">{label}</div>
      <div className="lp-metric__value">
        {value}
        {unit ? <span className="lp-metric__unit"> {unit}</span> : null}
      </div>
      {live ? (
        <div className="lp-metric__trend">
          <motion.span
            animate={reduce ? {} : { opacity: [1, 0.4, 1], transition: { duration: 2.4, repeat: Infinity } }}
          >
            ▲
          </motion.span>{" "}
          يرتفع الآن
        </div>
      ) : null}
      {spark ? (
        <div className="lp-spark" aria-hidden="true">
          {[40, 65, 50, 80, 95].map((h, i) => (
            <motion.span
              key={i}
              initial={reduce ? false : { scaleY: 0 }}
              whileInView={{ scaleY: h / 100 }}
              viewport={{ once: true }}
              transition={{ delay: delay + 0.1 * i, duration: 0.5, ease: "easeOut" }}
              style={{ height: "100%" }}
            />
          ))}
        </div>
      ) : null}
    </motion.div>
  );
}
