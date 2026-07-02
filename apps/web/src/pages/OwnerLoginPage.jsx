import { useState } from "react";
import { apiUrl } from "../lib/api";
import { storeAuth } from "../lib/auth";
import { throwIfNotOk, userErrorMessage, withNetworkError } from "../lib/apiErrors";
import { BrandMark } from "../components/BrandMark";
import "./OwnerLoginPage.css";

export function OwnerLoginPage({ onAuthenticated, onGoCreateStore }) {
  const [mode, setMode] = useState("login");
  const [storeId, setStoreId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitAuth(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (mode === "register") {
      const sid = Number(String(storeId).trim());
      if (!Number.isInteger(sid) || sid <= 0) {
        setError("أدخل معرّف المتجر (رقمًا صحيحًا يطابق المتجر الذي تريد ربط حسابك به).");
        setLoading(false);
        return;
      }
      if (!String(name).trim()) {
        setError("الاسم مطلوب.");
        setLoading(false);
        return;
      }
    }

    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      mode === "register"
        ? {
            store_id: Number(String(storeId).trim()),
            name,
            email,
            password,
          }
        : {
            email,
            password,
          };

    try {
      await withNetworkError(async () => {
        const res = await fetch(apiUrl(endpoint), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));
        throwIfNotOk(res, body, { fallback: "تعذر تسجيل الدخول." });

        if (!body?.data?.token || !body?.data?.user?.id) {
          throw new Error("استجابة السيرفر ناقصة — لم يصل التوكن أو بيانات المستخدم.");
        }

        storeAuth(body.data);
        onAuthenticated(body.data);
      });
    } catch (err) {
      setError(userErrorMessage(err, { fallback: "تعذر تسجيل الدخول." }));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="owner-login">
      <div className="owner-login__card">
        <div className="owner-login__brand">
          <BrandMark showTagline={false} />
        </div>
        <p className="owner-login__eyebrow">Owner Access</p>
        <h1>{mode === "register" ? "إنشاء حساب مالك" : "دخول صاحب المتجر"}</h1>
        <p>
          لوحة التحكم والطلبات تحتاج حساب مالك. متجر العميل يبقى مفتوحًا للزوار.
        </p>

        <form onSubmit={submitAuth}>
          {mode === "register" && (
            <>
              <label>
                معرّف المتجر (store_id)
                <input
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  inputMode="numeric"
                  placeholder="مثال: 2"
                  autoComplete="off"
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

          <button
            type="submit"
            disabled={
              loading ||
              !email ||
              !password ||
              (mode === "register" &&
                (!String(storeId).trim() || !String(name).trim()))
            }
          >
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
            setStoreId("");
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
