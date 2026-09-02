import { STORE_VERTICAL_OPTIONS } from "../storeOnboarding";

/** @type {Record<string, { id: string, label: string, badgeClass?: string }>} */
export const VERTICAL_META = Object.fromEntries(
  STORE_VERTICAL_OPTIONS.map((opt) => [
    opt.value,
    {
      id: opt.value,
      label: opt.label,
      badgeClass:
        opt.value === "clothing"
          ? "owner-shell__vertical-badge--clothing"
          : undefined,
    },
  ])
);

export function verticalLabel(verticalId) {
  if (!verticalId) return null;
  return VERTICAL_META[verticalId]?.label || verticalId;
}

export function isClothingVertical(verticalId) {
  return String(verticalId || "").trim().toLowerCase() === "clothing";
}
