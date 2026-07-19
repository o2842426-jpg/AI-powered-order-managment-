import { useEffect, useState } from "react";
import "./App.css";
import { OwnerShell } from "./components/OwnerShell";
import {
  authFetch,
  clearAuth,
  getStoredAuth,
  refreshStoredAuth,
  storeAuth,
} from "./lib/auth";
import { userErrorMessage, throwIfNotOk, withNetworkError } from "./lib/apiErrors";
import { rememberPublicStoreSlug } from "./lib/publicStoreSlug";
import {
  OWNER_APP_VIEWS,
  OWNER_URL_SYNC_VIEWS,
  computeInitialPostLoginView,
  computeInitialView,
  replaceOwnerUrlParam,
} from "./lib/ownerViewUrl";
import { OwnerDashboardPage } from "./pages/OwnerDashboardPage";
import { OwnerLoginPage } from "./pages/OwnerLoginPage";
import { OwnerOrdersPage } from "./pages/OwnerOrdersPage";
import { CreateStorePage } from "./pages/CreateStorePage";
import { StorefrontPage } from "./pages/StorefrontPage";
import { LandingPage } from "./pages/LandingPage";
import { OwnerConversationsPage } from "./pages/OwnerConversationsPage";
import { SuperAdminLoginPage } from "./pages/SuperAdminLoginPage";
import { SuperAdminPage } from "./pages/SuperAdminPage";

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
  const [view, setView] = useState(() => computeInitialView());
  const [ownerAuth, setOwnerAuth] = useState(() => getStoredAuth());
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingRefresh, setBillingRefresh] = useState(0);
  const [postLoginView, setPostLoginView] = useState(() => computeInitialPostLoginView());
  const [orderSearch, setOrderSearch] = useState("");
  const [oauthToast, setOauthToast] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const instagram = params.get("instagram");
    if (!instagram) return;

    if (instagram === "connected") {
      setOauthToast({
        type: "success",
        message: "تم ربط إنستغرام بنجاح — محادثات DM جاهزة الآن.",
      });
      if (getStoredAuth()) {
        void refreshStoredAuth().then((auth) => {
          if (auth) setOwnerAuth(auth);
        });
        setView("settings");
        replaceOwnerUrlParam("settings");
      }
    } else if (instagram === "error") {
      const reason = params.get("reason") || "unknown";
      const detail = params.get("detail") || "";
      const reasonMessages = {
        no_ig_account:
          "لم نجد صفحة فيسبوك مربوطة بحساب Instagram Business. اربط IG Professional بصفحتك ثم أعد المحاولة.",
        ig_already_linked:
          "حساب إنستغرام هذا مربوط بمتجر آخر في ShopIQ. افصله من المتجر القديم أو استخدم حساب IG آخر.",
        oauth_denied: "ألغيت تسجيل الدخول إلى فيسبوك — لم يتم الربط.",
        invalid_state: "انتهت صلاحية جلسة الربط — أعد المحاولة من زر «ربط إنستغرام».",
        encryption_not_configured:
          "السيرفر غير مهيأ لتشفير التوكن — تواصل مع الدعم.",
        missing_code: "لم يصل رمز التفويض من فيسبوك.",
        token_exchange_failed: "تعذّر استبدال رمز فيسبوك بتوكن — أعد المحاولة.",
        server_error: detail
          ? `حدث خطأ أثناء الربط: ${detail}`
          : "حدث خطأ أثناء الربط — أعد المحاولة.",
      };
      setOauthToast({
        type: "error",
        message:
          reasonMessages[reason] ||
          "تعذّر ربط إنستغرام. تحقق من صلاحيات التطبيق وحاول مجددًا.",
      });
      if (getStoredAuth()) {
        setView("settings");
        replaceOwnerUrlParam("settings");
      }
    }

    params.delete("instagram");
    params.delete("reason");
    params.delete("detail");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!oauthToast) return undefined;
    const timer = window.setTimeout(() => setOauthToast(null), 9000);
    return () => window.clearTimeout(timer);
  }, [oauthToast]);

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
        throwIfNotOk(res, body, { fallback: "تعذّر تحميل حالة الفوترة." });
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
    if (
      view === "upgrade" &&
      billingStatus?.billing_enforced &&
      billingStatus?.has_access
    ) {
      setView("dashboard");
    }
  }, [view, billingStatus?.billing_enforced, billingStatus?.has_access]);

  useEffect(() => {
    const u = ownerAuth?.user;
    if (!u?.store_id || u.store_slug) return;
    let cancelled = false;
    authFetch(`/api/stores/${u.store_id}/settings`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.data?.slug) return;
        if (cancelled) return;
        const auth = getStoredAuth();
        if (!auth?.user || String(auth.user.store_id) !== String(u.store_id)) return;
        if (auth.user.store_slug) return;
        const next = {
          ...auth,
          user: { ...auth.user, store_slug: body.data.slug },
        };
        storeAuth(next);
        rememberPublicStoreSlug(body.data.slug);
        setOwnerAuth(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ownerAuth?.user?.store_id, ownerAuth?.user?.store_slug]);

  useEffect(() => {
    if (view !== "orders") {
      setOrderSearch("");
    }
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (view === "super-admin-login" || view === "super-admin") {
      replaceOwnerUrlParam(view);
      return;
    }

    const mustSeeUpgrade =
      ownerAuth &&
      billingStatus &&
      billingStatus.billing_enforced &&
      billingStatus.has_access === false &&
      (OWNER_APP_VIEWS.has(view) || view === "upgrade");
    if (mustSeeUpgrade) {
      replaceOwnerUrlParam("upgrade");
      return;
    }

    const shellLoggedIn =
      ownerAuth &&
      view !== "store" &&
      view !== "owner-login" &&
      view !== "create-store" &&
      view !== "super-admin-login" &&
      view !== "super-admin";
    if (shellLoggedIn && OWNER_URL_SYNC_VIEWS.has(view)) {
      replaceOwnerUrlParam(view);
      return;
    }

    if (view === "owner-login") {
      const o = new URLSearchParams(window.location.search).get("owner");
      if (o === "upgrade") return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("owner")) {
      replaceOwnerUrlParam(null);
    }
  }, [view, ownerAuth, billingStatus]);

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

  async function startCheckout(plan = "starter") {
    try {
      await withNetworkError(async () => {
        const res = await authFetch("/api/billing/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        });
        const body = await res.json().catch(() => ({}));
        throwIfNotOk(res, body, { fallback: "تعذر بدء الدفع." });
        const url = body.data?.url;
        if (url) {
          window.location.href = url;
        }
      });
    } catch (err) {
      window.alert(userErrorMessage(err, { fallback: "تعذر بدء الدفع." }));
    }
  }

  async function openBillingPortal() {
    try {
      await withNetworkError(async () => {
        const res = await authFetch("/api/billing/portal-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        const body = await res.json().catch(() => ({}));
        throwIfNotOk(res, body, { fallback: "تعذر فتح بوابة الفوترة." });
        const url = body.data?.url;
        if (url) {
          window.location.href = url;
        }
      });
    } catch (err) {
      window.alert(userErrorMessage(err, { fallback: "تعذر فتح بوابة الفوترة." }));
    }
  }

  const showOwnerShell =
    ownerAuth &&
    view !== "store" &&
    view !== "owner-login" &&
    view !== "create-store" &&
    view !== "super-admin-login" &&
    view !== "super-admin";

  const billingToolbar =
    ownerAuth &&
    billingStatus?.billing_enforced &&
    billingStatus?.has_access &&
    billingStatus?.can_use_portal &&
    !billingStatus?.manual_billing ? (
      <div className="app-billing-ok app-billing-ok--shell">
        <button type="button" className="app-billing-link" onClick={openBillingPortal}>
          إدارة الفوترة
        </button>
      </div>
    ) : null;

  const billingBannerEl = null;

  const upgradeNavActive =
    view === "upgrade" ||
    (ownerAuth &&
      billingStatus?.billing_enforced &&
      billingStatus?.has_access === false &&
      OWNER_APP_VIEWS.has(view));

  function renderOwnerMain() {
    if (!ownerAuth) return null;

    const mustSeeUpgrade =
      Boolean(billingStatus?.billing_enforced) &&
      billingStatus?.has_access === false &&
      (view === "upgrade" || OWNER_APP_VIEWS.has(view));

    if (mustSeeUpgrade) {
      return (
        <OwnerUpgradePage
          billingStatus={billingStatus}
          onStartCheckout={startCheckout}
          onPreviewStore={() => setView("store")}
        />
      );
    }

    if (view === "upgrade") {
      return (
        <div className="page" style={{ padding: "2rem", textAlign: "center" }}>
          <p>الفوترة غير مفعّلة أو اشتراكك نشط بالفعل.</p>
          <button type="button" className="dm-btn dm-btn--primary" onClick={() => setView("dashboard")}>
            العودة للوحة التحكم
          </button>
        </div>
      );
    }

    if (view === "orders") {
      return (
        <OwnerOrdersPage
          key={`orders-${ownerAuth.user?.store_id ?? ownerAuth.user?.id ?? "u"}`}
          searchQuery={orderSearch}
          onSearchChange={setOrderSearch}
        />
      );
    }

    if (view === "conversations") {
      return (
        <OwnerConversationsPage
          key={`conv-${ownerAuth.user?.store_id ?? ownerAuth.user?.id ?? "u"}`}
          billingStatus={billingStatus}
          onGoUpgrade={() => setView("upgrade")}
        />
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
          key={`dash-${ownerAuth.user?.store_id ?? ownerAuth.user?.id ?? "u"}`}
          panel={dashboardPanelFromView(view)}
          onNavigate={(target) => {
            const map = {
              dashboard: "dashboard",
              orders: "orders",
              conversations: "conversations",
              products: "products",
              inventory: "inventory",
              customers: "customers",
              ai: "ai",
              settings: "settings",
              upgrade: "upgrade",
            };
            const next = map[target];
            if (next) setView(next);
          }}
          onGoToOrders={() => setView("orders")}
          onPreviewStore={() => setView("store")}
          onGoUpgrade={() => setView("upgrade")}
          billingStatus={billingStatus}
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
          view === "create-store" ? "app-public-nav__btn is-active" : "app-public-nav__btn"
        }
        onClick={() => setView("create-store")}
      >
        إنشاء متجر
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
      <button
        type="button"
        className={
          view === "super-admin-login" || view === "super-admin"
            ? "app-public-nav__btn is-active"
            : "app-public-nav__btn"
        }
        onClick={() => setView("super-admin-login")}
      >
        إدارة المنصة
      </button>
    </nav>
  ) : null;

  return (
    <>
      {showOwnerShell ? (
        <OwnerShell
          activeView={view}
          upgradeNavActive={upgradeNavActive}
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
          {oauthToast ? (
            <div
              className={
                oauthToast.type === "success"
                  ? "app-oauth-toast app-oauth-toast--success"
                  : "app-oauth-toast app-oauth-toast--error"
              }
              role="status"
            >
              <span>{oauthToast.message}</span>
              <button
                type="button"
                className="app-oauth-toast__close"
                aria-label="إغلاق"
                onClick={() => setOauthToast(null)}
              >
                ×
              </button>
            </div>
          ) : null}
          {renderOwnerMain()}
        </OwnerShell>
      ) : view === "landing" ? (
        <LandingPage
          onStartTrial={() => setView("create-store")}
          onLogin={() => setView("owner-login")}
          onViewStore={() => setView("store")}
        />
      ) : (
        <main className="page page--public">
          {publicNav}

          {view === "super-admin-login" && (
            <SuperAdminLoginPage
              onSuccess={() => {
                setView("super-admin");
                replaceOwnerUrlParam("super-admin");
              }}
              onBack={() => {
                setView("store");
                replaceOwnerUrlParam(null);
              }}
            />
          )}
          {view === "super-admin" && (
            <SuperAdminPage
              onExit={() => {
                setView("super-admin-login");
                replaceOwnerUrlParam("super-admin-login");
              }}
            />
          )}

          {ownerAuth &&
            billingStatus?.billing_enforced &&
            billingStatus?.has_access &&
            billingStatus?.can_use_portal &&
            !billingStatus?.manual_billing && (
              <div className="app-billing-ok">
                <button type="button" className="app-billing-link" onClick={openBillingPortal}>
                  إدارة الفوترة
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

          {view === "store" && (
            <StorefrontPage
              publicSlugVersion={
                ownerAuth?.user
                  ? `${ownerAuth.user.store_id}:${ownerAuth.user.store_slug ?? ""}`
                  : "guest"
              }
            />
          )}
          {view === "owner-login" && (
            <OwnerLoginPage
              onAuthenticated={(auth) => {
                setOwnerAuth(auth);
                setView(postLoginView || "dashboard");
              }}
              onGoCreateStore={() => setView("create-store")}
            />
          )}
          {view === "create-store" && (
            <CreateStorePage
              onDone={(auth) => {
                setOwnerAuth(auth);
                setPostLoginView("dashboard");
                setView("dashboard");
              }}
              onBackToLogin={() => setView("owner-login")}
            />
          )}
        </main>
      )}
    </>
  );
}

export default App;
