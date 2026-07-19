import { motion } from "framer-motion";
import { PRODUCT_LOGO_URL, PRODUCT_NAME } from "../../lib/brand";
import { Reveal, RevealGroup, SectionHead, fadeUp } from "./ui";

/* ===================== PAIN / FRUSTRATION ===================== */
const PAINS = [
  {
    icon: "🌙",
    title: "راسلك الساعة ٢ الفجر",
    desc: "انتظر ردك دقيقتين... ما لقاه، فراح واشترى من منافسك — وأنت نائم.",
  },
  {
    icon: "🔁",
    title: "نفس السؤال ١٠٠ مرة",
    desc: "«شكد سعره؟ عندكم توصيل؟» تكتب نفس الجواب من الصبح بدل ما تكبّر متجرك.",
  },
  {
    icon: "🕳️",
    title: "طلبات تضيع بالمحادثات",
    desc: "أسماء وأرقام وعناوين مبعثرة بين مئات الرسائل — وما تدري شكد صفقة انفلتت.",
  },
];

export function PainPoints() {
  return (
    <section className="lp-section lp-shell" id="problem">
      <SectionHead
        eyebrow="الحقيقة المؤلمة"
        title={<>كل رسالة تتأخر بالرد... <span className="lp-gtext">طلب راح لغيرك</span></>}
        lead="مو مشكلة منتجك. المشكلة إن عملاءك ما ينتظرون — وأنت لا تقدر ترد على الكل بنفس اللحظة."
      />
      <RevealGroup className="lp-why">
        {PAINS.map((card) => (
          <motion.article className="lp-wcard lp-wcard--pain" key={card.title} variants={fadeUp}>
            <div className="lp-wcard__icon">{card.icon}</div>
            <h3 className="lp-wcard__title">{card.title}</h3>
            <p className="lp-wcard__desc">{card.desc}</p>
          </motion.article>
        ))}
      </RevealGroup>
      <Reveal className="lp-story-line">
        تخيّل لو كان هناك من يرد على <span className="lp-gtext">كل عميل</span>، فورًا، بأسلوبك،
        دون أن تتعب أو تنام...
      </Reveal>
    </section>
  );
}

/* ===================== WHY SHOPIQ ===================== */
const WHY = [
  {
    icon: "⚡",
    title: "عميلك ما ينتظر ثانية",
    desc: "يرد في نفس اللحظة، بأي ساعة من الليل أو النهار. لا مزيد من صفقات تضيع لأنك كنت مشغولًا أو نائمًا.",
  },
  {
    icon: "🌍",
    title: "يتكلم مثل أهل بلدك",
    desc: "لهجة عراقية طبيعية تبني ثقة فورية، فيشعر عميلك أنه يحكي مع بائع يفهمه — لا مع روبوت بارد.",
  },
  {
    icon: "📈",
    title: "يبيع حتى وأنت غايب",
    desc: "يرشّح، يقنع، ويقفل الطلب نيابةً عنك. تفتح تلفونك فتلقى طلبات جاهزة تنتظر التجهيز فقط.",
  },
];

