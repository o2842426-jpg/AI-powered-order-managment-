import { useCallback, useEffect, useRef, useState } from "react";
import { authFetch, getOwnerStoreIdFromAuth } from "../lib/auth";
import "./OwnerConversationsPage.css";

function formatDt(iso) {
  if (!iso) return "—";
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return String(iso);
  try {
    return new Intl.DateTimeFormat("ar", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(t));
  } catch {
    return String(iso);
  }
}

export function OwnerConversationsPage({ billingStatus, onGoUpgrade }) {
  const storeId = getOwnerStoreIdFromAuth();
  const caps = billingStatus?.capabilities;
  const canHumanTakeover =
    !billingStatus?.billing_enforced ||
    (Array.isArray(caps) && caps.includes("human_takeover"));
  const canFollowupTasks =
    !billingStatus?.billing_enforced ||
    (Array.isArray(caps) && caps.includes("followup_tasks"));
  const [followupTasks, setFollowupTasks] = useState([]);
  const [followupTasksLoading, setFollowupTasksLoading] = useState(false);
  const [followupTasksError, setFollowupTasksError] = useState("");
  const [followupActionId, setFollowupActionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [takeoverSaving, setTakeoverSaving] = useState(false);
  const [takeoverGateError, setTakeoverGateError] = useState("");
  const [ownerComposerText, setOwnerComposerText] = useState("");
  const [ownerSending, setOwnerSending] = useState(false);
  const [ownerSendError, setOwnerSendError] = useState("");

  const loadSessions = useCallback(async () => {
    if (!storeId) {
      setSessions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const q = search.trim() ? `&q=${encodeURIComponent(search.trim())}` : "";
      const res = await authFetch(
        `/api/stores/${encodeURIComponent(storeId)}/chat-sessions?limit=80${q}`
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === "PLAN_REQUIRED") {
        setSessions([]);
        setError("PLAN_REQUIRED");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message || `تعذّر التحميل (${res.status})`);
      }
      setSessions(Array.isArray(body.data) ? body.data : []);
    } catch (e) {
      setError(e.message || "تعذّر تحميل المحادثات.");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, search]);

  const loadSessionsRef = useRef(loadSessions);
  loadSessionsRef.current = loadSessions;

  const fetchSessionDetail = useCallback(
    async (sessionId, { silent = true } = {}) => {
      if (!storeId || !sessionId) return null;
      if (!silent) {
        setDetailError("");
        setDetailLoading(true);
      }
      try {
        const res = await authFetch(
          `/api/stores/${encodeURIComponent(storeId)}/chat-sessions/${encodeURIComponent(sessionId)}`
        );
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && body.code === "PLAN_REQUIRED") {
          if (!silent) {
            setDetailError("PLAN_REQUIRED");
            setDetail(null);
          }
          return null;
        }
        if (!res.ok) {
          if (silent && res.status === 404) {
            setDetailError("الجلسة لم تعد متوفرة.");
            setDetail(null);
            setSelectedId(null);
            void loadSessionsRef.current();
          } else if (!silent) {
            setDetailError(body.message || `تعذّر التحميل (${res.status})`);
          }
          return null;
        }
        const data = body.data ?? null;
        setDetail(data);
        return data;
      } catch (e) {
        if (!silent) {
          setDetailError(e.message || "تعذّر فتح المحادثة.");
        }
        return null;
      } finally {
        if (!silent) {
          setDetailLoading(false);
        }
      }
    },
    [storeId]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadFollowupTasks = useCallback(async () => {
    if (!storeId || !canFollowupTasks || error === "PLAN_REQUIRED") {
      setFollowupTasks([]);
      setFollowupTasksError("");
      setFollowupTasksLoading(false);
      return;
    }
    setFollowupTasksLoading(true);
    setFollowupTasksError("");
    try {
      const res = await authFetch(`/api/stores/${encodeURIComponent(storeId)}/followup-tasks`);
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === "PLAN_REQUIRED") {
        setFollowupTasks([]);
        setFollowupTasksError("PLAN_REQUIRED");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message || `تعذّر التحميل (${res.status})`);
      }
      setFollowupTasks(Array.isArray(body.data) ? body.data : []);
    } catch (e) {
      setFollowupTasksError(e.message || "تعذّر تحميل مقترحات المتابعة.");
      setFollowupTasks([]);
    } finally {
      setFollowupTasksLoading(false);
    }
  }, [storeId, canFollowupTasks, error]);

  useEffect(() => {
    void loadFollowupTasks();
  }, [loadFollowupTasks, sessions]);

  async function resolveFollowupTask(taskId, status) {
    if (!storeId || !taskId) return;
    setFollowupActionId(taskId);
    setFollowupTasksError("");
    try {
      const res = await authFetch(
        `/api/stores/${encodeURIComponent(storeId)}/followup-tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === "PLAN_REQUIRED") {
        setFollowupTasksError("PLAN_REQUIRED");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message || `تعذّر التحديث (${res.status})`);
      }
      setFollowupTasks((prev) => prev.filter((t) => t.id !== taskId));
      await loadSessions();
      await loadFollowupTasks();
    } catch (e) {
      setFollowupTasksError(e.message || "تعذّر تحديث المهمة.");
    } finally {
      setFollowupActionId(null);
    }
  }

  async function openSession(id) {
    if (!storeId || !id) return;
    setSelectedId(id);
    setDetail(null);
    setDetailError("");
    setTakeoverGateError("");
    setOwnerSendError("");
    setOwnerComposerText("");
    await fetchSessionDetail(id, { silent: false });
  }

  useEffect(() => {
    if (!selectedId || !storeId) return;
    let stopped = false;

    async function poll() {
      if (stopped || document.visibilityState === "hidden") return;
      await fetchSessionDetail(selectedId, { silent: true });
    }

    const intervalId = window.setInterval(poll, 6000);
    function onVisibility() {
      if (document.visibilityState === "visible") {
        void poll();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [selectedId, storeId, fetchSessionDetail]);

  async function setTakeoverEnabled(enabled) {
    if (!storeId || !selectedId || !canHumanTakeover) return;
    setTakeoverSaving(true);
    setTakeoverGateError("");
    try {
      const res = await authFetch(
        `/api/stores/${encodeURIComponent(storeId)}/chat-sessions/${encodeURIComponent(selectedId)}/takeover`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === "PLAN_REQUIRED") {
        setTakeoverGateError("PLAN_REQUIRED");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message || `تعذّر التحديث (${res.status})`);
      }
      const nextSession = body.data?.session;
      if (nextSession) {
        setDetail((d) => (d ? { ...d, session: { ...d.session, ...nextSession } } : d));
      }
      await loadSessions();
    } catch (e) {
      setTakeoverGateError(e.message || "تعذّر تحديث وضع التولّي.");
    } finally {
      setTakeoverSaving(false);
    }
  }

  async function sendOwnerReply(e) {
    e?.preventDefault?.();
    const text = ownerComposerText.trim();
    if (!storeId || !selectedId || !text) return;
    setOwnerSending(true);
    setOwnerSendError("");
    try {
      const res = await authFetch(
        `/api/stores/${encodeURIComponent(storeId)}/chat-sessions/${encodeURIComponent(selectedId)}/owner-messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message_text: text }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 403 && body.code === "PLAN_REQUIRED") {
        setOwnerSendError("PLAN_REQUIRED");
        return;
      }
      if (res.status === 409 && body.code === "TAKEOVER_REQUIRED") {
        setOwnerSendError("TAKEOVER_REQUIRED");
        return;
      }
      if (!res.ok) {
        throw new Error(body.message || `تعذّر الإرسال (${res.status})`);
      }
      setOwnerComposerText("");
      if (Array.isArray(body.data?.messages)) {
        setDetail((d) => (d ? { ...d, messages: body.data.messages } : d));
      }
      await loadSessions();
    } catch (e) {
      setOwnerSendError(e.message || "تعذّر إرسال الرسالة.");
    } finally {
      setOwnerSending(false);
    }
  }

  if (!storeId) {
    return (
      <div className="owner-conv owner-conv--empty">
        <p>لم يُعثر على معرّف المتجر. سجّل الخروج ثم الدخول مجددًا.</p>
      </div>
    );
  }

  if (error === "PLAN_REQUIRED") {
    return (
      <div className="owner-conv owner-conv--gate">
        <h1>المحادثات</h1>
        <p>
          لوحة المحادثات متاحة من خطة <strong>Growth</strong> فما فوق — تتبّع كل جلسات العملاء، آخر
          الرسائل، والنشاط من مكان واحد.
        </p>
        {billingStatus?.billing_enforced ? (
          <button type="button" className="dm-btn dm-btn--primary" onClick={() => onGoUpgrade?.()}>
            ترقية الخطة
          </button>
        ) : (
          <p className="owner-conv__hint muted">
            محليًا: عند تفعيل Stripe واختيار خطة Growth أو Pro سيُفتح هذا القسم تلقائيًا.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="owner-conv">
      <header className="owner-conv__head">
        <div>
          <p className="owner-conv__eyebrow">تشغيل المبيعات</p>
          <h1>المحادثات</h1>
          <p className="owner-conv__lead">
            جلسات شات المتجر العامة — آخر نشاط، معاينة سريعة، وافتح الجلسة لقراءة كامل الخيط.
          </p>
        </div>
        <div className="owner-conv__toolbar">
          <label className="owner-conv__search">
            <span className="visually-hidden">بحث في الرسائل</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث في نص الرسائل…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  loadSessions();
                }
              }}
            />
          </label>
          <button type="button" className="dm-btn dm-btn--secondary" onClick={loadSessions} disabled={loading}>
            {loading ? "جاري التحديث…" : "تحديث"}
          </button>
        </div>
      </header>

      {error && error !== "PLAN_REQUIRED" ? (
        <p className="owner-conv__error" role="alert">
          {error}
        </p>
      ) : null}

      {error !== "PLAN_REQUIRED" ? (
        canFollowupTasks ? (
          <section className="owner-conv__followups card" aria-label="مقترحات المتابعة">
            <div className="owner-conv__followups-head">
              <h2 className="owner-conv__followups-title">مقترحات المتابعة</h2>
              <p className="owner-conv__followups-desc">
                جلسات يكون فيها آخرُ كلام العميل — للتذكير فقط داخل لوحتك (لا إرسال تلقائي خارجي).
              </p>
              <button
                type="button"
                className="dm-btn dm-btn--ghost dm-btn--sm"
                onClick={() => void loadFollowupTasks()}
                disabled={followupTasksLoading}
              >
                {followupTasksLoading ? "جاري التحديث…" : "تحديث القائمة"}
              </button>
            </div>
            {followupTasksError === "PLAN_REQUIRED" ? (
              <p className="owner-conv__error">
                يتطلب خطة <strong>Pro</strong>.
                <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={() => onGoUpgrade?.()}>
                  ترقية
                </button>
              </p>
            ) : followupTasksError ? (
              <p className="owner-conv__error" role="alert">
                {followupTasksError}
              </p>
            ) : null}
            {followupTasksLoading && followupTasks.length === 0 ? (
              <p className="owner-conv__status">جاري التحميل…</p>
            ) : null}
            {!followupTasksLoading && followupTasks.length === 0 && !followupTasksError ? (
              <p className="owner-conv__muted">لا توجد مهام متابعة مفتوحة حاليًا.</p>
            ) : null}
            {followupTasks.length > 0 ? (
              <ul className="owner-conv__followups-list">
                {followupTasks.map((t) => (
                  <li key={t.id} className="owner-conv__followup-row">
                    <div className="owner-conv__followup-main">
                      <p className="owner-conv__followup-title" dir="auto">
                        {t.title}
                      </p>
                      <p className="owner-conv__followup-meta">
                        جلسة #{t.session_id}
                        {t.customer_name || t.customer_phone
                          ? ` · ${t.customer_name || ""}${t.customer_phone ? ` — ${t.customer_phone}` : ""}`
                          : ""}
                        {t.last_message_at ? ` · ${formatDt(t.last_message_at)}` : ""}
                      </p>
                      {t.last_message_preview ? (
                        <p className="owner-conv__followup-preview" dir="auto">
                          {t.last_message_preview}
                        </p>
                      ) : null}
                    </div>
                    <div className="owner-conv__followup-actions">
                      <button
                        type="button"
                        className="dm-btn dm-btn--secondary dm-btn--sm"
                        disabled={followupActionId === t.id}
                        onClick={() => {
                          void openSession(t.session_id);
                        }}
                      >
                        فتح الجلسة
                      </button>
                      <button
                        type="button"
                        className="dm-btn dm-btn--ghost dm-btn--sm"
                        disabled={followupActionId === t.id}
                        onClick={() => void resolveFollowupTask(t.id, "dismissed")}
                      >
                        تجاهل
                      </button>
                      <button
                        type="button"
                        className="dm-btn dm-btn--primary dm-btn--sm"
                        disabled={followupActionId === t.id}
                        onClick={() => void resolveFollowupTask(t.id, "done")}
                      >
                        تم
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : billingStatus?.billing_enforced ? (
          <p className="owner-conv__hint muted owner-conv__followups-upsell">
            <strong>مقترحات المتابعة</strong> (جلسات بانتظار ردّك) متاحة في خطة <strong>Pro</strong> — بلا بريد ولا واتساب تلقائيًا.
            <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={() => onGoUpgrade?.()}>
              ترقية لـ Pro
            </button>
          </p>
        ) : null
      ) : null}

      <div className="owner-conv__layout">
        <section className="owner-conv__list card" aria-label="قائمة الجلسات">
          {loading && <p className="owner-conv__status">جاري التحميل…</p>}
          {!loading && sessions.length === 0 && (
            <p className="owner-conv__empty">لا توجد جلسات بعد — عندما يتحدث العملاء مع مساعد المتجر ستظهر هنا.</p>
          )}
          <ul className="owner-conv__sessions">
            {sessions.map((row) => {
              const active = selectedId === row.id;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    className={active ? "owner-conv__session is-active" : "owner-conv__session"}
                    onClick={() => openSession(row.id)}
                  >
                    <span className="owner-conv__session-id">
                      جلسة #{row.id}
                      {Number(row.owner_takeover) === 1 ? (
                        <span className="owner-conv__takeover-pill">يدوي</span>
                      ) : null}
                      {row.lead_score != null && row.lead_score !== "" ? (
                        <span
                          className="owner-conv__lead-pill"
                          title={row.lead_score_reason ? String(row.lead_score_reason) : undefined}
                        >
                          {Number(row.lead_score)}%
                        </span>
                      ) : null}
                    </span>
                    <span className="owner-conv__session-meta">
                      {formatDt(row.last_message_at || row.started_at)}
                      {row.message_count != null ? ` · ${row.message_count} رسالة` : ""}
                    </span>
                    {(row.customer_name || row.customer_phone) && (
                      <span className="owner-conv__session-customer" dir="auto">
                        {row.customer_name || "عميل"}
                        {row.customer_phone ? ` · ${row.customer_phone}` : ""}
                      </span>
                    )}
                    {row.last_message_preview ? (
                      <span className="owner-conv__session-preview">{row.last_message_preview}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="owner-conv__detail card" aria-label="تفاصيل الجلسة">
          {!selectedId && (
            <p className="owner-conv__placeholder">اختر جلسة من القائمة لعرض الرسائل.</p>
          )}
          {selectedId && detailLoading && <p className="owner-conv__status">جاري فتح الجلسة…</p>}
          {selectedId && detailError === "PLAN_REQUIRED" && (
            <p className="owner-conv__error">هذه الخاصية تتطلب خطة أعلى.</p>
          )}
          {selectedId && detailError && detailError !== "PLAN_REQUIRED" && (
            <p className="owner-conv__error" role="alert">
              {detailError}
            </p>
          )}
          {detail?.session && (
            <>
              <div className="owner-conv__detail-head">
                <h2>جلسة #{detail.session.id}</h2>
                <p className="owner-conv__detail-sub">
                  بدأت {formatDt(detail.session.started_at)}
                  {detail.session.last_message_at
                    ? ` · آخر نشاط ${formatDt(detail.session.last_message_at)}`
                    : ""}
                </p>
                {detail.session.lead_score != null && detail.session.lead_score !== "" ? (
                  <p className="owner-conv__lead-panel" dir="auto">
                    <strong>تقييم اهتمام (إرشادي):</strong> {Number(detail.session.lead_score)}/100
                    {detail.session.lead_score_reason ? (
                      <span className="owner-conv__lead-panel__why">
                        {" "}
                        — {String(detail.session.lead_score_reason)}
                      </span>
                    ) : null}
                  </p>
                ) : null}
                {(detail.session.customer_name || detail.session.customer_phone) && (
                  <p className="owner-conv__detail-customer" dir="auto">
                    <strong>العميل:</strong> {detail.session.customer_name || "—"}
                    {detail.session.customer_phone ? ` — ${detail.session.customer_phone}` : ""}
                  </p>
                )}
                <div className="owner-conv__takeover-bar">
                  <div>
                    <p className="owner-conv__takeover-title">الرد اليدوي (تولّي المحادثة)</p>
                    <p className="owner-conv__takeover-desc">
                      عند التفعيل يتوقّف المساعد الآلي عن الرد على هذا العميل في واجهة المتجر حتى تعطّل التولّي.
                    </p>
                  </div>
                  <label className="owner-conv__takeover-switch">
                    <span className="visually-hidden">تفعيل الرد اليدوي</span>
                    <input
                      type="checkbox"
                      checked={Number(detail.session.owner_takeover) === 1}
                      disabled={!canHumanTakeover || takeoverSaving || detailLoading}
                      onChange={(e) => setTakeoverEnabled(e.target.checked)}
                    />
                  </label>
                </div>
                {!canHumanTakeover && billingStatus?.billing_enforced ? (
                  <p className="owner-conv__takeover-hint muted">
                    التولّي اليدوي متاح من خطة <strong>Growth</strong> فما فوق.{" "}
                    <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={() => onGoUpgrade?.()}>
                      ترقية الخطة
                    </button>
                  </p>
                ) : null}
                {takeoverGateError === "PLAN_REQUIRED" ? (
                  <p className="owner-conv__error" role="alert">
                    هذه الخاصية تتطلب خطة أعلى.
                    <button type="button" className="dm-btn dm-btn--ghost dm-btn--sm" onClick={() => onGoUpgrade?.()}>
                      ترقية
                    </button>
                  </p>
                ) : takeoverGateError && takeoverGateError !== "PLAN_REQUIRED" ? (
                  <p className="owner-conv__error" role="alert">
                    {takeoverGateError}
                  </p>
                ) : null}
              </div>
              <ul className="owner-conv__thread">
                {(detail.messages || []).map((m) => (
                  <li
                    key={m.id}
                    className={
                      m.sender_type === "customer"
                        ? "owner-conv__bubble is-customer"
                        : m.sender_type === "owner"
                          ? "owner-conv__bubble is-owner"
                          : "owner-conv__bubble is-ai"
                    }
                  >
                    <span className="owner-conv__bubble-label">
                      {m.sender_type === "customer"
                        ? "العميل"
                        : m.sender_type === "owner"
                          ? "المالك"
                          : "المساعد"}
                    </span>
                    <p className="owner-conv__bubble-text">{m.message_text}</p>
                    {m.sender_type === "customer" && m.lead_score != null && m.lead_score !== "" ? (
                      <p className="owner-conv__bubble-lead" dir="auto">
                        تقييم الرسالة: {Number(m.lead_score)}/100
                        {m.lead_score_reason ? ` — ${String(m.lead_score_reason)}` : ""}
                      </p>
                    ) : null}
                    <time className="owner-conv__bubble-time">{formatDt(m.created_at)}</time>
                  </li>
                ))}
              </ul>
              <form className="owner-conv__owner-reply" onSubmit={sendOwnerReply}>
                <label className="owner-conv__owner-reply-label">
                  <span>ردّك كمالك (يظهر للعميل في المتجر)</span>
                  <textarea
                    rows={2}
                    value={ownerComposerText}
                    onChange={(e) => setOwnerComposerText(e.target.value)}
                    placeholder={
                      Number(detail.session.owner_takeover) === 1
                        ? "اكتب رسالتك…"
                        : "فعّل «الرد اليدوي» أعلاه لإرسال رسائل من هنا."
                    }
                    disabled={Number(detail.session.owner_takeover) !== 1 || ownerSending}
                  />
                </label>
                {ownerSendError === "PLAN_REQUIRED" ? (
                  <p className="owner-conv__error" role="alert">
                    الإرسال يتطلب خطة أعلى.
                  </p>
                ) : ownerSendError === "TAKEOVER_REQUIRED" ? (
                  <p className="owner-conv__error" role="alert">
                    فعّل الرد اليدوي أولًا ثم أعد الإرسال.
                  </p>
                ) : ownerSendError ? (
                  <p className="owner-conv__error" role="alert">
                    {ownerSendError}
                  </p>
                ) : null}
                <div className="owner-conv__owner-reply-actions">
                  <button
                    type="submit"
                    className="dm-btn dm-btn--primary"
                    disabled={
                      Number(detail.session.owner_takeover) !== 1 ||
                      ownerSending ||
                      !ownerComposerText.trim()
                    }
                  >
                    {ownerSending ? "جاري الإرسال…" : "إرسال للعميل"}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
