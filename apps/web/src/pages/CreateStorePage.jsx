import { useMemo, useState } from "react";
import { apiUrl } from "../lib/api";
import { rememberPublicStoreSlug } from "../lib/publicStoreSlug";
import { storeAuth } from "../lib/auth";
import { throwIfNotOk, userErrorMessage, withNetworkError } from "../lib/apiErrors";
import {
  DEFAULT_PAYMENT_OPTIONS,
  REPLY_DIALECT_OPTIONS,
  STORE_CURRENCY_OPTIONS,
  STORE_VERTICAL_OPTIONS,
} from "../lib/storeOnboarding";
import { BrandMark } from "../components/BrandMark";
import "./CreateStorePage.css";

function normalizeSlugPreview(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateStorePage({ onDone, onBackToLogin }) {
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [storeVertical, setStoreVertical] = useState("clothing");
  const [replyDialect, setReplyDialect] = useState("iraqi");
  const [currencyCode, setCurrencyCode] = useState("IQD");
  const [defaultPayment, setDefaultPayment] = useState("cod");
  const [sellSummary, setSellSummary] = useState("");
  const [deliveryInfo, setDeliveryInfo] = useState("");
  const [policyText, setPolicyText] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const slugPreview = useMemo(() => normalizeSlugPreview(slug), [slug]);

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (password !== password2) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    if (!storeVertical) {
      setError("اختر نوع المتجر.");
      return;
    }

    setLoading(true);
    try {
      await withNetworkError(async () => {
        const res = await fetch(apiUrl("/api/auth/create-store"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            store_name: storeName.trim(),
            slug: slug.trim() || undefined,
            phone: phone.trim() || undefined,
            store_vertical: storeVertical,
            reply_dialect: replyDialect,
            currency_code: currencyCode,
            default_payment: defaultPayment,
            sell_summary: sellSummary.trim() || undefined,
            delivery_info: deliveryInfo.trim() || undefined,
            policy_text: policyText.trim() || undefined,
            owner_name: ownerName.trim(),
            email: email.trim(),
            password,
          }),
        });
        const body = await res.json().catch(() => ({}));
        throwIfNotOk(res, body, { fallback: "تعذر إنشاء المتجر." });

        const createdSlug = body.data?.store?.slug;
        if (createdSlug) {
          rememberPublicStoreSlug(createdSlug);
        }

        if (!body?.data?.token || !body?.data?.user?.id) {
          throw new Error("استجابة السيرفر ناقصة — لم يصل التوكن أو بيانات المستخدم.");
        }

        storeAuth(body.data);
        onDone?.(body.data);
      });
    } catch (err) {
      setError(userErrorMessage(err, { fallback: "تعذر إنشاء المتجر." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="create-store">
      <div className="create-store__card">
        <div className="create-store__brand">
          <BrandMark showTagline={false} />
        </div>
        <p className="create-store__eyebrow">بداية جديدة</p>
        <h1>أنشئ متجرك</h1>
        <p className="create-store__lead">
          نجهّز مساعد المبيعات حسب نوع متجرك ولهجتك. بعد الإنشاء يمكنك تعديل كل شيء من
          الإعدادات.
        </p>

        <form onSubmit={submit}>
          <label>
            اسم المتجر (يظهر للعملاء)
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              required
              minLength={2}
              autoComplete="organization"
            />
          </label>

          <label>
            رابط المتجر (إنجليزي، اختياري — مثل my-brand)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="يُولَّد تلقائيًا من الاسم إن تُرك فارغًا"
            />
            {slugPreview ? (
              <span className="create-store__hint">معاينة: {slugPreview}</span>
            ) : null}
          </label>

          <label>
            هاتف المتجر
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
            />
          </label>

          <p className="create-store__section">إعداد المساعد والمتجر</p>

          <label>
            نوع المتجر
            <select
              value={storeVertical}
              onChange={(e) => setStoreVertical(e.target.value)}
              required
            >
              {STORE_VERTICAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            لهجة الرد مع العملاء
            <select
              value={replyDialect}
              onChange={(e) => setReplyDialect(e.target.value)}
              required
            >
              {REPLY_DIALECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            العملة
            <select
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              required
            >
              {STORE_CURRENCY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            طريقة الدفع الافتراضية
            <select
              value={defaultPayment}
              onChange={(e) => setDefaultPayment(e.target.value)}
              required
            >
              {DEFAULT_PAYMENT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            ماذا تبيع؟ (جملة قصيرة)
            <input
              value={sellSummary}
              onChange={(e) => setSellSummary(e.target.value)}
              placeholder="مثال: جاكيتات وشنط نسائية"
              maxLength={280}
            />
          </label>

          <label>
            معلومات التوصيل (اختياري)
            <textarea
              value={deliveryInfo}
              onChange={(e) => setDeliveryInfo(e.target.value)}
              rows={2}
              placeholder="مثال: توصيل لكل المحافظات خلال 2–4 أيام"
            />
          </label>

          <label>
            سياسة الاستبدال / الإرجاع (اختياري)
            <textarea
              value={policyText}
              onChange={(e) => setPolicyText(e.target.value)}
              rows={2}
              placeholder="مثال: استبدال المقاس خلال 3 أيام"
            />
          </label>

          <hr className="create-store__hr" />

          <label>
            اسمك كمالك
            <input
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>

          <label>
            البريد الإلكتروني (لتسجيل الدخول)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label>
            كلمة المرور (6 أحرف على الأقل)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          <label>
            تأكيد كلمة المرور
            <input
              type="password"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </label>

          {error ? <p className="create-store__error">{error}</p> : null}

          <button type="submit" disabled={loading}>
            {loading ? "جاري الإنشاء…" : "إنشاء المتجر والدخول"}
          </button>
        </form>

        <div className="create-store__footer">
          <button type="button" className="create-store__linkish" onClick={onBackToLogin}>
            لدي حساب بالفعل — دخول المالك
          </button>
        </div>
      </div>
    </section>
  );
}
