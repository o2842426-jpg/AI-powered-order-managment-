import { useEffect, useMemo, useState } from "react";
import { authFetch, getOwnerStoreIdFromAuth } from "../lib/auth";
import { buildPublicStorefrontUrl } from "../lib/storefrontUrl";
import { formatProductOptionSummary } from "../lib/productOptions";
import "./OwnerDashboardPage.css";

const EMPTY_PRODUCT = {
  name: "",
  description: "",
  image_url: "",
  base_price: "",
};
const EMPTY_VARIANT = {
  size: "",
  color: "",
  price: "",
  stock_qty: 0,
  sku: "",
};

const AI_STYLE_PRESETS = [
  {
    id: "warm",
    label: "ودي ودافئ",
    text: "تحدث بلهجة ودية ودافئة، رحب بالعميل، وكن متعاطفًا مع أسئلته دون إطالة.",
  },
  {
    id: "concise",
    label: "مختصر واحترافي",
    text: "أجب بجمل قصيرة وواضحة، ركز على المنتج والسعر والتوصيل، وتجنب الحشو.",
  },
  {
    id: "luxury",
    label: "فاخر وراقٍ",
    text: "استخدم صياغة أنيقة وهادئة تليق بعلامة راقية؛ تجنب المبالغة أو الألفاظ المبالغ فيها.",
  },
];

/** يُستخدم إذا كان الـ API لا يزال يعيد ملخصًا بدون حقل analytics */
const EMPTY_DASHBOARD_ANALYTICS = {
  clv: {
    avg_revenue_per_customer: 0,
    ordering_customers: 0,
    lifetime_revenue: 0,
  },
  retention_30d: {
    rate_percent: null,
    ordering_customers_30d: 0,
    repeat_customers_30d: 0,
  },
  cart_abandonment: {
    rate_percent: null,
    abandoned_sessions: 0,
    engaged_sessions: 0,
  },
  inventory_turnover: {
    slow_movers: [],
    fast_movers: [],
  },
  sales_forecast: {
    next_month_expected: null,
    trend_slope_per_month: null,
    monthly_series: [],
    method: "linear_regression",
  },
  income_chart: {
    day: [],
    week: [],
    month: [],
    year: [],
  },
};

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const USD_FULL = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatUsd(n) {
  const x = Number(n) || 0;
  if (Math.abs(x) >= 1000) return USD_COMPACT.format(x);
  return USD_FULL.format(x);
}

