function getApiPublicOrigin() {
  const raw = String(
    process.env.API_PUBLIC_URL || process.env.API_BASE_URL || ""
  )
    .trim()
    .replace(/\/$/, "");
  return raw || null;
}

/**
 * Turn stored /uploads/... paths into absolute HTTPS URLs for Meta attachments.
 *
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
function resolvePublicMediaUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;

  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u);
      const host = String(parsed.hostname || "").toLowerCase();
      if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
        const base = getApiPublicOrigin();
        if (base) {
          return `${base}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
      }
    } catch {
      return null;
    }
    return u;
  }

  if (u.startsWith("/")) {
    const base = getApiPublicOrigin();
    return base ? `${base}${u}` : null;
  }

  return null;
}

module.exports = {
  getApiPublicOrigin,
  resolvePublicMediaUrl,
};
