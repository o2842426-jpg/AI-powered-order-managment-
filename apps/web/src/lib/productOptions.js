/**
 * Product "variants" in the API use `size` and `color` as two generic option slots.
 * Clothing verticals get apparel-specific labels; others stay category-neutral.
 */

export function formatProductOptionSummary(variant) {
  if (!variant) return "—";
  const parts = [variant.size, variant.color]
    .map((x) => (x != null && String(x).trim() !== "" ? String(x).trim() : null))
    .filter(Boolean);
  if (parts.length === 0) return "خيار افتراضي";
  return parts.join(" · ");
}

/**
 * @param {boolean} isClothing
 */
export function optionSlotLabels(isClothing) {
  if (isClothing) {
    return {
      sectionTitle: "المقاسات والألوان",
      sectionLead:
        "أضف كل تركيبة مقاس × لون مع المخزون. مساعد الطلبات يستخدم هذه الخيارات لاختيار المقاس واللون.",
      sectionHint:
        "إن لم تضف خيارات، يبقى المنتج بسيطًا بالسعر الأساسي دون خطوة مقاس/لون في المحادثة.",
      addSubtitle: "إضافة مقاس / لون",
      currentSubtitle: "الخيارات الحالية",
      empty:
        "لا توجد خيارات بعد — أضف مقاسًا ولونًا لكل توزيعة مخزون (مثال: M · أسود).",
      slot1: "المقاس",
      slot2: "اللون",
      slot1Placeholder: "مثال: S / M / L / XL",
      slot2Placeholder: "مثال: أسود / أبيض",
      addButton: "إضافة مقاس/لون",
      orderSlot1: "المقاس",
      orderSlot2: "اللون",
    };
  }

  return {
    sectionTitle: "خيارات المنتج (اختياري)",
    sectionLead:
      "استخدم هذا القسم فقط إذا كان منتجك يتضمن أكثر من شكل: سعة، لون، نكهة، تخزين، إصدار، وزن، مادة، عبوة… يمكن ترك المواصفة 1 و 2 فارغين إذا كان الخيار يُعرّف بالمخزون أو الـ SKU فقط.",
    sectionHint:
      "إن لم تضف أي خيار، يبقى المنتج بسيطًا: يظهر للعميل بالسعر الأساسي دون خطوة اختيار في المتجر.",
    addSubtitle: "إضافة خيار جديد",
    currentSubtitle: "الخيارات الحالية",
    empty:
      "لا توجد خيارات بعد — المنتج يُعرض كمنتج بسيط بالسعر الأساسي. أضف خيارًا عند الحاجة لتعدد المواصفات أو لتتبّع مخزون أدق.",
    slot1: "مواصفة 1 — الحجم / السعة / النكهة",
    slot2: "مواصفة 2 — اللون / الإصدار / العبوة",
    slot1Placeholder: "مثال: M أو 500ml",
    slot2Placeholder: "مثال: أحمر أو v2",
    addButton: "إضافة خيار",
    orderSlot1: "المواصفة 1",
    orderSlot2: "المواصفة 2",
  };
}

/**
 * Group low-stock variant rows by size (clothing inventory overview).
 * @param {Array<{ size?: string|null, stock_qty?: number|string, product_name?: string }>} items
 */
export function groupLowStockBySize(items) {
  const map = new Map();
  for (const item of items || []) {
    const sizeRaw = item?.size != null ? String(item.size).trim() : "";
    const key = sizeRaw || "بدون مقاس";
    const prev = map.get(key) || { size: key, count: 0, out_of_stock: 0, units: 0 };
    const stock = Number(item.stock_qty || 0);
    prev.count += 1;
    prev.units += stock;
    if (stock === 0) prev.out_of_stock += 1;
    map.set(key, prev);
  }
  return [...map.values()].sort((a, b) => a.size.localeCompare(b.size, "ar"));
}
