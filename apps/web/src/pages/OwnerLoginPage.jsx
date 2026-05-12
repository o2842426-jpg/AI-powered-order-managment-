import { useState } from "react";
import { apiUrl } from "../lib/api";
import { storeAuth } from "../lib/auth";
import "./OwnerLoginPage.css";

const DEFAULT_STORE_ID = "1";

export function OwnerLoginPage({ onAuthenticated, onGoCreateStore }) {
  const [mode, setMode] = useState("login");
  const [storeId, setStoreId] = useState(DEFAULT_STORE_ID);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitAuth(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      mode === "register"
        ? {
            store_id: Number(storeId),
            name,
            email,
            password,
          }
        : {
            email,
            password,
          };

    try {
      const res = await fetch(apiUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تسجيل الدخول (${res.status})`);
      }

      storeAuth(body.data);
      onAuthenticated(body.data);
    } catch (err) {
      setError(err.message || "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="owner-login">
      <div className="owner-login__card">
        <p className="owner-login__eyebrow">Owner Access</p>
        <h1>{mode === "register" ? "إنشاء حساب مالك" : "دخول صاحب المتجر"}</h1>
        <p>
          لوحة التحكم والطلبات تحتاج حساب مالك. متجر العميل يبقى مفتوحًا للزوار.
        </p>

        <form onSubmit={submitAuth}>
          {mode === "register" && (
            <>
              <label>
                Store ID
                <input
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  inputMode="numeric"
                />
              </label>
              <label>
                الاسم
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            </>
          )}

          <label>
            البريد الإلكتروني
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && <p className="owner-login__error">{error}</p>}

          <button type="submit" disabled={loading || !email || !password}>
            {loading
              ? "جاري المعالجة..."
              : mode === "register"
                ? "إنشاء الحساب"
                : "دخول"}
          </button>
        </form>

        <button
          type="button"
          className="owner-login__switch"
          onClick={() => {
            setMode((value) => (value === "login" ? "register" : "login"));
            setError("");
          }}
        >
          {mode === "login" ? "ليس لديك حساب؟ أنشئ حسابًا" : "لديك حساب؟ سجل دخول"}
        </button>

        {typeof onGoCreateStore === "function" ? (
          <button type="button" className="owner-login__switch" onClick={() => onGoCreateStore()}>
            ليس لديك متجر؟ أنشئ متجرًا جديدًا
          </button>
        ) : null}
      </div>
    </section>
  );
}
