/** عملات مدعومة لعرض أسعار المتجر (تُحفظ في stores.currency_code). */
export const STORE_CURRENCY_CODES = ["SAR", "IQD", "USD"];

export function normalizeStoreCurrencyCode(code) {
  const c = String(code ?? "SAR")
    .trim()
    .toUpperCase();
  return STORE_CURRENCY_CODES.includes(c) ? c : "SAR";
}

/**
 * تنسيق مبلغ للعرض في الواجهة (واجهة العميل، لوحة المالك، الطلبات).
 * @param {unknown} amount
 * @param {string} [currencyCode]
 */
export function formatStoreMoney(amount, currencyCode) {
  const code = normalizeStoreCurrencyCode(currencyCode);
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  const fractionDigits = code === "IQD" ? 0 : 2;
  try {
    return new Intl.NumberFormat("ar-SA", {
      style: "currency",
      currency: code,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(n);
  } catch {
    const rounded =
      code === "IQD" ? Math.round(n) : Math.round(n * 100) / 100;
    const suffix = code === "SAR" ? "ر.س" : code === "IQD" ? "د.ع" : "USD";
    return `${rounded.toLocaleString("en-US")} ${suffix}`;
  }
}

export function storeCurrencyOptionLabel(code) {
  switch (normalizeStoreCurrencyCode(code)) {
    case "SAR":
      return "ريال سعودي (SAR)";
    case "IQD":
      return "دينار عراقي (IQD)";
    case "USD":
      return "دولار أمريكي (USD)";
    default:
      return "SAR";
  }
}
