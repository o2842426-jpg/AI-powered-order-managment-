import { getStoredAuth } from "./auth";
import { getAdminApiKey } from "./adminApi";

/** Dashboard / orders / settings — used for billing lock (must see upgrade). */
export const OWNER_APP_VIEWS = new Set([
  "dashboard",
  "orders",
  "products",
  "inventory",
  "customers",
  "ai",
  "settings",
]);

/** Owner shell views synced to ?owner= (bookmarkable / shareable). */
export const OWNER_URL_SYNC_VIEWS = new Set([...OWNER_APP_VIEWS, "upgrade"]);

export const ADMIN_URL_VIEWS = new Set(["super-admin-login", "super-admin"]);

export function computeInitialPostLoginView() {
  if (typeof window === "undefined") return "dashboard";
  const o = new URLSearchParams(window.location.search).get("owner");
  if (!getStoredAuth() && o === "upgrade") return "upgrade";
  return "dashboard";
}

export function computeInitialView() {
  if (typeof window === "undefined") return "store";
  const params = new URLSearchParams(window.location.search);
  const o = params.get("owner");
  const auth = getStoredAuth();

  if (o === "super-admin-login") return "super-admin-login";
  if (o === "super-admin") {
    return getAdminApiKey() ? "super-admin" : "super-admin-login";
  }

  if (!auth) {
    if (o === "upgrade") return "owner-login";
    return "store";
  }
  if (o && OWNER_URL_SYNC_VIEWS.has(o)) return o;
  return "dashboard";
}

/**
 * Sets or removes the `owner` query param while preserving other params (e.g. ?store=).
 * @param {string | null} view — shell view to set, or null to remove `owner`
 */
export function replaceOwnerUrlParam(view) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const all = new Set([...OWNER_URL_SYNC_VIEWS, ...ADMIN_URL_VIEWS]);
  if (view && all.has(view)) {
    url.searchParams.set("owner", view);
  } else {
    url.searchParams.delete("owner");
  }
  const qs = url.searchParams.toString();
  window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}${url.hash}`);
}
