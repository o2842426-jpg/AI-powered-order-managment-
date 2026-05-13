import { apiUrl } from "./api";

export const DM_ADMIN_SESSION_KEY = "dm-commerce-admin-api-key";

export function getAdminApiKey() {
  if (typeof sessionStorage === "undefined") return "";
  return sessionStorage.getItem(DM_ADMIN_SESSION_KEY) || "";
}

export function setAdminApiKey(key) {
  if (typeof sessionStorage === "undefined") return;
  if (key && String(key).trim()) {
    sessionStorage.setItem(DM_ADMIN_SESSION_KEY, String(key).trim());
  } else {
    sessionStorage.removeItem(DM_ADMIN_SESSION_KEY);
  }
}

export function clearAdminApiKey() {
  setAdminApiKey("");
}

export function adminFetch(path, options = {}) {
  const key = getAdminApiKey();
  const headers = new Headers(options.headers || {});
  if (key) {
    headers.set("X-Admin-Key", key);
  }
  return fetch(apiUrl(path), {
    ...options,
    headers,
  });
}
