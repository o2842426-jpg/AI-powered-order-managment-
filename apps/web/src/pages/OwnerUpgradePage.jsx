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

  const planCards = [
    {
      id: "starter",
      title: "Starter",
      price: "$19",
      blurb: "ردود AI، توصيات، حتى 1000 رسالة شهريًا",
    },
    {
      id: "growth",
      title: "Growth",
      price: "$49",
      badge: "الأكثر شيوعًا",
      blurb: "لوحة محادثات، تحليلات أعمق، حتى 10k رسالة",
    },
    {
      id: "pro",
      title: "Pro",
      price: "$99",
      blurb: "مبيعات AI متقدمة — رسائل غير محدودة عمليًا",
    },
  ];

  return (
    <div className="owner-upgrade" dir="rtl">
      <section className="owner-upgrade__hero" aria-labelledby="owner-upgrade-title">
        <div className="owner-upgrade__hero-inner">
          <p className="owner-upgrade__eyebrow">ترقية الخطة</p>
          <h1 id="owner-upgrade-title" className="owner-upgrade__title">
            رقِّ موظف المبيعات الرقمي لديك
          </h1>
          <p className="owner-upgrade__lead">
            كل رد متأخر هو عميل محتمل ضاع. حوّل رسائل إنستغرام وتيك توك إلى{" "}
            <strong>موظف مبيعات بالذكاء الاصطناعي يعمل 24/7</strong> داخل متجرك.
          </p>
          <blockquote className="owner-upgrade__quote">
            موظف واحد قد يكلفك مئات الدولارات شهريًا. مساعد المبيعات الذكي يبدأ من سعر رمزي —
            بنفس الاحتراف، وبلا تعب التوظيف والورديات.
          </blockquote>
          <p className="owner-upgrade__sub">{subline}</p>
          <div className="owner-upgrade__plans" role="group" aria-label="اختر الخطة">
            {planCards.map((card) => {
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
            <button
              type="button"
              className="owner-upgrade__btn owner-upgrade__btn--primary owner-upgrade__btn--pulse"
              disabled={checkoutLoading}
              onClick={handleCheckout}
            >
              {checkoutLoading ? "جاري التحويل…" : "فعّل الاشتراك الآن"}
            </button>
            <button type="button" className="owner-upgrade__btn owner-upgrade__btn--ghost" onClick={onPreviewStore}>
              معاينة المتجر كزائر
            </button>
          </div>
        </div>
      </section>

      {(priceLine || planBullets.length > 0) && (
        <section className="owner-upgrade__pricing" aria-labelledby="owner-upgrade-pricing-title">
          <h2 id="owner-upgrade-pricing-title" className="owner-upgrade__section-title">
            الخطة والتسعير
          </h2>
          {priceLine ? <p className="owner-upgrade__price-line">{priceLine}</p> : null}
          {planBullets.length > 0 ? (
            <ul className="owner-upgrade__plan-bullets">
              {planBullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

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
              <li>صعوبة توسيع نفس الأسلوب على كل العملاء</li>
            </ul>
          </article>
          <article className="owner-upgrade__card owner-upgrade__card--accent">
            <span className="owner-upgrade__pill">موصى به</span>
            <h3>مساعد مبيعات بالذكاء الاصطناعي</h3>
            <ul>
              <li>متاح دائمًا — ليلًا، في العطل، في الذروة</li>
              <li>يعرف منتجاتك ومخزونك وأسعارك من قاعدة البيانات</li>
              <li>نبرة متسقة مع علامتك (قابلة للضبط من لوحتك)</li>
              <li>يقود المحادثة نحو الطلب دون إزعاج</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="owner-upgrade__trust" aria-label="ثقة وأمان">
        <h2 className="owner-upgrade__section-title">دفع آمن عبر Stripe</h2>
        <p className="owner-upgrade__trust-text">
          تتم إدارة الاشتراك عبر Stripe: بوابة دفع معروفة، فواتير واضحة، وإمكانية إدارة
          الفوترة لاحقًا من حسابك بعد التفعيل.
        </p>
        <ul className="owner-upgrade__trust-list">
          <li>لا نخزّن بيانات بطاقتك على خوادمنا</li>
          <li>يمكنك إلغاء أو تعديل الاشتراك من بوابة الفوترة بعد أول دفع</li>
          <li>بيانات متجرك تبقى تحت حسابك</li>
        </ul>
      </section>

      <section className="owner-upgrade__footer-cta">
        <p>جاهز لتقليل الفرص الضائعة؟</p>
        <button
          type="button"
          className="owner-upgrade__btn owner-upgrade__btn--primary owner-upgrade__btn--wide owner-upgrade__btn--pulse"
          disabled={checkoutLoading}
          onClick={handleCheckout}
        >
          {checkoutLoading ? "جاري التحويل…" : "ابدأ الاشتراك"}
        </button>
      </section>
    </div>
  );
}
