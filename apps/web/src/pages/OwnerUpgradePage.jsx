import { useMemo, useState } from "react";
import "./OwnerUpgradePage.css";

function formatTrialEnd(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return null;
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(d));
  } catch {
    return iso;
  }
}

/**
 * Feature bullets aligned with apps/api/src/modules/plans/planMatrix.js
 * and requirePlanFeature middleware — no unimplemented marketing claims.
 */
const PLAN_CATALOG = [
  {
    id: "starter",
    title: "Starter",
    price: "$19",
    blurb: "متجر كامل + مساعد AI + إحصائيات أساسية",
    bullets: [
      "متجر، منتجات، طلبات، ومخزون",
      "مساعد AI في واجهة المتجر ورسائل Instagram DM",
      "اقتراح منتجات وصور في المحادثة",
      "حتى 1,000 رسالة AI شهريًا",
      "إحصائيات أساسية: إيراد إجمالي وعدد العملاء والطلبات",
      "لا تشمل: لوحة المحادثات، الرد اليدوي، التحليلات المتقدمة، تقييم الاهتمام",
    ],
  },
  {
    id: "growth",
    title: "Growth",
    price: "$49",
    badge: "الأكثر شيوعًا",
    blurb: "لوحة المحادثات + تحليلات أعمق",
    bullets: [
      "كل ما في Starter",
      "حتى 10,000 رسالة AI شهريًا",
      "لوحة المحادثات (متجر + Instagram DM)",
      "الرد اليدوي (Takeover) وإرسال رسائل من لوحتك",
      "تحليلات متقدمة: CLV، الاحتفاظ، التخلي عن السلة، دوران المخزون، توقع المبيعات، مخطط الإيراد",
      "لا تشمل: ذاكرة AI، عبارات المتابعة، مهام المتابعة، تقييم الاهتمام",
    ],
  },
  {
    id: "pro",
    title: "Pro",
    price: "$99",
    blurb: "أدوات مبيعات AI المتقدمة",
    bullets: [
      "كل ما في Growth",
      "رسائل AI غير محدودة شهريًا (عمليًا)",
      "حقائق الذاكرة — يتذكرها المساعد في الردود",
      "عبارات المتابعة التي يدمجها AI طبيعيًا",
      "مهام متابعة مقترحة داخل لوحة المحادثات",
      "تقييم اهتمام العميل (Lead score) إرشادي",
    ],
  },
];

