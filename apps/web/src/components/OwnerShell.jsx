import { useMemo } from "react";
import "./OwnerShell.css";

const NAV_ITEMS = [
  { id: "dashboard", label: "لوحة التحكم" },
  { id: "orders", label: "الطلبات" },
  {
    id: "conversations",
    label: "المحادثات",
    requiresFeature: "conversations_dashboard",
  },
  { id: "products", label: "المنتجات" },
  { id: "inventory", label: "المخزون" },
  { id: "customers", label: "العملاء" },
  { id: "ai", label: "مساعد AI" },
  { id: "settings", label: "الإعدادات" },
];

function IconDashboard() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 13h6V4H4v9zm0 7h6v-5H4v5zm8 0h8v-9h-8v9zm0-18v5h8V4h-8z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconOrders() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path d="M3.27 6.96L12 12l8.73-5.04M12 22V12" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function IconLayers() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.12-1.06L22 7m-10 5L2 12m10 9l10-5-10-5-10 5 10 5z" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.96 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2l2.09 6.26L20 9l-6 1 2 6-4-4.5L8 16l2-6-6-1 5.91-.74L12 2z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96c-.52-.4-1.08-.73-1.69-.98l-.36-2.54A.5.5 0 00 14 2h-4a.5.5 0 00-.49.42l-.36 2.54c-.61.25-1.17.59-1.69.98l-2.39-.96a.5.5 0 00-.6.22L2.76 8.11a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.12.22.37.3.6.22l2.39-.96c.52.4 1.08.73 1.69.98l.36 2.54c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.36-2.54c.61-.25 1.17-.59 1.69-.98l2.39.96c.23.09.48 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5A3.5 3.5 0 018.5 12 3.5 3.5 0 0112 8.5a3.5 3.5 0 013.5 3.5 3.5 3.5 0 01-3.5 3.5z" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg className="owner-shell__nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5h16v12H7l-3 3V5z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M8 9h8M8 12h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const ICONS = {
  dashboard: IconDashboard,
  orders: IconOrders,
  conversations: IconChat,
  products: IconBox,
  inventory: IconLayers,
  customers: IconUsers,
  ai: IconSpark,
  settings: IconGear,
};

export function OwnerShell({
  activeView,
  upgradeNavActive = false,
  onNavigate,
  children,
  headerSearch,
  onHeaderSearchChange,
  showOrderSearch,
  billingStatus,
  onLogout,
  onPreviewStore,
  billingBanner,
  billingToolbar,
}) {
  const subscriptionLabel = billingStatus?.billing_enforced
    ? billingStatus?.has_access
      ? "نشط"
      : "يتطلب اشتراكًا"
    : "بدون اشتراك";

  const subscriptionTone =
    billingStatus?.billing_enforced && !billingStatus?.has_access ? "is-warn" : "is-ok";

  const visibleNav = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.requiresFeature !== "conversations_dashboard") return true;
      if (!billingStatus?.billing_enforced) return true;
      const caps = billingStatus.capabilities;
      return Array.isArray(caps) && caps.includes("conversations_dashboard");
    });
  }, [billingStatus]);

  return (
    <div className="owner-shell">
      <aside className="owner-shell__sidebar" aria-label="قائمة لوحة المالك">
        <div className="owner-shell__brand">
          <span className="owner-shell__logo">DM</span>
          <div>
            <strong>DM Commerce</strong>
            <span>تجارة وذكاء اصطناعي</span>
          </div>
        </div>

        <nav className="owner-shell__nav">
          {visibleNav.map((item) => {
            const Icon = ICONS[item.id] || IconDashboard;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={isActive ? "owner-shell__nav-item is-active" : "owner-shell__nav-item"}
                onClick={() => onNavigate(item.id)}
              >
                <Icon />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="owner-shell__footer">
          {billingStatus?.billing_enforced && billingStatus?.has_access === false && (
            <button
              type="button"
              className={
                upgradeNavActive
                  ? "owner-shell__upgrade-link is-active"
                  : "owner-shell__upgrade-link"
              }
              onClick={() => onNavigate?.("upgrade")}
            >
              خطط الاشتراك والترقية
            </button>
          )}
          <button type="button" className="owner-shell__admin-sublink" onClick={() => onNavigate?.("super-admin-login")}>
            إدارة المنصة
          </button>
          <button type="button" className="owner-shell__preview" onClick={onPreviewStore}>
            معاينة المتجر
          </button>
          <button type="button" className="owner-shell__logout" onClick={onLogout}>
            تسجيل الخروج
          </button>
        </div>
      </aside>

      <div className="owner-shell__main">
        <header className="owner-shell__header">
          <div className="owner-shell__header-left">
            {showOrderSearch ? (
              <label className="owner-shell__search">
                <span className="visually-hidden">بحث في الطلبات</span>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                    opacity="0.5"
                  />
                </svg>
                <input
                  type="search"
                  dir="rtl"
                  value={headerSearch}
                  onChange={(e) => onHeaderSearchChange(e.target.value)}
                  placeholder="ابحث في الطلبات…"
                  autoComplete="off"
                />
              </label>
            ) : (
              <button
                type="button"
                className="owner-shell__search owner-shell__search--goto-orders"
                onClick={() => onNavigate?.("orders")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="currentColor"
                    d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
                    opacity="0.5"
                  />
                </svg>
                <span className="owner-shell__search-goto-text">ابحث في الطلبات</span>
                <span className="owner-shell__search-goto-hint">انتقل إلى الطلبات</span>
              </button>
            )}
          </div>

          <div className="owner-shell__header-right">
            <span className={`owner-shell__badge ${subscriptionTone}`}>{subscriptionLabel}</span>
            <button type="button" className="owner-shell__icon-btn" title="الإشعارات" aria-label="الإشعارات">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
              </svg>
            </button>
            <div className="owner-shell__profile" title="حساب المالك">
              <span className="owner-shell__avatar">م</span>
              <div className="owner-shell__profile-text">
                <span>المالك</span>
                <small>لوحة التحكم</small>
              </div>
            </div>
          </div>
        </header>

        {billingToolbar}
        {billingBanner}

        <div className="owner-shell__content">{children}</div>
      </div>
    </div>
  );
}
