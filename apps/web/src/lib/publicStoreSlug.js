import { getStoredAuth } from "./auth";

/** مفتاح localStorage لمعرّف المتجر العام (يُحدَّث بعد «إنشاء متجر»). */
export const PUBLIC_STORE_SLUG_LS_KEY = "dm-commerce-public-store-slug";

function normalizeSlugSegment(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase().replace(/_/g, "-");
  while (s.includes("--")) {
    s = s.replace(/--/g, "-");
  }
  return s.replace(/^-+|-+$/g, "") || "";
}

/**
 * ترتيب الأولوية:
 * 1) معلمة الرابط ?store= أو ?slug= (مشاركة رابط متجر محدد)
 * 2) slug المالك من جلسة تسجيل الدخول (معاينة متجر الحساب الحالي)
 * 3) localStorage بعد «إنشاء متجر» من نفس المتصفح (لا يحتاج إعادة بناء)
 * 4) VITE_STORE_SLUG عند البناء (نشر ثابت لمتجر واحد)
 * 5) في التطوير فقط: demo-store
 */
export function getEffectivePublicStoreSlug() {
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = normalizeSlugSegment(
        params.get("store") || params.get("slug") || ""
      );
      if (fromQuery) return fromQuery;

      const auth = getStoredAuth();
      const fromAuth = normalizeSlugSegment(auth?.user?.store_slug || "");
      if (fromAuth) return fromAuth;

      const fromLs = normalizeSlugSegment(
        window.localStorage.getItem(PUBLIC_STORE_SLUG_LS_KEY) || ""
      );
      if (fromLs) return fromLs;
    } catch {
      /* ignore */
    }
  }

  const fromEnv = normalizeSlugSegment(
    typeof import.meta.env.VITE_STORE_SLUG === "string"
      ? import.meta.env.VITE_STORE_SLUG
      : ""
  );
  if (fromEnv) return fromEnv;

  if (import.meta.env.DEV) return "demo-store";
  return "";
}

export function rememberPublicStoreSlug(slug) {
  const s = normalizeSlugSegment(String(slug || ""));
  if (!s || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PUBLIC_STORE_SLUG_LS_KEY, s);
  } catch {
    /* ignore */
  }
}
