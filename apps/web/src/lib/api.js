/**
 * Base URL for API calls.
 * - Dev: leave VITE_API_URL unset and use Vite proxy (/api -> localhost:4000).
 * - Prod: set VITE_API_URL to your API origin, e.g. https://api.example.com/api
 */
export function getApiBase() {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (fromEnv && String(fromEnv).trim()) {
    return String(fromEnv).replace(/\/$/, '');
  }
  return '';
}

export function apiUrl(path) {
  const base = getApiBase();
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

function getApiOrigin() {
  const base = getApiBase();
  if (!base) return "";
  try {
    const normalized =
      base.startsWith("http://") || base.startsWith("https://")
        ? base
        : `https://${base.replace(/^\/+/, "")}`;
    return new URL(normalized).origin;
  } catch {
    return "";
  }
}

/**
 * Stored product/store images may be relative (/uploads/...).
 * In dev, Vite proxies /uploads to the API; in prod, prefix the API origin from VITE_API_URL.
 */
export function mediaUrl(url) {
  if (url == null) return "";
  const u = String(url).trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) {
    if (typeof window === "undefined") return `https:${u}`;
    return `${window.location.protocol}${u}`;
  }
  if (u.startsWith("/")) {
    const origin = getApiOrigin();
    return origin ? `${origin}${u}` : u;
  }
  return u;
}
