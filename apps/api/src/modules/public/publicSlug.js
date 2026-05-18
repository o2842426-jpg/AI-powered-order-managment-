/** Normalize public URL slug: lowercase, underscores to hyphens (matches DB slugs). */
function normalizePublicStoreSlug(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let s = raw.trim().toLowerCase().replace(/_/g, "-");
  while (s.includes("--")) {
    s = s.replace(/--/g, "-");
  }
  return s.replace(/^-+|-+$/g, "") || "";
}

module.exports = { normalizePublicStoreSlug };
