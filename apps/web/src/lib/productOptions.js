/**
 * Product "variants" in the API use `size` and `color` as two generic option slots
 * (any category). UI must not imply apparel.
 */
export function formatProductOptionSummary(variant) {
  if (!variant) return "—";
  const parts = [variant.size, variant.color]
    .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
    .filter(Boolean);
  if (parts.length === 0) return "خيار افتراضي";
  return parts.join(" · ");
}
