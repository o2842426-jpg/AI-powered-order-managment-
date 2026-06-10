import { apiUrl } from "./api";

const AUTH_STORAGE_KEY = "dm-commerce-owner-auth";

export function getStoredAuth() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

/** معرّف المتجر الحالي للمالك المسجّل، أو سلسلة فارغة إن لم يتوفر. */
export function getOwnerStoreIdFromAuth() {
  const auth = getStoredAuth();
  const sid = auth?.user?.store_id;
  if (sid == null || String(sid).trim() === "") return "";
  return String(sid);
}

export function storeAuth(auth) {
  if (!auth?.token || !auth?.user?.id) {
    return false;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  return true;
}

export async function refreshStoredAuth() {
  const res = await authFetch("/api/auth/me");
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.token || !body?.data?.user?.id) {
    return null;
  }
  storeAuth(body.data);
  return body.data;
}

export function clearAuth() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function authFetch(path, options = {}) {
  const auth = getStoredAuth();
  const headers = new Headers(options.headers || {});

  if (auth?.token) {
    headers.set("Authorization", `Bearer ${auth.token}`);
  }

  return fetch(apiUrl(path), {
    ...options,
    headers,
  });
}
