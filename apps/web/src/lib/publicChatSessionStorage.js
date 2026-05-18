/** sessionStorage: last public chat session per storefront slug (tab-scoped). */
const KEY_PREFIX = "dm-commerce-public-chat-session";

function storageKey(slug) {
  return `${KEY_PREFIX}:${String(slug || "").trim().toLowerCase()}`;
}

export function readPublicChatSessionId(slug) {
  if (typeof window === "undefined") return null;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(s));
    if (raw == null || raw === "") return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writePublicChatSessionId(slug, sessionId) {
  if (typeof window === "undefined") return;
  const s = String(slug || "").trim().toLowerCase();
  const id = Number(sessionId);
  if (!s || !Number.isFinite(id) || id <= 0) return;
  try {
    window.sessionStorage.setItem(storageKey(s), String(id));
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearPublicChatSessionId(slug) {
  if (typeof window === "undefined") return;
  const s = String(slug || "").trim().toLowerCase();
  if (!s) return;
  try {
    window.sessionStorage.removeItem(storageKey(s));
  } catch {
    /* ignore */
  }
}
