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

export function storeAuth(auth) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
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
