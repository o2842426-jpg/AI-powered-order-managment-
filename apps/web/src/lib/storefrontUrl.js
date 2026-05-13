/**
 * Builds a shareable storefront URL using the same ?store= convention as publicStoreSlug.js.
 * @param {string | null | undefined} slug
 * @returns {string}
 */
export function buildPublicStorefrontUrl(slug) {
  const s = String(slug ?? "").trim();
  if (!s || typeof window === "undefined") return "";
  const path = window.location.pathname || "/";
  const u = new URL(path, window.location.origin);
  u.searchParams.set("store", s);
  return u.toString();
}
