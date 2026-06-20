import { useCallback, useEffect, useState } from "react";
import { adminFetch, clearAdminApiKey } from "../lib/adminApi";
import { buildPublicStorefrontUrl } from "../lib/storefrontUrl";
import "./SuperAdminPage.css";

const STATUS_OPTIONS = ["active", "trial", "suspended", "trialing", "past_due", "unpaid"];

export function SuperAdminPage({ onExit }) {
  const [stores, setStores] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rowBusy, setRowBusy] = useState({});
  const [rowMsg, setRowMsg] = useState({});

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await adminFetch("/api/admin/stores?limit=100");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || "تعذر تحميل المتاجر.");
      }
      setStores(body.data?.stores ?? []);
      setTotal(Number(body.data?.total) || 0);
    } catch (e) {
      setError(e.message || "خطأ غير متوقع.");
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function patchStore(storeId, payload) {
    setRowBusy((b) => ({ ...b, [storeId]: true }));
    setRowMsg((m) => ({ ...m, [storeId]: "" }));
    try {
      const res = await adminFetch(`/api/admin/stores/${storeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || "فشل التحديث.");
      }
      setRowMsg((m) => ({ ...m, [storeId]: "تم الحفظ." }));
      await load();
    } catch (e) {
      setRowMsg((m) => ({ ...m, [storeId]: e.message || "خطأ." }));
    } finally {
      setRowBusy((b) => ({ ...b, [storeId]: false }));
    }
  }

  function leave() {
    clearAdminApiKey();
    onExit?.();
  }

  return (
    <div className="super-admin" dir="rtl">
      <header className="super-admin__header">
        <div>
          <h1 className="super-admin__title">إدارة المتاجر</h1>
          <p className="super-admin__sub">
            {loading ? "جاري التحميل…" : `${stores.length} من أصل ${total} متجرًا`}
          </p>
        </div>
        <div className="super-admin__header-actions">
          <button type="button" className="dm-btn dm-btn--secondary" onClick={load} disabled={loading}>
            تحديث القائمة
          </button>
          <button type="button" className="dm-btn dm-btn--ghost" onClick={leave}>
            خروج من الإدارة
          </button>
        </div>
      </header>

      {error ? (
        <p className="super-admin__error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="super-admin__table-wrap">
        <table className="super-admin__table">
          <thead>
            <tr>
              <th>المعرّف</th>
              <th>الاسم</th>
              <th>السلج</th>
              <th>البريد</th>
              <th>الحالة</th>
              <th>نهاية التجربة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <StoreRow
                key={s.id}
                store={s}
                busy={Boolean(rowBusy[s.id])}
                msg={rowMsg[s.id] || ""}
                onPatch={(payload) => patchStore(s.id, payload)}
              />
            ))}
          </tbody>
        </table>
        {!loading && stores.length === 0 && !error ? (
          <p className="super-admin__empty">لا توجد متاجر بعد.</p>
        ) : null}
      </div>
    </div>
  );
}

function StoreRow({ store, busy, msg, onPatch }) {
  const [status, setStatus] = useState(store.subscription_status || "active");
  const [extendDays, setExtendDays] = useState("7");
  const publicUrl = store.slug ? buildPublicStorefrontUrl(store.slug) : "";

  useEffect(() => {
    setStatus(store.subscription_status || "active");
  }, [store.subscription_status]);

  return (
    <tr>
      <td dir="ltr">{store.id}</td>
      <td>{store.name}</td>
      <td dir="ltr">
        <code className="super-admin__slug">{store.slug}</code>
        {publicUrl ? (
          <a className="super-admin__link" href={publicUrl} target="_blank" rel="noreferrer">
            واجهة
          </a>
        ) : null}
      </td>
      <td dir="ltr" className="super-admin__email">
        {store.owner_email || "—"}
      </td>
      <td>
        <select
          className="super-admin__select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={busy}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </td>
      <td dir="ltr" className="super-admin__mono">
        {store.trial_ends_at ? String(store.trial_ends_at).slice(0, 16) : "—"}
      </td>
      <td>
        <div className="super-admin__row-actions">
          <button
            type="button"
            className="dm-btn dm-btn--primary dm-btn--sm"
            disabled={busy || status === store.subscription_status}
            onClick={() => onPatch({ subscription_status: status })}
          >
            حفظ الحالة
          </button>
          <div className="super-admin__extend">
            <input
              type="number"
              min={1}
              max={365}
              value={extendDays}
              onChange={(e) => setExtendDays(e.target.value)}
              disabled={busy}
              dir="ltr"
            />
            <button
              type="button"
              className="dm-btn dm-btn--secondary dm-btn--sm"
              disabled={busy}
              onClick={() => onPatch({ extend_trial_days: Number(extendDays) || 7 })}
            >
              تمديد تجربة
            </button>
          </div>
          {msg ? <small className="super-admin__row-msg">{msg}</small> : null}
        </div>
      </td>
    </tr>
  );
}