export function WhyShopIQ() {
  return (
    <section className="lp-section lp-shell" id="why">
      <SectionHead
        eyebrow="ماذا يعني أن يكون متجرك حيًّا"
        title={<>متجر <span className="lp-gtext">لا ينام، ولا يتأخر، ولا ينسى</span></>}
        lead="نفس منتجاتك، لكن مع عقل لا يتعب ولا يتأخر."
      />
      <RevealGroup className="lp-why">
        {WHY.map((card) => (
          <motion.article className="lp-wcard" key={card.title} variants={fadeUp}>
            <div className="lp-wcard__icon">{card.icon}</div>
            <h3 className="lp-wcard__title">{card.title}</h3>
            <p className="lp-wcard__desc">{card.desc}</p>
          </motion.article>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ===================== HOW IT WORKS ===================== */
const STEPS = [
  { icon: "🔗", title: "اربط متجرك", desc: "اربط حساب إنستغرام رسميًا خلال دقائق." },
  { icon: "🧠", title: "درّب الذكاء الاصطناعي", desc: "يتعلّم منتجاتك وأسعارك وأسلوب متجرك." },
  { icon: "💬", title: "يبدأ الرد على العملاء", desc: "يجاوب رسائلهم فورًا بالعربية 24/7." },
  { icon: "📦", title: "تحويل المحادثات إلى طلبات", desc: "يجمع التفاصيل وينشئ الطلب تلقائيًا." },
];

export function HowItWorks() {
  return (
    <section className="lp-section lp-shell" id="how">
      <SectionHead
        eyebrow="أبسط مما تتخيّل"
        title={<>خمس دقائق إعداد... <span className="lp-gtext">ثم يشتغل بدالك</span></>}
        lead="بدون كود ولا خبرة تقنية. تربط مرة واحدة، ويبيع للأبد."
      />
      <RevealGroup className="lp-steps">
        {STEPS.map((step, i) => (
          <motion.div className="lp-step" key={step.title} variants={fadeUp}>
            <div className="lp-step__num">
              <span className="lp-step__icon">{step.icon}</span>
            </div>
            <h3 className="lp-step__title">
              {i + 1}. {step.title}
            </h3>
            <p className="lp-step__desc">{step.desc}</p>
          </motion.div>
        ))}
      </RevealGroup>
    </section>
  );
}

/* ===================== FEATURES ===================== */
const FEATURES = [
  {
    icon: "🗣️",
    title: "يتكلم لهجة عميلك فيثق ويشتري",
    desc: "يفهم اللهجة العراقية والأسئلة الناقصة والسريعة، ويرد بأسلوب إنساني دافئ يبني ثقة تقرّب البيع.",
    preview: "chat",
  },
  {
    icon: "🔁",
    title: "ما يترك عميلًا يهرب",
    desc: "يعيد تنشيط من توقّف في منتصف المحادثة بلباقة، ويستعيد صفقات كنت ستخسرها بصمت.",
    preview: "recovery",
  },
  {
    icon: "📊",
    title: "تشوف فلوسك تكبر لحظة بلحظة",
    desc: "لوحة تحكم حية بالإيرادات والطلبات ومعدل التحويل بالدينار، مع مراقبة كل محادثة أولًا بأول.",
    preview: "analytics",
  },
  {
    icon: "🧠",
    title: "يعامل الزبون كأنه يعرفه",
    desc: "يتذكّر عملاءك المتكررين ومشترياتهم السابقة، فيمنحهم تجربة شخصية تجعلهم يرجعون دائمًا.",
    preview: "memory",
  },
];

export function Features() {
  return (
    <section className="lp-section lp-shell" id="features">
      <SectionHead
        eyebrow="ليش يبيع أكثر منك"
        title={<>ما تراه ليست ميزات... <span className="lp-gtext">بل طلبات إضافية</span></>}
        lead="كل قدرة هنا وُجدت لسبب واحد: تحويل محادثة عابرة إلى طلب مؤكد."
      />
      <div className="lp-feat">
        {FEATURES.map((feature, i) => (
          <Reveal className={`lp-feat__row${i % 2 === 1 ? " is-rev" : ""}`} key={feature.title}>
            <div className="lp-feat__text">
              <div className="lp-feat__ico">{feature.icon}</div>
              <h3 className="lp-feat__title">{feature.title}</h3>
              <p className="lp-feat__desc">{feature.desc}</p>
            </div>
            <div className="lp-feat__preview">
              <FeaturePreview type={feature.preview} />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function FeaturePreview({ type }) {
  if (type === "chat") {
    return (
      <>
        <div className="lp-pv-bubble lp-pv-bubble--in">شكد سعر الحذاء الأبيض؟</div>
        <div className="lp-pv-bubble lp-pv-bubble--out">
          سعره 75,000 د.ع ومتوفر بمقاسك 👟 تحب أثبتلك الطلب؟
        </div>
      </>
    );
  }
  if (type === "reco") {
    return (
      <>
        <div className="lp-pv-bubble lp-pv-bubble--in">أدور هدية لأخوي</div>
        <div className="lp-pv-chips">
          <span className="lp-pv-chip lp-pv-chip--hot">ساعة يد فاخرة</span>
          <span className="lp-pv-chip">محفظة جلد</span>
          <span className="lp-pv-chip">عطر رجالي</span>
        </div>
      </>
    );
  }
  if (type === "recovery") {
    return (
      <>
        <div className="lp-pv-recovery">
          <div className="lp-pv-recovery__ico">🔔</div>
          <div>
            <div className="lp-pv-recovery__t">متابعة تلقائية</div>
            <div className="lp-pv-recovery__s">«هلا! لا زال المنتج متوفرًا، تحب نكمّل الطلب؟»</div>
          </div>
        </div>
        <div className="lp-pv-bubble lp-pv-bubble--out">أعاد تنشيط العميل بنجاح ✅</div>
      </>
    );
  }
  if (type === "search") {
    return (
      <>
        <div className="lp-pv-search">🔎 حذا رياضي ابيض 42…</div>
        <div className="lp-pv-chips">
          <span className="lp-pv-chip lp-pv-chip--hot">حذاء رياضي كلاسيك · أبيض · 42</span>
        </div>
      </>
    );
  }
  if (type === "analytics") {
    return (
      <div className="lp-pv-bars" aria-hidden="true">
        {[45, 62, 50, 78, 66, 92, 84].map((h, i) => (
          <motion.span
            key={i}
            initial={{ scaleY: 0 }}
            whileInView={{ scaleY: h / 100 }}
            viewport={{ once: true }}
            transition={{ delay: 0.06 * i, duration: 0.55, ease: "easeOut" }}
            style={{ height: "100%" }}
          />
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="lp-pv-memory">
        <div className="lp-pv-memory__ico">🧠</div>
        <div>
          <div className="lp-pv-memory__t">محمد — عميل متكرر</div>
          <div className="lp-pv-memory__s">آخر طلب: حذاء مقاس 42 · يفضّل الدفع عند الاستلام</div>
        </div>
      </div>
      <div className="lp-pv-bubble lp-pv-bubble--out">أهلاً محمد! نفس المقاس المعتاد؟ 😊</div>
    </>
  );
}

/* ===================== COMPARISON ===================== */
const CMP = [
  { label: "سرعة الرد", manual: "دقائق إلى ساعات", shopiq: "ثوانٍ — رد فوري", v: true },
  { label: "التوفّر", manual: "أوقات العمل فقط", shopiq: "24/7 بلا انقطاع", v: true },
  { label: "قابلية التوسّع", manual: "محدودة بطاقتك", shopiq: "مئات المحادثات دفعة واحدة", v: true },
  { label: "الاتساق", manual: "يتأثر بالمزاج والتعب", shopiq: "نفس الجودة كل مرة", v: true },
  { label: "اللغة", manual: "حسب الموظف", shopiq: "عربية طبيعية دائمًا", v: true },
];

export function Comparison() {
  return (
    <section className="lp-section lp-shell" id="compare">
      <SectionHead
        eyebrow="عالمان"
        title={<>إنترنت صامت... <span className="lp-gtext">أو إنترنت حيّ</span></>}
        lead="المتاجر التي تنتظر، مقابل المتاجر التي تتكلّم وتبيع. في أي جهة تريد أن يكون متجرك؟"
      />
      <Reveal className="lp-cmp">
        <div className="lp-cmp__row is-head">
          <div className="lp-cmp__cell is-label" />
          <div className="lp-cmp__cell is-manual">
            <span className="lp-cmp__head">الرد اليدوي</span>
          </div>
          <div className="lp-cmp__cell is-shopiq">
            <span className="lp-cmp__head lp-cmp__head--shopiq">
              <img src={PRODUCT_LOGO_URL} alt="" style={{ width: 20, height: 20, borderRadius: 6 }} />
              {PRODUCT_NAME}
            </span>
          </div>
        </div>
        {CMP.map((row) => (
          <div className="lp-cmp__row" key={row.label}>
            <div className="lp-cmp__cell is-label" data-label="المعيار">
              {row.label}
            </div>
            <div className="lp-cmp__cell is-manual" data-label="الرد اليدوي">
              <span className="lp-cmp__x">✕</span> {row.manual}
            </div>
            <div className="lp-cmp__cell is-shopiq" data-label={PRODUCT_NAME}>
              <span className="lp-cmp__v">✓</span> {row.shopiq}
            </div>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

/* ===================== FINAL CTA ===================== */
export function FinalCta({ onStartTrial }) {
  return (
    <section className="lp-section lp-shell" id="resources">
      <Reveal className="lp-final__card">
        <h2 className="lp-final__title">
          متجرك، لكن <span className="lp-gtext">حيّ</span>.
        </h2>
        <p className="lp-final__sub">
          آلاف المتاجر ما زالت رفوفًا صامتة. اجعل متجرك يفهم، يتكلّم، ويبيع بنفسه.
        </p>
        <div className="lp-final__cta">
          <button
            type="button"
            className="lp-btn lp-btn--gradient lp-btn--lg lp-btn--glow"
            onClick={onStartTrial}
          >
            أيقظ متجرك الآن
          </button>
        </div>
        <p className="lp-final__note">٥ دقائق إعداد · بدون بطاقة ائتمانية · تلغي متى ما تريد.</p>
      </Reveal>
    </section>
  );
}

/* ===================== FOOTER ===================== */
export function Footer({ onScrollTo }) {
  const go = (id) => (e) => {
    e.preventDefault();
    onScrollTo(id);
  };
  return (
    <footer className="lp-foot">
      <div className="lp-foot__inner">
        <div className="lp-foot__brand">
          <img className="lp-brand__logo" src={PRODUCT_LOGO_URL} alt={PRODUCT_NAME} />
          <span className="lp-brand__name">{PRODUCT_NAME}</span>
        </div>
        <nav className="lp-foot__links" aria-label="روابط التذييل">
          <a href="#features" onClick={go("features")}>الميزات</a>
          <a href="#how" onClick={go("how")}>كيف يعمل</a>
          <a href="#faq" onClick={go("faq")}>الأسئلة الشائعة</a>
          <a href="/privacy">سياسة الخصوصية</a>
        </nav>
        <p className="lp-foot__copy">
          © {new Date().getFullYear()} {PRODUCT_NAME} — كل الحقوق محفوظة.
        </p>
      </div>
    </footer>
  );
}
