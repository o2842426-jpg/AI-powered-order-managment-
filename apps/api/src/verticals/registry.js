const {
  normalizeStoreVertical,
  STORE_VERTICALS,
} = require("../modules/stores/storeOnboarding.constants");

/** @typedef {'clothing' | 'electronics' | 'beauty' | 'home' | 'real_estate' | 'food' | 'other'} VerticalId */

/**
 * Vertical capability flags consumed by API + owner UI.
 * @type {Record<string, object>}
 */
const VERTICAL_DEFINITIONS = {
  clothing: {
    id: "clothing",
    label_ar: STORE_VERTICALS.clothing,
    features: {
      product_variants: true,
      size_chart: true,
      apparel_order_pipeline: true,
      clothing_sales_engine: true,
    },
    dashboard: {
      show_variant_widgets: true,
      show_size_chart_field: true,
      products_tab_hint_ar: "أضف مقاسات وألوان لكل منتج (variants).",
    },
    plan_features: {
      sales_engine: "clothing_sales_engine",
    },
  },
  electronics: {
    id: "electronics",
    label_ar: STORE_VERTICALS.electronics,
    features: {
      product_variants: false,
      specs_focus: true,
    },
    dashboard: {
      show_variant_widgets: false,
      products_tab_hint_ar: "ركّز على المواصفات والضمان.",
    },
  },
  beauty: {
    id: "beauty",
    label_ar: STORE_VERTICALS.beauty,
    features: { product_variants: true },
    dashboard: { show_variant_widgets: true },
  },
  home: {
    id: "home",
    label_ar: STORE_VERTICALS.home,
    features: {},
    dashboard: {},
  },
  real_estate: {
    id: "real_estate",
    label_ar: STORE_VERTICALS.real_estate,
    features: { lead_focus: true },
    dashboard: {},
  },
  food: {
    id: "food",
    label_ar: STORE_VERTICALS.food,
    features: {},
    dashboard: {},
  },
  other: {
    id: "other",
    label_ar: STORE_VERTICALS.other,
    features: {},
    dashboard: {},
  },
};

const DEFAULT_VERTICAL = VERTICAL_DEFINITIONS.other;

/**
 * @param {unknown} rawVertical
 */
function resolveVerticalDefinition(rawVertical) {
  const id = normalizeStoreVertical(rawVertical) || "other";
  return VERTICAL_DEFINITIONS[id] || DEFAULT_VERTICAL;
}

/**
 * @param {unknown} rawVertical
 */
function isClothingVertical(rawVertical) {
  return normalizeStoreVertical(rawVertical) === "clothing";
}

module.exports = {
  VERTICAL_DEFINITIONS,
  resolveVerticalDefinition,
  isClothingVertical,
};
