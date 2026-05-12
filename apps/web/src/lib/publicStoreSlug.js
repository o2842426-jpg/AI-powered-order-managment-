/** مفتاح localStorage لمعرّف المتجر العام (يُحدَّث بعد «إنشاء متجر»). */
export const PUBLIC_STORE_SLUG_LS_KEY = "dm-commerce-public-store-slug";

/**
 * ترتيب الأولوية:
 * 1) معلمة الرابط ?store= أو ?slug= (مشاركة رابط متجر محدد)
 * 2) localStorage بعد «إنشاء متجر» من نفس المتصفح (لا يحتاج إعادة بناء)
 * 3) VITE_STORE_SLUG عند البناء (نشر ثابت لمتجر واحد)
 * 4) في التطوير فقط: demo-store
 */
export function getEffectivePublicStoreSlug() {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = (params.get("store") || params.get("slug") || "").trim();
      if (fromQuery) return fromQuery;

      const fromLs = window.localStorage.getItem(PUBLIC_STORE_SLUG_LS_KEY)?.trim();
      if (fromLs) return fromLs;
    } catch {
      /* ignore */
    }
  }

  const fromEnv =
    typeof import.meta.env.VITE_STORE_SLUG === "string"
      ? import.meta.env.VITE_STORE_SLUG.trim()
      : "";
  if (fromEnv) return fromEnv;

  if (import.meta.env.DEV) return "demo-store";
  return "";
}

export function rememberPublicStoreSlug(slug) {
  const s = String(slug || "").trim();
  if (!s || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUBLIC_STORE_SLUG_LS_KEY, s);
  } catch {
    /* ignore */
  }
}
