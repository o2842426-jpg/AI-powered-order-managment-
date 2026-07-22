import { useEffect, useMemo, useRef, useState } from "react";
import { authFetch, getOwnerStoreIdFromAuth } from "../lib/auth";
import { throwIfNotOk, userErrorMessage } from "../lib/apiErrors";
import "./ManagerAiWidget.css";

const SUGGESTIONS = [
  "كم طلب جديد عندي؟",
  "شلون أربط إنستغرام؟",
  "ليش الطلب ما يطلع باللوحة؟",
  "عندي محادثات تحتاج تدخل بشري؟",
];

const WELCOME =
  "مرحباً — أنا مساعد المدير. اسألني عن طلباتك، إنستغرام، المحادثات، أو طريقة استخدام ShopIQ.";

/**
 * Pro-only floating owner copilot. Locked bubble + upgrade CTA when not entitled.
 */
export function ManagerAiWidget({ billingStatus, onUpgrade }) {
  const storeId = getOwnerStoreIdFromAuth();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", content: WELCOME },
  ]);
  const listRef = useRef(null);

  const entitled = useMemo(() => {
    if (!billingStatus?.billing_enforced) return true;
    const caps = billingStatus?.capabilities;
    return Array.isArray(caps) && caps.includes("owner_manager_ai");
  }, [billingStatus]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [open, messages, sending]);

  async function sendMessage(text) {
    const message = String(text || "").trim();
    if (!message || sending) return;
    if (!entitled) {
      onUpgrade?.();
      return;
    }
    if (!storeId) {
      setError("لم يُعثر على معرّف المتجر. أعد تسجيل الدخول.");
      return;
    }

    setError("");
    setDraft("");
    const nextMessages = [...messages, { role: "user", content: message }];
    setMessages(nextMessages);
    setSending(true);

    const history = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await authFetch(
        `/api/stores/${encodeURIComponent(storeId)}/manager-ai/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: "تعذّر الرد من مساعد المدير." });
      }
      const reply = String(body?.data?.reply || "").trim() || "لم يصل رد واضح.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setError(userErrorMessage(e, { fallback: "تعذّر الرد من مساعد المدير." }));
    } finally {
      setSending(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    void sendMessage(draft);
  }

  return (
    <div className="manager-ai" dir="rtl">
      {open ? (
        <section className="manager-ai__panel" aria-label="مساعد المدير">
          <header className="manager-ai__head">
            <div>
              <p className="manager-ai__title">مساعد المدير</p>
              <p className="manager-ai__sub">
                {entitled ? "Pro · مساعدة المنتج + بيانات متجرك" : "متوفر في باقة Pro"}
              </p>
            </div>
            <button
              type="button"
              className="manager-ai__icon-btn"
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
            >
              ×
            </button>
          </header>

          {!entitled ? (
            <div className="manager-ai__locked">
              <p>
                مساعد المدير خاص بباقة Pro: يشرح استخدام ShopIQ ويجيب من بيانات متجرك الحية
                (طلبات، مخزون، إنستغرام، محادثات).
              </p>
              <button type="button" className="manager-ai__upgrade" onClick={() => onUpgrade?.()}>
                ترقية إلى Pro
              </button>
            </div>
          ) : (
            <>
              <div className="manager-ai__messages" ref={listRef}>
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={
                      m.role === "user"
                        ? "manager-ai__bubble is-user"
                        : "manager-ai__bubble is-assistant"
                    }
                  >
                    {m.content}
                  </div>
                ))}
                {sending ? (
                  <div className="manager-ai__bubble is-assistant is-pending">جاري التفكير…</div>
                ) : null}
              </div>

              <div className="manager-ai__chips" aria-label="اقتراحات">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="manager-ai__chip"
                    disabled={sending}
                    onClick={() => void sendMessage(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {error ? <p className="manager-ai__error">{error}</p> : null}

              <form className="manager-ai__form" onSubmit={onSubmit}>
                <input
                  className="manager-ai__input"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="اسأل عن طلب، إعداد، أو مشكلة…"
                  disabled={sending}
                  maxLength={2000}
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="manager-ai__send"
                  disabled={sending || !draft.trim()}
                >
                  إرسال
                </button>
              </form>
            </>
          )}
        </section>
      ) : null}

      <button
        type="button"
        className={entitled ? "manager-ai__fab" : "manager-ai__fab is-locked"}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="مساعد المدير"
        title="مساعد المدير"
      >
        {open ? "إغلاق" : entitled ? "مساعد المدير" : "مساعد المدير · Pro"}
      </button>
    </div>
  );
}
