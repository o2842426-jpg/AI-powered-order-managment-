import { useEffect, useState } from "react";
import "./App.css";
import { OwnerShell } from "./components/OwnerShell";
import { authFetch, clearAuth, getStoredAuth } from "./lib/auth";
import { OwnerDashboardPage } from "./pages/OwnerDashboardPage";
import { OwnerLoginPage } from "./pages/OwnerLoginPage";
import { OwnerOrdersPage } from "./pages/OwnerOrdersPage";
import { StorefrontPage } from "./pages/StorefrontPage";

const OWNER_APP_VIEWS = new Set([
  "dashboard",
  "orders",
  "products",
  "inventory",
  "customers",
  "ai",
  "settings",
]);

function dashboardPanelFromView(v) {
  const map = {
    dashboard: "overview",
    products: "products",
    inventory: "inventory",
    customers: "customers",
    ai: "ai",
    settings: "settings",
  };
  return map[v] || "overview";
}

function App() {
  const [view, setView] = useState("store");
  const [ownerAuth, setOwnerAuth] = useState(() => getStoredAuth());
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingRefresh, setBillingRefresh] = useState(0);
  const [postLoginView, setPostLoginView] = useState("dashboard");
  const [orderSearch, setOrderSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing === "success" || billing === "cancel" || billing === "return") {
      params.delete("billing");
      const qs = params.toString();
      const next = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      window.history.replaceState({}, "", next);
      setBillingRefresh((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    if (!ownerAuth) {
      setBillingStatus(null);
      return;
    }

    let cancelled = false;

    authFetch("/api/billing/status")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body.message || "billing status failed");
        }
        return body;
      })
      .then((body) => {
        if (!cancelled) {
          setBillingStatus(body.data ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBillingStatus(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [ownerAuth, billingRefresh]);

  useEffect(() => {
    if (view !== "orders") {
      setOrderSearch("");
    }
  }, [view]);

  function openOwnerView(nextView) {
    if (!ownerAuth) {
      setPostLoginView(nextView);
      setView("owner-login");
      return;
    }
    setView(nextView);
  }

  function logoutOwner() {
    clearAuth();
    setOwnerAuth(null);
    setView("store");
    setBillingStatus(null);
  }

  async function startCheckout() {
    const res = await authFetch("/api/billing/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(body.message || "تعذر بدء الدفع.");
      return;
    }
    const url = body.data?.url;
    if (url) {
      window.location.href = url;
    }
  }

  async function openBillingPortal() {
    const res = await authFetch("/api/billing/portal-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(body.message || "تعذر فتح بوابة الفوترة.");
      return;
    }
    const url = body.data?.url;
    if (url) {
      window.location.href = url;
    }
  }

  const ownerLocked =
    Boolean(ownerAuth) &&
    Boolean(billingStatus?.billing_enforced) &&
    billingStatus?.has_access === false &&
    OWNER_APP_VIEWS.has(view);

  const showOwnerShell = ownerAuth && view !== "store" && view !== "owner-login";

  const billingToolbar =
    ownerAuth &&
    billingStatus?.billing_enforced &&
    billingStatus?.has_access &&
    billingStatus?.can_use_portal ? (
      <div className="app-billing-ok app-billing-ok--shell">
        <button type="button" className="app-billing-link" onClick={openBillingPortal}>
          إدارة الفوترة
        </button>
      </div>
    ) : null;

  const billingBannerEl =
    ownerLocked ? (
      <div className="app-billing-banner" role="alert">
        <div>
          <strong>يتطلب اشتراكًا لاستخدام لوحة المالك</strong>
          <p>
            حالة الاشتراك الحالية:{" "}
            <em>{billingStatus?.subscription_status ?? "غير معروف"}</em>. أكمل الاشتراك
            للوصول إلى الطلبات والمنتجات والإعدادات.
          </p>
        </div>
        <button type="button" className="app-billing-cta" onClick={startCheckout}>
          اشترك الآن
        </button>
      </div>
    ) : null;

  function renderOwnerMain() {
    if (!ownerAuth) return null;

    if (ownerLocked) {
      return null;
    }

    if (view === "orders") {
      return (
        <OwnerOrdersPage searchQuery={orderSearch} onSearchChange={setOrderSearch} />
      );
    }

    if (
      view === "dashboard" ||
      view === "products" ||
      view === "inventory" ||
      view === "customers" ||
      view === "ai" ||
      view === "settings"
    ) {
      return (
        <OwnerDashboardPage
          panel={dashboardPanelFromView(view)}
          onNavigate={(target) => {
            const map = {
              dashboard: "dashboard",
              orders: "orders",
              products: "products",
              inventory: "inventory",
              customers: "customers",
              ai: "ai",
              settings: "settings",
            };
            const next = map[target];
            if (next) setView(next);
          }}
          onGoToOrders={() => setView("orders")}
          onPreviewStore={() => setView("store")}
        />
      );
    }

    return null;
  }

  const publicNav = !ownerAuth ? (
    <nav className="app-public-nav" aria-label="التنقل الرئيسي">
      <button
        type="button"
        className={view === "store" ? "app-public-nav__btn is-active" : "app-public-nav__btn"}
        onClick={() => setView("store")}
      >
        المتجر
      </button>
      <button
        type="button"
        className={
          view === "owner-login" ? "app-public-nav__btn is-active" : "app-public-nav__btn"
        }
        onClick={() => setView("owner-login")}
      >
        دخول المالك
      </button>
    </nav>
  ) : null;

  return (
    <>
      {showOwnerShell ? (
        <OwnerShell
          activeView={view}
          onNavigate={(id) => openOwnerView(id)}
          billingStatus={billingStatus}
          onLogout={logoutOwner}
          onPreviewStore={() => setView("store")}
          headerSearch={orderSearch}
          onHeaderSearchChange={setOrderSearch}
          showOrderSearch={view === "orders"}
          billingBanner={billingBannerEl}
          billingToolbar={billingToolbar}
        >
          {renderOwnerMain()}
        </OwnerShell>
      ) : (
        <main className="page page--public">
          {publicNav}

          {ownerAuth &&
            billingStatus?.billing_enforced &&
            billingStatus?.has_access &&
            billingStatus?.can_use_portal && (
              <div className="app-billing-ok">
                <button type="button" className="app-billing-link" onClick={openBillingPortal}>
                  إدارة الفوترة
                </button>
              </div>
            )}

          {ownerLocked && (
            <div className="app-billing-banner" role="alert">
              <div>
                <strong>يتطلب اشتراكًا لاستخدام لوحة المالك</strong>
                <p>
                  حالة الاشتراك الحالية:{" "}
                  <em>{billingStatus?.subscription_status ?? "غير معروف"}</em>. أكمل الاشتراك
                  للوصول إلى الطلبات والمنتجات والإعدادات.
                </p>
              </div>
              <button type="button" className="app-billing-cta" onClick={startCheckout}>
                اشترك الآن
              </button>
            </div>
          )}

          {ownerAuth && view === "store" && (
            <div className="app-owner-preview-bar">
              <span className="app-owner-preview-bar__label">عرض المتجر كما يراه الزوار</span>
              <div className="app-owner-preview-bar__actions">
                <button type="button" className="dm-btn dm-btn--primary" onClick={() => setView("dashboard")}>
                  لوحة التحكم
                </button>
                <button type="button" className="dm-btn dm-btn--secondary" onClick={() => setView("orders")}>
                  الطلبات
                </button>
              </div>
            </div>
          )}

          {view === "store" && <StorefrontPage />}
          {view === "owner-login" && (
            <OwnerLoginPage
              onAuthenticated={(auth) => {
                setOwnerAuth(auth);
                setView(postLoginView || "dashboard");
              }}
            />
          )}
        </main>
      )}
    </>
  );
}

export default App;