export function OwnerUpgradePage({ billingStatus, onStartCheckout, onPreviewStore }) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState("growth");
  const reason = billingStatus?.access_reason ?? "";
  const trialEndsLabel = useMemo(
    () => formatTrialEnd(billingStatus?.trial_ends_at),
    [billingStatus?.trial_ends_at]
  );

  const priceLine =
    typeof import.meta.env.VITE_UPGRADE_PRICE_AR === "string"
      ? import.meta.env.VITE_UPGRADE_PRICE_AR.trim()
      : "";
  const planBullets = String(import.meta.env.VITE_UPGRADE_PLAN_BULLETS || "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  const subline =
    reason === "in_trial" && trialEndsLabel
      ? `تنتهي تجربتك المجانية في ${trialEndsLabel}. فعّل الاشتراك الآن لتبقى لوحة التحكم والمساعد الذكي يعملان دون انقطاع.`
      : reason === "trial_expired"
        ? "انتهت الفترة التجريبية — منصبك الرقمي جاهز، لكنه يحتاج اشتراكًا ليبقى معك على مدار الساعة."
        : "فعّل الاشتراك ليواصل مساعد المبيعات الذكي الرد على عملائك فورًا من واجهة متجرك.";

  async function handleCheckout() {
    setCheckoutLoading(true);
    try {
      await onStartCheckout?.(checkoutPlan);
    } finally {
      setCheckoutLoading(false);
    }
  }

  const selectedPlan = PLAN_CATALOG.find((p) => p.id === checkoutPlan) || PLAN_CATALOG[1];
  const manualBilling = Boolean(billingStatus?.manual_billing);
  const manualPaymentNote =
    String(import.meta.env.VITE_MANUAL_PAYMENT_INSTRUCTIONS || "").trim() ||
    "حوّل قيمة الاشتراك إلى الحساب البنكي المتفق عليه، ثم أرسل إثبات التحويل (لقطة شاشة أو رقم العملية) عبر واتساب أو البريد. سيتم تفعيل خطتك من إدارة المنصة خلال ساعات العمل.";

  return (
    <div className="owner-upgrade" dir="rtl">
      <section className="owner-upgrade__hero" aria-labelledby="owner-upgrade-title">
        <div className="owner-upgrade__hero-inner">
          <p className="owner-upgrade__eyebrow">ترقية الخطة</p>
          <h1 id="owner-upgrade-title" className="owner-upgrade__title">
            رقِّ موظف المبيعات الرقمي لديك
          </h1>
          <p className="owner-upgrade__lead">
            الخطط أدناه تعكس ما يفرضه النظام فعليًا في الكود — بدون ميزات وهمية.
            التجربة المجانية (7 أيام) تعطيك نفس حدود Starter مع 1,000 رسالة AI شهريًا.
          </p>
          <p className="owner-upgrade__sub">{subline}</p>
          {manualBilling ? (
            <p className="owner-upgrade__manual-note" role="status">
              الدفع حالياً <strong>تحويل بنكي</strong> وليس عبر Stripe. اختر الخطة المناسبة أدناه، نفّذ
              التحويل، ثم تواصل معنا — نفعّل اشتراكك من لوحة الإدارة.
            </p>
          ) : null}
          <div className="owner-upgrade__plans" role="group" aria-label="اختر الخطة">
            {PLAN_CATALOG.map((card) => {
              const selected = checkoutPlan === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  className={
                    selected
                      ? "owner-upgrade__plan-card is-selected"
                      : "owner-upgrade__plan-card"
                  }
                  onClick={() => setCheckoutPlan(card.id)}
                >
                  {card.badge ? (
                    <span className="owner-upgrade__plan-badge">{card.badge}</span>
                  ) : null}
                  <span className="owner-upgrade__plan-name">{card.title}</span>
                  <span className="owner-upgrade__plan-price">{card.price}</span>
                  <span className="owner-upgrade__plan-period">/ شهر</span>
                  <span className="owner-upgrade__plan-blurb">{card.blurb}</span>
                </button>
              );
            })}
          </div>
          <div className="owner-upgrade__cta-row">
            {manualBilling ? (
              <div className="owner-upgrade__manual-box">
                <p className="owner-upgrade__manual-box-title">
                  لتفعيل {selectedPlan.title} ({selectedPlan.price}/شهر)
                </p>
                <p className="owner-upgrade__manual-box-text">{manualPaymentNote}</p>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="owner-upgrade__btn owner-upgrade__btn--primary owner-upgrade__btn--pulse"
                  disabled={checkoutLoading}
                  onClick={handleCheckout}
                >
                  {checkoutLoading ? "جاري التحويل…" : `فعّل ${selectedPlan.title} الآن`}
                </button>
                <button type="button" className="owner-upgrade__btn owner-upgrade__btn--ghost" onClick={onPreviewStore}>
                  معاينة المتجر كزائر
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="owner-upgrade__pricing" aria-labelledby="owner-upgrade-features-title">
        <h2 id="owner-upgrade-features-title" className="owner-upgrade__section-title">
          ما الذي تحصل عليه في {selectedPlan.title}؟
        </h2>
        <ul className="owner-upgrade__plan-bullets">
          {selectedPlan.bullets.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {priceLine ? <p className="owner-upgrade__price-line">{priceLine}</p> : null}
        {planBullets.length > 0 ? (
          <ul className="owner-upgrade__plan-bullets owner-upgrade__plan-bullets--env">
            {planBullets.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="owner-upgrade__compare" aria-labelledby="owner-upgrade-compare-title">
        <h2 id="owner-upgrade-compare-title" className="owner-upgrade__section-title">
          لماذا المساعد الذكي وليس فقط «شات بوت»؟
        </h2>
        <div className="owner-upgrade__cards">
          <article className="owner-upgrade__card owner-upgrade__card--muted">
            <h3>موظف بشري</h3>
            <ul>
              <li>ساعات محدودة وإجازات</li>
              <li>تكلفة ثابتة عالية كل شهر</li>
              <li>تذبذب في سرعة الرد وجودة الإجابة</li>
            </ul>
          </article>
          <article className="owner-upgrade__card owner-upgrade__card--accent">
            <span className="owner-upgrade__pill">موصى به</span>
            <h3>مساعد مبيعات بالذكاء الاصطناعي</h3>
            <ul>
              <li>متاح دائمًا — ليلًا، في العطل، في الذروة</li>
              <li>يعرف منتجاتك ومخزونك وأسعارك من قاعدة البيانات</li>
              <li>نبرة متسقة مع علامتك (قابلة للضبط من لوحتك)</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="owner-upgrade__trust" aria-label="ثقة وأمان">
        <h2 className="owner-upgrade__section-title">
          {manualBilling ? "تفعيل يدوي بعد التحويل" : "دفع آمن عبر Stripe"}
        </h2>
        <p className="owner-upgrade__trust-text">
          {manualBilling
            ? "بعد تأكيد التحويل البنكي، تُفعَّل خطتك يدوياً من إدارة المنصة. ستظهر الميزات (مثل المحادثات) فور تحديث حالة اشتراكك."
            : "تتم إدارة الاشتراك عبر Stripe: بوابة دفع معروفة، فواتير واضحة، وإمكانية إدارة الفوترة لاحقًا من حسابك بعد التفعيل."}
        </p>
      </section>

      {!manualBilling ? (
      <section className="owner-upgrade__footer-cta">
        <p>جاهز لتقليل الفرص الضائعة؟</p>
        <button
          type="button"
          className="owner-upgrade__btn owner-upgrade__btn--primary owner-upgrade__btn--wide owner-upgrade__btn--pulse"
          disabled={checkoutLoading}
          onClick={handleCheckout}
        >
          {checkoutLoading ? "جاري التحويل…" : `ابدأ ${selectedPlan.title}`}
        </button>
      </section>
      ) : null}
    </div>
  );
}