function StatSpark({ values }) {
  const nums = values.map((v) => Number(v) || 0);
  const max = Math.max(...nums, 1);
  return (
    <div className="owner-dashboard__spark" aria-hidden>
      {nums.map((v, i) => (
        <span key={i} style={{ height: `${Math.max(10, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

const INCOME_RANGE_TABS = [
  { id: "day", label: "يوم" },
  { id: "week", label: "أسبوع" },
  { id: "month", label: "شهر" },
  { id: "year", label: "سنة" },
];

function OwnerIncomeChartCard({ incomeChart }) {
  const [range, setRange] = useState("day");
  const safe = {
    ...EMPTY_DASHBOARD_ANALYTICS.income_chart,
    ...(incomeChart && typeof incomeChart === "object" ? incomeChart : {}),
  };
  const rows = Array.isArray(safe[range]) ? safe[range] : [];
  const maxVal = Math.max(
    1,
    ...rows.flatMap((r) => [Number(r.settled) || 0, Number(r.pipeline) || 0])
  );
  const totalSettled = rows.reduce((s, r) => s + (Number(r.settled) || 0), 0);
  const totalPipeline = rows.reduce((s, r) => s + (Number(r.pipeline) || 0), 0);

  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((t) => ({
    t,
    label: formatUsd(maxVal * t),
  }));

  return (
    <div className="owner-dashboard__income-card">
      <div className="owner-dashboard__income-top">
        <div className="owner-dashboard__income-intro">
          <h3 className="owner-dashboard__income-title">نظرة على الإيراد</h3>
          <p className="owner-dashboard__income-lead">
            عمودان لكل فترة: <strong>مكتمل</strong> (تسليم أو شحن) و<strong>قيد المعالجة</strong> (جديد
            أو مؤكد) — بالدولار الأمريكي.
          </p>
          <div className="owner-dashboard__income-legend" aria-hidden>
            <span className="owner-dashboard__income-legend-item">
              <i className="owner-dashboard__income-swatch owner-dashboard__income-swatch--settled" />
              {formatUsd(totalSettled)} <small>مكتمل</small>
            </span>
            <span className="owner-dashboard__income-legend-item">
              <i className="owner-dashboard__income-swatch owner-dashboard__income-swatch--pipeline" />
              {formatUsd(totalPipeline)} <small>قيد المعالجة</small>
            </span>
          </div>
        </div>
        <div className="owner-dashboard__income-tabs" role="tablist" aria-label="فترة الإيراد">
          {INCOME_RANGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={range === tab.id}
              className={
                range === tab.id
                  ? "owner-dashboard__income-tab is-active"
                  : "owner-dashboard__income-tab"
              }
              onClick={() => setRange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="owner-dashboard__income-empty">لا بيانات إيراد في هذه الفترة بعد.</p>
      ) : (
        <div className="owner-dashboard__income-chart">
          <div className="owner-dashboard__income-y" aria-hidden>
            {yTicks.map(({ t, label }) => (
              <span key={t} className="owner-dashboard__income-y-tick">
                {label}
              </span>
            ))}
          </div>
          <div className="owner-dashboard__income-grid">
            {rows.map((row) => (
              <div key={row.key} className="owner-dashboard__income-col">
                <div className="owner-dashboard__income-pair">
                  <div
                    className="owner-dashboard__income-bar owner-dashboard__income-bar--settled"
                    style={{
                      height:
                        (Number(row.settled) || 0) <= 0
                          ? "2px"
                          : `${Math.max(6, ((Number(row.settled) || 0) / maxVal) * 100)}%`,
                    }}
                    title={`مكتمل: ${formatUsd(row.settled)}`}
                  />
                  <div
                    className="owner-dashboard__income-bar owner-dashboard__income-bar--pipeline"
                    style={{
                      height:
                        (Number(row.pipeline) || 0) <= 0
                          ? "2px"
                          : `${Math.max(6, ((Number(row.pipeline) || 0) / maxVal) * 100)}%`,
                    }}
                    title={`قيد المعالجة: ${formatUsd(row.pipeline)}`}
                  />
                </div>
                <span className="owner-dashboard__income-x">{row.label ?? row.key}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatTrialEndsAr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ar", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function trialCalendarDaysLeft(iso) {
  const endMs = Date.parse(String(iso));
  if (Number.isNaN(endMs)) return null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endDay = new Date(endMs);
  endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDay - startOfToday) / 86400000));
}

export function OwnerDashboardPage({
  panel = "overview",
  onNavigate,
  onGoToOrders,
  onPreviewStore,
  billingStatus = null,
}) {
  const storeId = getOwnerStoreIdFromAuth();
  const [settings, setSettings] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState("");
  const [lowStockItems, setLowStockItems] = useState([]);
  const [lowStockLoading, setLowStockLoading] = useState(false);
  const [lowStockError, setLowStockError] = useState("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [publicLinkCopied, setPublicLinkCopied] = useState(false);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState("");
  const [productDraft, setProductDraft] = useState(EMPTY_PRODUCT);
  const [productSaving, setProductSaving] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productEdit, setProductEdit] = useState(null);

  const [variants, setVariants] = useState([]);
  const [variantsLoading, setVariantsLoading] = useState(false);
  const [variantDraft, setVariantDraft] = useState(EMPTY_VARIANT);
  const [variantSaving, setVariantSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [dashboardMsg, setDashboardMsg] = useState("");

  useEffect(() => {
    if (!storeId) {
      setSummary(null);
      setSummaryError("");
      setLowStockItems([]);
      setLowStockError("");
      setSettings(null);
      setSettingsError("");
      setProducts([]);
      setProductsError("");
      setProductsLoading(false);
      setLowStockLoading(false);
      return;
    }
    loadSummary();
    loadLowStock();
    loadSettings();
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- إعادة التحميل عند تغيّر المتجر فقط
  }, [storeId]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [panel]);

  useEffect(() => {
    const selected = products.find((product) => product.id === selectedProductId);
    if (!selected) {
      setProductEdit(null);
      setVariants([]);
      return;
    }

    setProductEdit({
      name: selected.name,
      description: selected.description ?? "",
      image_url: selected.image_url ?? "",
      base_price: selected.base_price,
      is_active: Boolean(selected.is_active),
    });
    loadVariants(selected.id);
  }, [products, selectedProductId]);

  async function loadSettings() {
    setSettingsError("");
    setSettingsMsg("");

    try {
      const res = await authFetch(`/api/stores/${storeId}/settings`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحميل الإعدادات (${res.status})`);
      }
      setSettings(body.data ?? null);
    } catch (error) {
      setSettingsError(error.message || "تعذر تحميل إعدادات المتجر.");
      setSettings(null);
    }
  }

  async function loadSummary() {
    setSummaryError("");

    try {
      const res = await authFetch(`/api/stores/${storeId}/summary`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحميل الملخص (${res.status})`);
      }
      setSummary(body.data ?? null);
    } catch (error) {
      setSummaryError(error.message || "تعذر تحميل ملخص المتجر.");
      setSummary(null);
    }
  }

  async function loadLowStock() {
    setLowStockLoading(true);
    setLowStockError("");

    try {
      const res = await authFetch(`/api/stores/${storeId}/low-stock`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحميل المخزون المنخفض (${res.status})`);
      }
      setLowStockItems(Array.isArray(body.data) ? body.data : []);
    } catch (error) {
      setLowStockError(error.message || "تعذر تحميل قائمة المخزون المنخفض.");
      setLowStockItems([]);
    } finally {
      setLowStockLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings || !storeId) return;

    setSettingsSaving(true);
    setSettingsError("");
    setSettingsMsg("");

    try {
      const res = await authFetch(`/api/stores/${storeId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر حفظ الإعدادات (${res.status})`);
      }
      setSettings(body.data ?? null);
      setSettingsMsg("تم حفظ إعدادات المتجر.");
    } catch (error) {
      setSettingsError(error.message || "تعذر حفظ إعدادات المتجر.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function loadProducts() {
    setProductsLoading(true);
    setProductsError("");

    try {
      const res = await authFetch("/api/products");
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحميل المنتجات (${res.status})`);
      }
      const storeProducts = (body.data || []).filter(
        (product) => String(product.store_id) === String(storeId)
      );
      setProducts(storeProducts);
      if (!selectedProductId && storeProducts.length > 0) {
        setSelectedProductId(storeProducts[0].id);
      }
    } catch (error) {
      setProductsError(error.message || "تعذر تحميل المنتجات.");
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }

  async function createProduct() {
    if (!storeId) {
      setDashboardMsg("تعذر تحديد المتجر من الجلسة.");
      return;
    }
    setProductSaving(true);
    setDashboardMsg("");

    try {
      const res = await authFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_id: Number(storeId),
          name: productDraft.name,
          description: productDraft.description || null,
          image_url: productDraft.image_url || null,
          base_price: Number(productDraft.base_price),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر إنشاء المنتج (${res.status})`);
      }
      setProductDraft(EMPTY_PRODUCT);
      setSelectedProductId(body.data?.id ?? null);
      setDashboardMsg("تم إنشاء المنتج.");
      await loadSummary();
      await loadLowStock();
      await loadProducts();
    } catch (error) {
      setDashboardMsg(error.message || "تعذر إنشاء المنتج.");
    } finally {
      setProductSaving(false);
    }
  }

  async function saveSelectedProduct() {
    if (!selectedProductId || !productEdit) return;

    setProductSaving(true);
    setDashboardMsg("");

    try {
      const res = await authFetch(`/api/products/${selectedProductId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...productEdit,
          base_price: Number(productEdit.base_price),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تعديل المنتج (${res.status})`);
      }
      setDashboardMsg("تم تعديل المنتج.");
      await loadSummary();
      await loadLowStock();
      await loadProducts();
    } catch (error) {
      setDashboardMsg(error.message || "تعذر تعديل المنتج.");
    } finally {
      setProductSaving(false);
    }
  }

  async function updateProductVisibility(product, isActive) {
    setProductSaving(true);
    setDashboardMsg("");

    try {
      const res = await authFetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: product.name,
          description: product.description,
          image_url: product.image_url,
          base_price: Number(product.base_price),
          is_active: isActive,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحديث المنتج (${res.status})`);
      }

      setDashboardMsg(isActive ? "تم إظهار المنتج في المتجر." : "تم إخفاء المنتج من المتجر.");
      await loadSummary();
      await loadLowStock();
      await loadProducts();
    } catch (error) {
      setDashboardMsg(error.message || "تعذر تحديث المنتج.");
    } finally {
      setProductSaving(false);
    }
  }

  function archiveProduct(product) {
    const confirmed = window.confirm(
      "سيتم إخفاء المنتج من واجهة العميل. الطلبات القديمة ستبقى محفوظة. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    updateProductVisibility(product, false);
  }

  async function uploadProductImage(file, target) {
    if (!file) return;

    setImageUploading(true);
    setDashboardMsg("");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await authFetch("/api/uploads/product-image", {
        method: "POST",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر رفع الصورة (${res.status})`);
      }

      const imageUrl = body.data?.image_url || "";
      if (target === "create") {
        setProductDraft((prev) => ({ ...prev, image_url: imageUrl }));
      } else {
        setProductEdit((prev) => ({ ...prev, image_url: imageUrl }));
      }
      setDashboardMsg("تم رفع الصورة. احفظ المنتج لتثبيت الرابط.");
    } catch (error) {
      setDashboardMsg(error.message || "تعذر رفع الصورة.");
    } finally {
      setImageUploading(false);
    }
  }

  async function uploadStoreLogo(file) {
    if (!file) return;

    setImageUploading(true);
    setSettingsMsg("");
    setSettingsError("");

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await authFetch("/api/uploads/store-logo", {
        method: "POST",
        body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر رفع اللوجو (${res.status})`);
      }

      setSettings((prev) => ({
        ...prev,
        logo_url: body.data?.image_url || "",
      }));
      setSettingsMsg("تم رفع اللوجو. احفظ الإعدادات لتثبيته.");
    } catch (error) {
      setSettingsError(error.message || "تعذر رفع اللوجو.");
    } finally {
      setImageUploading(false);
    }
  }

  async function loadVariants(productId) {
    setVariantsLoading(true);

    try {
      const res = await authFetch(`/api/products/${productId}/variants`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تحميل الخيارات (${res.status})`);
      }
      setVariants(body.data || []);
    } catch (error) {
      setDashboardMsg(error.message || "تعذر تحميل خيارات المنتج.");
      setVariants([]);
    } finally {
      setVariantsLoading(false);
    }
  }

  async function createVariant() {
    if (!selectedProductId) return;

    const stockRaw = String(variantDraft.stock_qty ?? "").trim();
    const stock = stockRaw === "" ? NaN : Number(stockRaw);
    if (!Number.isInteger(stock) || stock < 0) {
      setDashboardMsg("أدخل كمية مخزون صحيحة (رقم صحيح ≥ 0) لهذا الخيار.");
      return;
    }

    let pricePayload = null;
    if (variantDraft.price !== "" && variantDraft.price != null) {
      const p = Number(variantDraft.price);
      if (Number.isNaN(p) || p < 0) {
        setDashboardMsg("السعر الاختياري غير صالح.");
        return;
      }
      pricePayload = p;
    }

    setVariantSaving(true);
    setDashboardMsg("");

    try {
      const res = await authFetch(
        `/api/products/${selectedProductId}/variants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            size: String(variantDraft.size ?? "").trim() || null,
            color: String(variantDraft.color ?? "").trim() || null,
            price: pricePayload,
            stock_qty: stock,
            sku: String(variantDraft.sku ?? "").trim() || null,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر إنشاء الخيار (${res.status})`);
      }
      setVariantDraft(EMPTY_VARIANT);
      setDashboardMsg("تم إنشاء خيار المنتج.");
      await loadSummary();
      await loadLowStock();
      await loadVariants(selectedProductId);
    } catch (error) {
      setDashboardMsg(error.message || "تعذر إنشاء خيار المنتج.");
    } finally {
      setVariantSaving(false);
    }
  }

  async function saveVariant(variant) {
    if (!selectedProductId) return;

    setVariantSaving(true);
    setDashboardMsg("");

    try {
      const res = await authFetch(
        `/api/products/${selectedProductId}/variants/${variant.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...variant,
            stock_qty: Number(variant.stock_qty),
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || `تعذر تعديل الخيار (${res.status})`);
      }
      setDashboardMsg("تم تعديل خيار المنتج.");
      await loadSummary();
      await loadLowStock();
      await loadVariants(selectedProductId);
    } catch (error) {
      setDashboardMsg(error.message || "تعذر تعديل خيار المنتج.");
    } finally {
      setVariantSaving(false);
    }
  }

  async function updateVariantVisibility(variant, isActive) {
    if (!selectedProductId) return;

    await saveVariant({
      ...variant,
      is_active: isActive,
    });
  }

  function archiveVariant(variant) {
    const confirmed = window.confirm(
      "سيتم إخفاء هذا الخيار من واجهة العميل والـ AI. الطلبات القديمة ستبقى محفوظة. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    updateVariantVisibility(variant, false);
  }

  function updateVariantDraft(index, field, value) {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: value,
      };
      return next;
    });
  }

  function focusLowStockItem(item) {
    setSelectedProductId(item.product_id);
    onNavigate?.("products");
  }

  const hasStoreBasics = Boolean(
    settings?.name?.trim() && settings?.phone?.trim() && settings?.delivery_info?.trim()
  );
  const hasProducts = products.length > 0;
  const hasProductImage = products.some((product) => product.image_url);
  const hasSelectedProductOptions = variants.length > 0;
  const hasAiPrompt = Boolean(settings?.ai_prompt?.trim());
  const onboardingSteps = [
    {
      label: "اضبط معلومات المتجر",
      hint: "الاسم، الهاتف، ومعلومات التوصيل تظهر للعميل.",
      done: hasStoreBasics,
      target: "settings",
    },
    {
      label: "أضف أول منتج",
      hint: "ابدأ باسم واضح، وصف قصير، وسعر أساسي.",
      done: hasProducts,
      target: "products",
    },
    {
      label: "أضف صورة للمنتج",
      hint: "الصورة ترفع الثقة وتقلل أسئلة العميل.",
      done: hasProductImage,
      target: "products",
    },
    {
      label: "أضف مواصفات خيارات المنتج والمخزون",
      hint: "أضف مواصفات الخيارات والكمية لتكون الطلبات أوضح للعميل.",
      done: hasSelectedProductOptions,
      target: "products",
    },
    {
      label: "علّم مساعد AI أسلوبك",
      hint: "اكتب طريقة الرد، سياسة التوصيل، وما يجب اقتراحه.",
      done: hasAiPrompt,
      target: "ai",
    },
  ];
  const completedOnboardingSteps = onboardingSteps.filter((step) => step.done).length;
  const onboardingProgress = Math.round(
    (completedOnboardingSteps / onboardingSteps.length) * 100
  );

  const showOverview = panel === "overview";
  const showProducts = panel === "products";
  const showInventory = panel === "inventory";
  const showCustomers = panel === "customers";
  const showAi = panel === "ai";
  const showSettings = panel === "settings";

  const publicStoreUrl = useMemo(() => {
    const slug = settings?.slug != null ? String(settings.slug).trim() : "";
    if (!slug) return "";
    return buildPublicStorefrontUrl(slug);
  }, [settings?.slug]);

  const showTrialBanner =
    Boolean(billingStatus?.billing_enforced) &&
    Boolean(billingStatus?.has_access) &&
    billingStatus?.access_reason === "in_trial" &&
    Boolean(billingStatus?.trial_ends_at);

  const trialEndsLabel =
    showTrialBanner && billingStatus?.trial_ends_at
      ? formatTrialEndsAr(billingStatus.trial_ends_at)
      : "";

  const trialDaysLeft =
    showTrialBanner && billingStatus?.trial_ends_at != null
      ? trialCalendarDaysLeft(billingStatus.trial_ends_at)
      : null;

  const newVariantStockDraft = String(variantDraft.stock_qty ?? "").trim();
  const newVariantStockNum = newVariantStockDraft === "" ? NaN : Number(newVariantStockDraft);
  const newVariantStockValid =
    Number.isInteger(newVariantStockNum) && newVariantStockNum >= 0;

  return (
    <div className="owner-dashboard">
      {!storeId && (
        <p className="owner-dashboard__error" role="alert">
          لم يُعثر على معرّف المتجر في جلسة المالك. جرّب تسجيل الخروج والدخول مجددًا.
        </p>
      )}
      {!showOverview && (
        <div className="owner-dashboard__panel-top">
          <div className="owner-dashboard__store-switcher owner-dashboard__store-switcher--inline owner-dashboard__store-switcher--readonly">
            <span>معرّف متجرك</span>
            <strong dir="ltr">{storeId || "—"}</strong>
            <small className="owner-dashboard__muted">من جلسة تسجيل الدخول</small>
          </div>
        </div>
      )}

      {showOverview && (
      <>
      <section className="owner-dashboard__hero">
        <div className="owner-dashboard__hero-main">
          <p className="owner-dashboard__eyebrow">مرحبًا بك</p>
          <h1 className="owner-dashboard__hero-title">متجرك تحت السيطرة</h1>
          <p className="owner-dashboard__hero-lead">
            راقب الطلبات والمخزون، وضبط مساعد الذكاء الاصطناعي ليتكلم باسم علامتك —
            من لوحة واحدة بهدوء ووضوح.
          </p>
          <div className="owner-dashboard__hero-cta">
            <button
              type="button"
              className="dm-btn dm-btn--primary"
              onClick={() => onNavigate?.("products")}
            >
              إضافة منتج
            </button>
            <button
              type="button"
              className="dm-btn dm-btn--secondary"
              onClick={() => onGoToOrders?.()}
            >
              مراجعة الطلبات
            </button>
            <button
              type="button"
              className="dm-btn dm-btn--ghost"
              onClick={() => onPreviewStore?.()}
            >
              معاينة المتجر
            </button>
          </div>
          {summary && (
            <p className="owner-dashboard__hero-summary">
              <strong>{summary.new_orders}</strong> طلبات تحتاج متابعة ·{" "}
              <strong>{summary.low_stock_variants}</strong> عناصر مخزون منخفض ·{" "}
              <strong>{summary.active_products}</strong> منتجات نشطة
            </p>
          )}
        </div>
        <div className="owner-dashboard__hero-aside">
          <div className="owner-dashboard__store-switcher owner-dashboard__store-switcher--readonly">
            <span>معرّف متجرك</span>
            <strong dir="ltr">{storeId || "—"}</strong>
            <small className="owner-dashboard__muted">من جلسة تسجيل الدخول</small>
          </div>
        </div>
      </section>

      {showTrialBanner && (
        <div className="owner-dashboard__trial-banner" role="status">
          <div className="owner-dashboard__trial-banner-body">
            <p className="owner-dashboard__trial-banner-title">فترة التجربة نشطة</p>
            <p className="owner-dashboard__trial-banner-text">
              {trialDaysLeft != null && (
                <>
                  متبقٍ تقريبًا <strong>{trialDaysLeft}</strong> يومًا تقويميًا حتى نهاية الفترة.
                  {trialEndsLabel ? " " : ""}
                </>
              )}
              {trialEndsLabel ? (
                <>
                  تنتهي الفترة في <strong dir="ltr">{trialEndsLabel}</strong>.
                </>
              ) : null}
            </p>
          </div>
          <div className="owner-dashboard__trial-banner-actions">
            <button
              type="button"
              className="dm-btn dm-btn--primary dm-btn--sm"
              onClick={() => onNavigate?.("upgrade")}
            >
              خطط الاشتراك
            </button>
          </div>
        </div>
      )}

      {publicStoreUrl ? (
        <section className="owner-dashboard__public-link" aria-label="رابط المتجر العام">
          <div className="owner-dashboard__public-link-head">
            <div>
              <p className="owner-dashboard__public-link-eyebrow">رابط المتجر</p>
              <h2 className="owner-dashboard__public-link-title">شارك متجرك مع الزبائن</h2>
              <p className="owner-dashboard__public-link-hint">
                يفتح واجهة المتجر العامة مع معرّف متجرك. انسخه في الواتساب، البايو، أو الإعلانات.
              </p>
            </div>
          </div>
          <div className="owner-dashboard__public-link-row">
            <code className="owner-dashboard__public-link-url" dir="ltr">
              {publicStoreUrl}
            </code>
            <div className="owner-dashboard__public-link-actions">
              <button
                type="button"
                className="dm-btn dm-btn--secondary dm-btn--sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(publicStoreUrl);
                    setPublicLinkCopied(true);
                    window.setTimeout(() => setPublicLinkCopied(false), 2200);
                  } catch {
                    window.prompt("انسخ الرابط:", publicStoreUrl);
                  }
                }}
              >
                {publicLinkCopied ? "تم النسخ" : "نسخ الرابط"}
              </button>
              <a
                className="dm-btn dm-btn--ghost dm-btn--sm"
                href={publicStoreUrl}
                target="_blank"
                rel="noreferrer"
              >
                فتح في تبويب جديد
              </a>
            </div>
          </div>
        </section>
      ) : null}

      {summaryError && <p className="owner-dashboard__error">{summaryError}</p>}
      {summary && (
        <>
          <section className="owner-dashboard__summary" aria-label="ملخص المتجر">
            <article className="owner-dashboard__summary-card">
              <StatSpark values={[summary.total_products, summary.active_products, summary.total_products]} />
              <div className="owner-dashboard__summary-body">
                <div>
                  <span>المنتجات</span>
                  <small>{summary.active_products} نشط</small>
                </div>
                <strong>{summary.total_products}</strong>
              </div>
            </article>
            <article className="owner-dashboard__summary-card is-attention">
              <StatSpark values={[summary.new_orders, summary.new_orders + 1, 0, summary.new_orders]} />
              <div className="owner-dashboard__summary-body">
                <div>
                  <span>طلبات جديدة</span>
                  <small>تحتاج متابعة</small>
                </div>
                <strong>{summary.new_orders}</strong>
              </div>
            </article>
            <article className="owner-dashboard__summary-card">
              <StatSpark
                values={[summary.low_stock_variants, 3, summary.low_stock_variants, 1]}
              />
              <div className="owner-dashboard__summary-body">
                <div>
                  <span>مخزون منخفض</span>
                  <small>3 وحدات مخزون أو أقل</small>
                </div>
                <strong>{summary.low_stock_variants}</strong>
              </div>
            </article>
            <article className="owner-dashboard__summary-card owner-dashboard__summary-card--wide">
              <StatSpark values={[1, 2, 3, 4, 5]} />
              <div className="owner-dashboard__summary-body">
                <div>
                  <span>آخر طلب</span>
                  <small>
                    {summary.latest_order
                      ? `${summary.latest_order.customer_name ?? "عميل"} — ${formatUsd(summary.latest_order.total_amount)}`
                      : "لم تصل طلبات بعد"}
                  </small>
                </div>
                <strong>
                  {summary.latest_order ? `#${summary.latest_order.id}` : "—"}
                </strong>
              </div>
            </article>
          </section>

          {(() => {
            const analytics = summary.analytics ?? EMPTY_DASHBOARD_ANALYTICS;
            return (
            <section
              className="owner-dashboard__summary owner-dashboard__summary--analytics"
              aria-label="مقاييس متقدمة"
            >
              <article className="owner-dashboard__summary-card">
                <StatSpark
                  values={[
                    analytics.clv.avg_revenue_per_customer,
                    analytics.clv.avg_revenue_per_customer * 0.85,
                    analytics.clv.avg_revenue_per_customer * 1.05,
                    analytics.clv.ordering_customers,
                  ]}
                />
                <div className="owner-dashboard__summary-body">
                  <div>
                    <span>قيمة العميل (CLV)</span>
                    <small>
                      متوسط إيراد لكل عميل طلب · {analytics.clv.ordering_customers} عميل
                    </small>
                  </div>
                  <strong>{formatUsd(analytics.clv.avg_revenue_per_customer)}</strong>
                </div>
              </article>

              <article className="owner-dashboard__summary-card">
                <StatSpark
                  values={[
                    analytics.retention_30d.repeat_customers_30d,
                    analytics.retention_30d.ordering_customers_30d,
                    analytics.retention_30d.repeat_customers_30d,
                    Math.max(
                      0,
                      analytics.retention_30d.ordering_customers_30d -
                        analytics.retention_30d.repeat_customers_30d
                    ),
                  ]}
                />
                <div className="owner-dashboard__summary-body">
                  <div>
                    <span>الاحتفاظ (30 يومًا)</span>
                    <small>
                      عملاء بأكثر من طلب / عملاء طلبوا خلال 30 يومًا
                    </small>
                  </div>
                  <strong>
                    {analytics.retention_30d.rate_percent == null
                      ? "—"
                      : `${analytics.retention_30d.rate_percent}%`}
                  </strong>
                </div>
              </article>

              <article className="owner-dashboard__summary-card">
                <StatSpark
                  values={[
                    analytics.cart_abandonment.abandoned_sessions,
                    analytics.cart_abandonment.engaged_sessions,
                    analytics.cart_abandonment.abandoned_sessions,
                    1,
                  ]}
                />
                <div className="owner-dashboard__summary-body">
                  <div>
                    <span>هجر الجلسات</span>
                    <small>
                      جلسات دردشة بعميل معروف دون طلب لاحق ·{" "}
                      {analytics.cart_abandonment.abandoned_sessions} /{" "}
                      {analytics.cart_abandonment.engaged_sessions}
                    </small>
                  </div>
                  <strong>
                    {analytics.cart_abandonment.rate_percent == null
                      ? "—"
                      : `${analytics.cart_abandonment.rate_percent}%`}
                  </strong>
                </div>
              </article>

              <article className="owner-dashboard__summary-card owner-dashboard__summary-card--inventory">
                <StatSpark
                  values={[
                    analytics.inventory_turnover.slow_movers.length,
                    analytics.inventory_turnover.fast_movers.length,
                    2,
                    1,
                  ]}
                />
                <div className="owner-dashboard__summary-body">
                  <div>
                    <span>دوران المخزون</span>
                    <small>تنبيه بطيء / سريع الحركة (آخر 30 يومًا)</small>
                  </div>
                  <strong>
                    {analytics.inventory_turnover.slow_movers.length} /{" "}
                    {analytics.inventory_turnover.fast_movers.length}
                  </strong>
                </div>
                <div className="owner-dashboard__turnover-grid">
                  <div>
                    <p className="owner-dashboard__turnover-label owner-dashboard__turnover-label--slow">
                      بطيء
                    </p>
                    <ul className="owner-dashboard__turnover-list">
                      {analytics.inventory_turnover.slow_movers.length === 0 ? (
                        <li className="owner-dashboard__turnover-empty">لا عناصر</li>
                      ) : (
                        analytics.inventory_turnover.slow_movers.map((row) => (
                          <li key={`${row.product_name}-${row.variant_label}-slow`}>
                            <span>{row.product_name}</span>
                            <small>
                              {row.variant_label} · بيع {row.sold_30d} · مخزون {row.stock_qty}
                            </small>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  <div>
                    <p className="owner-dashboard__turnover-label owner-dashboard__turnover-label--fast">
                      سريع
                    </p>
                    <ul className="owner-dashboard__turnover-list">
                      {analytics.inventory_turnover.fast_movers.length === 0 ? (
                        <li className="owner-dashboard__turnover-empty">لا عناصر</li>
                      ) : (
                        analytics.inventory_turnover.fast_movers.map((row) => (
                          <li key={`${row.product_name}-${row.variant_label}-fast`}>
                            <span>{row.product_name}</span>
                            <small>
                              {row.variant_label} · بيع {row.sold_30d} · مخزون {row.stock_qty}
                            </small>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                </div>
              </article>

              <article className="owner-dashboard__summary-card">
                <StatSpark
                  values={
                    analytics.sales_forecast.monthly_series.length > 0
                      ? analytics.sales_forecast.monthly_series.map((m) => m.revenue)
                      : [0, 0, 0]
                  }
                />
                <div className="owner-dashboard__summary-body">
                  <div>
                    <span>توقع الشهر القادم</span>
                    <small>
                      انحدار خطي على آخر {analytics.sales_forecast.monthly_series.length}{" "}
                      أشهر بمبيعات
                    </small>
                  </div>
                  <strong>
                    {analytics.sales_forecast.next_month_expected == null
                      ? "—"
                      : formatUsd(analytics.sales_forecast.next_month_expected)}
                  </strong>
                </div>
              </article>
            </section>
            );
          })()}
        </>
      )}

      {summary && (
        <section className="owner-dashboard__analytics-charts" aria-label="مخطط الإيراد">
          <div className="owner-dashboard__analytics-charts-head">
            <p className="owner-dashboard__eyebrow">تحليلات</p>
            <h2 className="owner-dashboard__analytics-charts-title">الإيراد حسب اليوم والأسبوع والشهر والسنة</h2>
            <p className="owner-dashboard__analytics-charts-desc">
              مخطط أعمدة مزدوجة بالدولار الأمريكي (USD): مبالغ مكتملة التسليم/الشحن مقابل مبالغ قيد المعالجة.
            </p>
          </div>
          <OwnerIncomeChartCard
            incomeChart={(summary.analytics ?? EMPTY_DASHBOARD_ANALYTICS).income_chart}
          />
        </section>
      )}

      <section className="owner-dashboard__onboarding">
        <div className="owner-dashboard__onboarding-intro">
          <p className="owner-dashboard__eyebrow">ابدأ من هنا</p>
          <h2>جهّز المتجر للبيع بخطوات بسيطة</h2>
          <p>
            هذه القائمة تساعدك تعرف ما الذي اكتمل وما الذي يحتاج تعديل قبل أن
            يراه العميل.
          </p>
          <div className="owner-dashboard__progress">
            <span style={{ width: `${onboardingProgress}%` }} />
          </div>
          <strong>{completedOnboardingSteps} / {onboardingSteps.length} مكتملة</strong>
        </div>

        <div className="owner-dashboard__checklist">
          {onboardingSteps.map((step) => (
            <button
              key={step.label}
              type="button"
              className={
                step.done
                  ? "owner-dashboard__check-item is-done"
                  : "owner-dashboard__check-item"
              }
              onClick={() => onNavigate?.(step.target)}
            >
              <span>{step.done ? "✓" : "•"}</span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </div>
            </button>
          ))}
        </div>

        <div className="owner-dashboard__quick-actions">
          <button
            type="button"
            className="dm-btn dm-btn--secondary dm-btn--inline"
            onClick={() => onNavigate?.("products")}
          >
            إضافة منتج
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--ghost dm-btn--inline"
            onClick={() => onNavigate?.("products")}
          >
            إدارة المنتجات
          </button>
          <button
            type="button"
            className="dm-btn dm-btn--ghost dm-btn--inline"
            onClick={() => onNavigate?.("products")}
          >
            إدارة الخيارات
          </button>
        </div>
      </section>
      </>
      )}

      {showCustomers && (
        <section className="owner-dashboard__surface" id="customers-section">
          <div className="owner-dashboard__section-head">
            <div>
              <p className="owner-dashboard__eyebrow">العملاء</p>
              <h2 className="owner-dashboard__section-title">علاقات أوضح مع من يشتري منك</h2>
              <p className="owner-dashboard__section-desc">
                سنربط هنا ملخص العملاء وتكرار الطلبات عندما تصبح البيانات جاهزة في المنصة.
              </p>
            </div>
          </div>
          <div className="owner-dashboard__empty-state">
            <p>حاليًا يمكنك متابعة بيانات التواصل من صفحة الطلبات.</p>
            <button type="button" className="dm-btn dm-btn--primary" onClick={() => onGoToOrders?.()}>
              فتح الطلبات
            </button>
          </div>
        </section>
      )}

      {showInventory && (
      <section className="owner-dashboard__low-stock-flow" id="low-stock-flow">
        <div className="owner-dashboard__low-stock-head">
          <div>
            <p className="owner-dashboard__eyebrow">Inventory Flow</p>
            <h2>مخزون يحتاج متابعة</h2>
            <p>
              راجع الخيارات التي نفدت أو بقي منها 3 وحدات مخزون أو أقل، ثم افتح المنتج
              لتحديث الكمية بسرعة.
            </p>
          </div>
          <button type="button" onClick={loadLowStock} disabled={lowStockLoading}>
            {lowStockLoading ? "جاري التحديث..." : "تحديث المخزون"}
          </button>
        </div>

        {lowStockError && <p className="owner-dashboard__error">{lowStockError}</p>}
        {!lowStockLoading && lowStockItems.length === 0 && (
          <div className="owner-dashboard__low-stock-empty">
            <strong>المخزون مطمئن الآن</strong>
            <span>لا توجد خيارات نشطة منخفضة أو منتهية.</span>
          </div>
        )}
        {lowStockItems.length > 0 && (
          <div className="owner-dashboard__low-stock-grid">
            {lowStockItems.map((item) => {
              const stock = Number(item.stock_qty || 0);
              const isOut = stock === 0;

              return (
                <article
                  key={item.id}
                  className={
                    isOut
                      ? "owner-dashboard__low-stock-card is-out"
                      : "owner-dashboard__low-stock-card"
                  }
                >
                  <div className="owner-dashboard__low-stock-product">
                    {item.product_image_url ? (
                      <img src={item.product_image_url} alt={item.product_name} />
                    ) : (
                      <span>{item.product_name?.slice(0, 1) || "م"}</span>
                    )}
                    <div>
                      <strong>{item.product_name}</strong>
                      <small>
                        {formatProductOptionSummary(item)}
                      </small>
                    </div>
                  </div>
                  <div className="owner-dashboard__stock-meter">
                    <span>{isOut ? "نفد المخزون" : `باقي ${stock}`}</span>
                    <em style={{ width: `${Math.max(8, Math.min(100, stock * 25))}%` }} />
                  </div>
                  <button type="button" onClick={() => focusLowStockItem(item)}>
                    افتح المنتج للتعديل
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}

      {showSettings && (
      <section className="owner-dashboard__grid">
        <article className="owner-dashboard__card owner-dashboard__card--full" id="store-settings">
          <h2>إعدادات المتجر</h2>
          {settingsError && <p className="owner-dashboard__error">{settingsError}</p>}
          {settings && (
            <>
              <label>
                اسم المتجر
                <input
                  value={settings.name || ""}
                  onChange={(event) =>
                    setSettings({ ...settings, name: event.target.value })
                  }
                />
              </label>
              <label>
                الهاتف
                <input
                  value={settings.phone || ""}
                  onChange={(event) =>
                    setSettings({ ...settings, phone: event.target.value })
                  }
                />
              </label>
              <label>
                رابط لوجو المتجر
                <input
                  type="url"
                  dir="ltr"
                  placeholder="https://example.com/logo.png"
                  value={settings.logo_url || ""}
                  onChange={(event) =>
                    setSettings({ ...settings, logo_url: event.target.value })
                  }
                />
              </label>
              <label>
                أو ارفع لوجو من جهازك
                <input
                  type="file"
                  accept="image/*"
                  disabled={imageUploading}
                  onChange={(event) => {
                    uploadStoreLogo(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </label>
              {settings.logo_url && (
                <div className="owner-dashboard__brand-preview">
                  <img src={settings.logo_url} alt="لوجو المتجر" />
                  <span>معاينة اللوجو</span>
                </div>
              )}
              <div className="owner-dashboard__compact-grid">
                <label>
                  لون الواجهة الأساسي
                  <input
                    type="color"
                    value={settings.theme_color || "#4f46e5"}
                    onChange={(event) =>
                      setSettings({ ...settings, theme_color: event.target.value })
                    }
                  />
                </label>
                <label>
                  لون الأزرار/الثقة
                  <input
                    type="color"
                    value={settings.accent_color || "#059669"}
                    onChange={(event) =>
                      setSettings({ ...settings, accent_color: event.target.value })
                    }
                  />
                </label>
              </div>
              <label>
                معلومات التوصيل
                <textarea
                  rows={3}
                  value={settings.delivery_info || ""}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      delivery_info: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                سياسة المتجر المختصرة
                <textarea
                  rows={4}
                  value={settings.policy_text || ""}
                  placeholder="مثال: الاستبدال خلال 7 أيام، والدفع عند الاستلام حسب المنطقة..."
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      policy_text: event.target.value,
                    })
                  }
                />
              </label>
              <button type="button" onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? "جاري الحفظ..." : "حفظ الإعدادات"}
              </button>
              {settingsMsg && <p className="owner-dashboard__success">{settingsMsg}</p>}
            </>
          )}
        </article>
      </section>
      )}

      {showAi && (
      <section className="owner-dashboard__grid">
        <article className="owner-dashboard__card owner-dashboard__card--full" id="ai-assistant-section">
          <h2>مساعد الذكاء الاصطناعي</h2>
          <p className="owner-dashboard__muted">
            وجّه أسلوب الرد والتوصيات التي يقدّمها المساعد لعملائك في المتجر والشات.
          </p>
          {billingStatus?.billing_enforced ? (
            <p className="owner-dashboard__muted owner-dashboard__muted--tight">
              يختار الخادم نموذج الذكاء الاقتصادي أو الأقوى تلقائيًا حسب حالة اشتراك متجرك (نشط/تجربة).
            </p>
          ) : null}
          {settingsError && <p className="owner-dashboard__error">{settingsError}</p>}
          {settings && (
            <>
              <label>
                تعليمات مساعد AI
                <div className="owner-dashboard__ai-presets" aria-label="اقتراحات أسلوب سريعة">
                  {AI_STYLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className="dm-btn dm-btn--ghost dm-btn--sm"
                      onClick={() => {
                        const cur = String(settings.ai_prompt || "").trim();
                        const next = cur
                          ? `${cur}\n\n${preset.text}`
                          : preset.text;
                        setSettings({ ...settings, ai_prompt: next });
                      }}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <textarea
                  rows={8}
                  value={settings.ai_prompt || ""}
                  placeholder="مثال: كن ودودًا، اقترح المنتج الأرخص أولًا، واذكر سياسة التوصيل..."
                  onChange={(event) =>
                    setSettings({ ...settings, ai_prompt: event.target.value })
                  }
                />
              </label>
              <button type="button" onClick={saveSettings} disabled={settingsSaving}>
                {settingsSaving ? "جاري الحفظ..." : "حفظ تعليمات AI"}
              </button>
              {settingsMsg && <p className="owner-dashboard__success">{settingsMsg}</p>}
            </>
          )}
        </article>
      </section>
      )}

      {showProducts && (
      <>
      <section className="owner-dashboard__grid">
        <article className="owner-dashboard__card" id="add-product">
          <h2>إضافة منتج</h2>
          <p className="owner-dashboard__muted owner-dashboard__muted--tight">
            أنشئ المنتج بالاسم والسعر الأساسي. الخيارات (أكثر من مواصفة أو مخزون منفصل){" "}
            <strong>اختيارية</strong> — تضيفها لاحقًا من «تعديل» دون أن يمنعك النظام.
          </p>
          <label>
            الاسم
            <input
              value={productDraft.name}
              onChange={(event) =>
                setProductDraft({ ...productDraft, name: event.target.value })
              }
            />
          </label>
          <label>
            الوصف
            <textarea
              rows={3}
              value={productDraft.description}
              onChange={(event) =>
                setProductDraft({
                  ...productDraft,
                  description: event.target.value,
                })
              }
            />
          </label>
          <label>
            رابط صورة المنتج
            <input
              type="url"
              dir="ltr"
              placeholder="https://example.com/product.jpg"
              value={productDraft.image_url}
              onChange={(event) =>
                setProductDraft({
                  ...productDraft,
                  image_url: event.target.value,
                })
              }
            />
          </label>
          <label>
            أو ارفع صورة من جهازك
            <input
              type="file"
              accept="image/*"
              disabled={imageUploading}
              onChange={(event) => {
                uploadProductImage(event.target.files?.[0], "create");
                event.target.value = "";
              }}
            />
          </label>
          {productDraft.image_url && (
            <img
              className="owner-dashboard__image-preview"
              src={productDraft.image_url}
              alt="معاينة المنتج"
            />
          )}
          <label>
            السعر الأساسي
            <input
              type="number"
              min="0"
              value={productDraft.base_price}
              onChange={(event) =>
                setProductDraft({
                  ...productDraft,
                  base_price: event.target.value,
                })
              }
            />
          </label>
          <button
            type="button"
            onClick={createProduct}
            disabled={productSaving || !productDraft.name || !productDraft.base_price}
          >
            {productSaving ? "جاري الحفظ..." : "إنشاء المنتج"}
          </button>
        </article>
      </section>

      <section className="owner-dashboard__card" id="products-list">
        <div className="owner-dashboard__section-head">
          <div>
            <h2>المنتجات</h2>
            <p>اضغط تعديل لإدارة التفاصيل، أو أخف المنتج بسرعة من بطاقة المنتج.</p>
          </div>
          <button type="button" onClick={loadProducts}>
            تحديث القائمة
          </button>
        </div>
        {productsLoading && <p className="owner-dashboard__muted">جاري التحميل...</p>}
        {productsError && <p className="owner-dashboard__error">{productsError}</p>}
        {!productsLoading && products.length === 0 && (
          <p className="owner-dashboard__muted">لا توجد منتجات لهذا المتجر.</p>
        )}
        {products.length > 0 && (
          <div className="owner-dashboard__product-grid">
            {products.map((product) => (
              <article
                key={product.id}
                className={
                  selectedProductId === product.id
                    ? "owner-dashboard__product-card is-selected"
                    : "owner-dashboard__product-card"
                }
              >
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} />
                ) : (
                  <div className="owner-dashboard__product-placeholder">
                    بلا صورة
                  </div>
                )}
                <div className="owner-dashboard__product-body">
                  <div className="owner-dashboard__product-title-row">
                    <h3>{product.name}</h3>
                    <span
                      className={
                        product.is_active
                          ? "owner-dashboard__pill is-active"
                          : "owner-dashboard__pill is-muted"
                      }
                    >
                      {product.is_active ? "نشط" : "مخفي"}
                    </span>
                  </div>
                  <p>{product.description || "لا يوجد وصف بعد."}</p>
                  <div className="owner-dashboard__product-meta">
                    <strong>{product.base_price}</strong>
                    {!product.image_url && <span>أضف صورة لزيادة الثقة</span>}
                  </div>
                  <div className="owner-dashboard__product-actions">
                    <button
                      type="button"
                      onClick={() => setSelectedProductId(product.id)}
                    >
                      {selectedProductId === product.id ? "يتم تعديله الآن" : "تعديل"}
                    </button>
                    <button
                      type="button"
                      className="is-secondary"
                      onClick={() => updateProductVisibility(product, !product.is_active)}
                      disabled={productSaving}
                    >
                      {product.is_active ? "إخفاء" : "إظهار"}
                    </button>
                    <button
                      type="button"
                      className="is-danger"
                      onClick={() => archiveProduct(product)}
                      disabled={productSaving || !product.is_active}
                    >
                      أرشفة
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {productEdit && (
        <section className="owner-dashboard__grid" id="product-options">
          <article className="owner-dashboard__card">
            <h2>تعديل المنتج</h2>
            <p className="owner-dashboard__muted">
              هنا تعدل معلومات المنتج التي يراها العميل في المتجر. خيارات المواصفات والمخزون في البطاقة
              التالية <strong>اختيارية</strong>.
            </p>
            <label>
              الاسم
              <input
                value={productEdit.name}
                onChange={(event) =>
                  setProductEdit({ ...productEdit, name: event.target.value })
                }
              />
            </label>
            <label>
              الوصف
              <textarea
                rows={3}
                value={productEdit.description}
                onChange={(event) =>
                  setProductEdit({
                    ...productEdit,
                    description: event.target.value,
                  })
                }
              />
            </label>
            <label>
              رابط صورة المنتج
              <input
                type="url"
                dir="ltr"
                placeholder="https://example.com/product.jpg"
                value={productEdit.image_url}
                onChange={(event) =>
                  setProductEdit({
                    ...productEdit,
                    image_url: event.target.value,
                  })
                }
              />
            </label>
            <label>
              أو ارفع صورة من جهازك
              <input
                type="file"
                accept="image/*"
                disabled={imageUploading}
                onChange={(event) => {
                  uploadProductImage(event.target.files?.[0], "edit");
                  event.target.value = "";
                }}
              />
            </label>
            {productEdit.image_url && (
              <img
                className="owner-dashboard__image-preview"
                src={productEdit.image_url}
                alt="معاينة المنتج"
              />
            )}
            <label>
              السعر الأساسي
              <input
                type="number"
                min="0"
                value={productEdit.base_price}
                onChange={(event) =>
                  setProductEdit({
                    ...productEdit,
                    base_price: event.target.value,
                  })
                }
              />
            </label>
            <label className="owner-dashboard__check">
              <input
                type="checkbox"
                checked={productEdit.is_active}
                onChange={(event) =>
                  setProductEdit({
                    ...productEdit,
                    is_active: event.target.checked,
                  })
                }
              />
              المنتج نشط في واجهة العميل
            </label>
            <button type="button" onClick={saveSelectedProduct} disabled={productSaving}>
              حفظ المنتج
            </button>
          </article>

          <article className="owner-dashboard__card owner-dashboard__card--optional-options">
            <h2>خيارات المنتج (اختياري)</h2>
            <p className="owner-dashboard__muted">
              استخدم هذا القسم فقط إذا كان منتجك يتضمن أكثر من شكل: سعة، لون، نكهة، تخزين، إصدار،
              وزن، مادة، عبوة… يمكن ترك المواصفة 1 و 2 فارغين إذا كان الخيار يُعرّف بالمخزون أو الـ SKU
              فقط.
            </p>
            <p className="owner-dashboard__muted owner-dashboard__muted--tight">
              إن لم تضف أي خيار، يبقى المنتج <strong>بسيطًا</strong>: يظهر للعميل بالسعر الأساسي دون خطوة
              اختيار في المتجر.
            </p>

            <h3 className="owner-dashboard__options-subtitle">إضافة خيار جديد</h3>
            <div className="owner-dashboard__compact-grid">
              <label>
                مواصفة 1 (اختياري — مثل السعة، الحجم، النكهة…)
                <input
                  value={variantDraft.size}
                  onChange={(event) =>
                    setVariantDraft({ ...variantDraft, size: event.target.value })
                  }
                />
              </label>
              <label>
                مواصفة 2 (اختياري — مثل اللون، الإصدار، العبوة…)
                <input
                  value={variantDraft.color}
                  onChange={(event) =>
                    setVariantDraft({ ...variantDraft, color: event.target.value })
                  }
                />
              </label>
              <label>
                سعر الخيار (اختياري — يُستخدم بدل السعر الأساسي عند التعبئة)
                <input
                  type="number"
                  min="0"
                  value={variantDraft.price}
                  onChange={(event) =>
                    setVariantDraft({ ...variantDraft, price: event.target.value })
                  }
                />
              </label>
              <label>
                المخزون <span className="owner-dashboard__req">*</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={variantDraft.stock_qty}
                  onChange={(event) =>
                    setVariantDraft({
                      ...variantDraft,
                      stock_qty: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                SKU (اختياري)
                <input
                  value={variantDraft.sku}
                  onChange={(event) =>
                    setVariantDraft({ ...variantDraft, sku: event.target.value })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              onClick={createVariant}
              disabled={variantSaving || !newVariantStockValid}
            >
              {variantSaving ? "جاري الحفظ..." : "إضافة خيار"}
            </button>

            <h3 className="owner-dashboard__options-subtitle">الخيارات الحالية</h3>
            {variantsLoading && <p className="owner-dashboard__muted">جاري التحميل...</p>}
            {!variantsLoading && variants.length === 0 && (
              <p className="owner-dashboard__muted">
                لا توجد خيارات بعد — المنتج يُعرض كمنتج بسيط بالسعر الأساسي. أضف خيارًا عند الحاجة
                لتعدد المواصفات أو لتتبّع مخزون أدق.
              </p>
            )}
            {variants.length > 0 && (
              <div className="owner-dashboard__variant-grid">
                {variants.map((variant, index) => {
                  const stock = Number(variant.stock_qty);
                  const isLowStock = stock > 0 && stock <= 3;
                  const isOutOfStock = stock === 0;
                  const isHidden = variant.is_active === 0;

                  return (
                    <article
                      key={variant.id}
                      className={
                        isHidden
                          ? "owner-dashboard__variant-card is-hidden"
                          : isOutOfStock
                            ? "owner-dashboard__variant-card is-out"
                            : isLowStock
                              ? "owner-dashboard__variant-card is-low"
                              : "owner-dashboard__variant-card"
                      }
                    >
                      <div className="owner-dashboard__variant-head">
                        <div>
                          <span>الخيار #{variant.id}</span>
                          <strong>{formatProductOptionSummary(variant)}</strong>
                        </div>
                        <em>
                          {isHidden
                            ? "مخفي"
                            : isOutOfStock
                              ? "نفد"
                              : isLowStock
                                ? "منخفض"
                                : "متوفر"}
                        </em>
                      </div>

                      <div className="owner-dashboard__variant-fields">
                        <label>
                          مواصفة 1
                          <input
                            value={variant.size || ""}
                            onChange={(event) =>
                              updateVariantDraft(index, "size", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          مواصفة 2
                          <input
                            value={variant.color || ""}
                            onChange={(event) =>
                              updateVariantDraft(index, "color", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          السعر
                          <input
                            type="number"
                            min="0"
                            value={variant.price ?? ""}
                            onChange={(event) =>
                              updateVariantDraft(index, "price", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          المخزون
                          <input
                            type="number"
                            min="0"
                            value={variant.stock_qty}
                            onChange={(event) =>
                              updateVariantDraft(index, "stock_qty", event.target.value)
                            }
                          />
                        </label>
                        <label>
                          SKU
                          <input
                            value={variant.sku || ""}
                            onChange={(event) =>
                              updateVariantDraft(index, "sku", event.target.value)
                            }
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => saveVariant(variant)}
                        disabled={variantSaving}
                      >
                        حفظ الخيار
                      </button>
                      <div className="owner-dashboard__variant-actions">
                        <button
                          type="button"
                          className="is-secondary"
                          onClick={() => updateVariantVisibility(variant, !variant.is_active)}
                          disabled={variantSaving}
                        >
                          {isHidden ? "إظهار الخيار" : "إخفاء الخيار"}
                        </button>
                        <button
                          type="button"
                          className="is-danger"
                          onClick={() => archiveVariant(variant)}
                          disabled={variantSaving || isHidden}
                        >
                          أرشفة
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>
        </section>
      )}

      </>
      )}

      {dashboardMsg && <p className="owner-dashboard__notice">{dashboardMsg}</p>}
    </div>
  );
}
