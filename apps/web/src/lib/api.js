/**
 * Base URL for API calls.
 * - Dev: leave VITE_API_URL unset and use Vite proxy (/api -> localhost:4000).
 * - Prod: set VITE_API_URL to your API origin only (scheme + host + port), e.g. https://api.example.com — no trailing /api (paths already include /api/...).
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

/** localhost / 127.0.0.1 — stored image URLs from dev machines must not be used as-is on a public host. */
function isLoopbackHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Stored product/store images may be relative (/uploads/...).
 * In dev, Vite proxies /uploads to the API; in prod, prefix the API origin from VITE_API_URL.
 * Absolute URLs pointing at loopback (e.g. http://localhost:4000/uploads/...) are rewritten when
 * the app is opened from a non-loopback host so preview/production builds still load images.
 */
export function mediaUrl(url) {
  if (url == null) return "";
  const u = String(url).trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      if (isLoopbackHostname(parsed.hostname) && typeof window !== "undefined") {
        const apiOrigin = getApiOrigin();
        if (apiOrigin) {
          return `${apiOrigin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        if (!isLoopbackHostname(window.location.hostname)) {
          const port = parsed.port ? `:${parsed.port}` : "";
          const origin = `${parsed.protocol}//${window.location.hostname}${port}`;
          return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      }
    } catch {
      /* keep original string */
    }
    return u;
  }
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
