import { useState } from "react";
import { adminFetch, setAdminApiKey, clearAdminApiKey } from "../lib/adminApi";
import { messageFromApiResponse, throwIfNotOk, userErrorMessage, withNetworkError } from "../lib/apiErrors";
import "./SuperAdminLoginPage.css";

export function SuperAdminLoginPage({ onSuccess, onBack }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const trimmed = key.trim();
    if (!trimmed) {
      setError("أدخل مفتاح الإدارة.");
      return;
    }
    setLoading(true);
    clearAdminApiKey();
    setAdminApiKey(trimmed);
    try {
      await withNetworkError(async () => {
        const res = await adminFetch("/api/admin/stores?limit=1");
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          clearAdminApiKey();
          setError(messageFromApiResponse(res, body, { fallback: "مفتاح غير صالح أو الخادم غير مهيأ." }));
          return;
        }
        onSuccess?.();
      });
    } catch (err) {
      clearAdminApiKey();
      setError(userErrorMessage(err, { fallback: "تعذر الاتصال بالخادم." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="super-admin-login" dir="rtl">
      <div className="super-admin-login__card">
        <h1 className="super-admin-login__title">دخول إدارة المنصة</h1>
        <p className="super-admin-login__lead">
          يتطلب مفتاحًا من الخادم (<code dir="ltr">ADMIN_API_KEY</code>). لا يشارك هذا المفتاح مع أصحاب
          المتاجر.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="super-admin-login__label">
            <span>مفتاح الإدارة</span>
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(ev) => setKey(ev.target.value)}
              placeholder="••••••••"
              dir="ltr"
            />
          </label>
          {error ? (
            <p className="super-admin-login__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="super-admin-login__actions">
            <button type="submit" className="dm-btn dm-btn--primary" disabled={loading}>
              {loading ? "جاري التحقق…" : "متابعة"}
            </button>
            <button type="button" className="dm-btn dm-btn--ghost" onClick={onBack}>
              رجوع
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
