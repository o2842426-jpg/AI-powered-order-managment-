import { useCallback, useEffect, useRef, useState } from "react";
import { apiUrl, mediaUrl } from "../lib/api";
import { throwIfNotOk, userErrorMessage } from "../lib/apiErrors";
import { formatStoreMoney, normalizeStoreCurrencyCode } from "../lib/storeCurrency";
import { getEffectivePublicStoreSlug } from "../lib/publicStoreSlug";
import {
  clearPublicChatSessionId,
  readPublicChatSessionId,
  writePublicChatSessionId,
} from "../lib/publicChatSessionStorage";
import { formatProductOptionSummary } from "../lib/productOptions";
import "./StorefrontPage.css";

const QUICK_CHAT_QUESTIONS = [
  "هل المنتج متوفر؟",
  "ما الخيارات المتاحة؟",
  "هل يوجد توصيل؟",
  "اعرض لي الأكثر مبيعًا",
  "ماذا تنصح؟",
  "ما السعر؟",
];

function StorefrontSearchField({ searchTerm, onSearchChange, variant = "nav", inputId }) {
  const dock = variant === "dock";
  return (
    <label
      className={
        dock
          ? "storefront__search storefront__search--nav storefront__search--dock"
          : "storefront__search storefront__search--nav"
      }
      htmlFor={inputId}
    >
      <span className="storefront__search-icon" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <input
        id={inputId}
        type="search"
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="ابحث في المنتجات..."
        autoComplete="off"
        enterKeyHint="search"
      />
    </label>
  );
}

export function StorefrontPage({ publicSlugVersion = "guest" }) {
  const productsSectionRef = useRef(null);
  const productDetailSectionRef = useRef(null);
  const checkoutSectionRef = useRef(null);
  const chatMessagesRef = useRef(null);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cartError, setCartError] = useState("")
  const [cartInfo, setCartInfo] = useState("")

  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productDetail, setProductDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  /** سلة بسيطة: كل سطر فيه ما يحتاجه الـAPI + عرض */
  const [cart, setCart] = useState([]);
  const [addQty, setAddQty] = useState(1);
  const [pickVariantId, setPickVariantId] = useState(null);

  const [showCheckout, setShowCheckout] = useState(false);
  const [custName, setCustName] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState("")
  const [orderSending, setOrderSending] = useState(false);
  const [orderMsg, setOrderMsg] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [productFilter, setProductFilter] = useState("all");

  /** وضع الصفحة: مساعد بملء الشاشة أو المنتجات */
  const [pageMode, setPageMode] = useState("assistant");

  const [chatSessionId, setChatSessionId] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  /** أثناء تفعيل «تولّي المالك» لا يُرسل ردّ آلي — نُظهر تنبيهًا للعميل. */
  const [chatHumanTakeover, setChatHumanTakeover] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState([]);

  const tryRestorePublicChat = useCallback(async (slug, isStale) => {
    const stored = readPublicChatSessionId(slug);
    if (!stored) return null;
    const res = await fetch(
      apiUrl(
        `/api/public/${encodeURIComponent(slug)}/chat/sessions/${encodeURIComponent(stored)}/messages`
      )
    );
    const body = await res.json().catch(() => ({}));
    if (isStale?.()) return null;
    if (!res.ok) {
      if (res.status === 404) {
        clearPublicChatSessionId(slug);
      }
      return null;
    }
    setChatSessionId(stored);
    setChatMessages(Array.isArray(body.data?.messages) ? body.data.messages : []);
    setChatHumanTakeover(Number(body.data?.session?.owner_takeover) === 1);
    return stored;
  }, []);

  function toggleFavorite(productId) {
    setFavoriteIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    );
  }

  useEffect(() => {
    const slug = getEffectivePublicStoreSlug();
    if (!slug) {
      setStore(null);
      setProducts([]);
      setLoading(false);
      setError(
        "لم يُعثر على معرّف المتجر. أنشئ متجرًا من «إنشاء متجر» (يُحفظ تلقائيًا في هذا المتصفح)، أو افتح الرابط مع ?store=معرّف-المتجر، أو اضبط VITE_STORE_SLUG عند بناء الموقع."
      );
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSelectedProductId(null);
    setProductDetail(null);

    const url = apiUrl(`/api/public/${encodeURIComponent(slug)}/products`);

    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throwIfNotOk(res, body, { fallback: "تعذر التحميل." });
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setStore(body.store ?? null);
        setProducts(Array.isArray(body.products) ? body.products : []);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(userErrorMessage(err, { fallback: "تعذّر تحميل المتجر." }));
          setStore(null);
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicSlugVersion]);

  useEffect(() => {
    setChatSessionId(null);
    setChatMessages([]);
    setChatError("");
    setChatHumanTakeover(false);

    const slug = getEffectivePublicStoreSlug();
    if (!slug) return;

    let stale = false;
    void (async () => {
      await tryRestorePublicChat(slug, () => stale);
    })();

    return () => {
      stale = true;
    };
  }, [publicSlugVersion, tryRestorePublicChat]);

  /** مساحة إضافية أسفل منطقة التمرير فوق الشريط الثابت وزر التبديل (جوال). */
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.scrollPaddingBottom;
    const pad =
      cart.length > 0
        ? "calc(112px + env(safe-area-inset-bottom, 0px))"
        : "calc(88px + env(safe-area-inset-bottom, 0px))";
    root.style.scrollPaddingBottom = pad;
    return () => {
      root.style.scrollPaddingBottom = prev;
    };
  }, [cart.length]);

  useEffect(() => {
    if (selectedProductId == null) {
      setProductDetail(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    const slug = getEffectivePublicStoreSlug();
    if (!slug) {
      setDetailError("إعداد المتجر ناقص.");
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    const url = apiUrl(
      `/api/public/${encodeURIComponent(slug)}/products/${selectedProductId}`
    );

    fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throwIfNotOk(res, body, { fallback: "تعذر التحميل." });
        }
        return body;
      })
      .then((body) => {
        if (cancelled) return;
        setProductDetail(body);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(userErrorMessage(err, { fallback: "تعذر تحميل تفاصيل المنتج." }));
          setProductDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProductId, publicSlugVersion]);

  /** عند فتح تفاصيل جديدة: اختر أول variant تلقائيًا إن وُجد */
  useEffect(() => {
    const v = productDetail?.product?.variants;
    if (Array.isArray(v) && v.length > 0) {
      setPickVariantId(v[0].id);
    } else {
      setPickVariantId(null);
    }
    setAddQty(1);
  }, [productDetail]);

  useEffect(() => {
    window.setTimeout(() => {
      const node = chatMessagesRef.current;
      if (!node) return;
      node.scrollTo({
        top: node.scrollHeight,
        behavior: "smooth",
      });
    }, 0);
  }, [chatMessages, chatLoading]);

  function addToCartFromDetail() {
    setCartError("");
    setCartInfo("");

    const p = productDetail?.product;
    if (!p) return false;

    const requestedQty = Math.floor(Number(addQty));
    if (Number.isNaN(requestedQty) || requestedQty < 1) {
      setCartError("الكمية غير صحيحة.");
      return false;
    }

    const variants = p.variants || [];
    let variantId = null;
    let unit = Number(p.base_price);
    let availableStock = Infinity;

    if (variants.length > 0) {
      const v = variants.find((x) => x.id === pickVariantId);
      if (!v) {
        setCartError("اختر خيارا صحيحا للمنتج.");
        return false;
      }
      variantId = v.id;
      unit = v.price != null && v.price !== "" ? Number(v.price) : unit;
      availableStock = Number(v.stock_qty || 0);
    }

    const existingLine = cart.find(
      (x) => x.product_id === p.id && x.variant_id === variantId
    );
    const existingQty = existingLine ? existingLine.qty : 0;
    const nextQty = existingQty + requestedQty;

    if (nextQty > availableStock) {
      setCartError(`المتوفر فقط ${availableStock}.`);
      return false;
    }

    setCart((prev) => {
      const i = prev.findIndex(
        (x) => x.product_id === p.id && x.variant_id === variantId
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = {
          ...next[i],
          qty: next[i].qty + requestedQty,
          maxStock: Number.isFinite(availableStock) ? availableStock : null,
        };
        return next;
      }
      return [
        ...prev,
        {
          product_id: p.id,
          variant_id: variantId,
          qty: requestedQty,
          unitPrice: unit,
          title: p.name,
          maxStock: Number.isFinite(availableStock) ? availableStock : null,
        },
      ];
    });
    setCartInfo("تمت الإضافة إلى السلة.");
    return true;
  }

  function removeLine(i) {
    setCart((prev) => prev.filter((_, j) => j !== i));
  }

  function increaseLineQty(index) {
    setCartError("");
    setCartInfo("");
    setCart((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;

      const line = next[index];
      const hasStockLimit = Number.isFinite(line.maxStock);
      if (hasStockLimit && line.qty >= line.maxStock) {
        setCartError(`المتوفر فقط ${line.maxStock} لهذا المنتج.`);
        return prev;
      }

      next[index] = {
        ...line,
        qty: line.qty + 1,
      };
      setCartInfo("تم تحديث الكمية.");
      return next;
    });
  }

  function decreaseLineQty(index) {
    setCartError("");
    setCartInfo("");
    setCart((prev) => {
      const next = [...prev];
      if (!next[index]) return prev;

      if (next[index].qty <= 1) {
        next.splice(index, 1);
        return next;
      }

      next[index] = {
        ...next[index],
        qty: next[index].qty - 1,
      };
      setCartInfo("تم تحديث الكمية.");
      return next;
    });
  }


  const cartCount = cart.reduce((s, x) => s + x.qty, 0);
  const cartTotal = cart.reduce((s, x) => s + x.unitPrice * x.qty, 0);
  const storeCurrency = normalizeStoreCurrencyCode(
    productDetail?.store?.currency_code ?? store?.currency_code
  );

  function productThumbUrl(productId) {
    const p = products.find((x) => x.id === productId);
    const raw = p?.image_url ?? null;
    return raw ? mediaUrl(raw) : null;
  }

  const filteredProducts = products.filter((product, index) => {
    const search = searchTerm.trim().toLowerCase();
    const text = `${product.name} ${product.description ?? ""}`.toLowerCase();
    const matchesSearch = !search || text.includes(search);
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const hasStock = variants.length
      ? variants.some((variant) => Number(variant.stock_qty) > 0)
      : true;
    const matchesFilter =
      productFilter === "all" ||
      (productFilter === "available" && hasStock) ||
      (productFilter === "bestseller" && index === 0);

    return matchesSearch && matchesFilter;
  });

  const featuredProduct =
    !searchTerm.trim() && productFilter === "all" && products.length > 0
      ? products[0]
      : null;
  const gridProducts = featuredProduct
    ? filteredProducts.filter((p) => p.id !== featuredProduct.id)
    : filteredProducts;

  function productHasStock(p) {
    const variants = Array.isArray(p.variants) ? p.variants : [];
    if (variants.length === 0) return true;
    return variants.some((v) => Number(v.stock_qty) > 0);
  }

  async function sendOrder() {
    const slug = getEffectivePublicStoreSlug();

    setCheckoutError("");

    if (!slug) {
      setCheckoutError("إعداد المتجر ناقص.");
      return;
    }

    if (cart.length === 0) {
      setCheckoutError("السلة فارغة.");
      return;
    }

    if (!custName.trim()) {
      setCheckoutError("الاسم مطلوب.");
      return;
    }

    if (!custPhone.trim()) {
      setCheckoutError("الهاتف مطلوب.");
      return;
    }

    if (!custAddress.trim()) {
      setCheckoutError("العنوان مطلوب.");
      return;
    }

    setOrderSending(true);
    setOrderMsg("");
    setCreatedOrder(null);


    const items = cart.map((c) => ({
      product_id: c.product_id,
      variant_id: c.variant_id,
      qty: c.qty,
    }));

    try {
      const res = await fetch(
        apiUrl(`/api/public/${encodeURIComponent(slug)}/orders`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customer: {
              name: custName.trim(),
              phone: custPhone.trim(),
              address_text: custAddress.trim() || null,
              notes: custNotes.trim() || null,
            },
            items,
            customer_note: null,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: "فشل." });
      }
      setOrderMsg(`تم إنشاء الطلب رقم ${body.data?.order_id ?? ""}. شكرًا!`);
      setCart([]);
      setShowCheckout(false);
      setCustName("");
      setCustPhone("");
      setCustAddress("");
      setCustNotes("");
      setCheckoutError("");
      setCreatedOrder(body.data ?? null);
    } catch (e) {
      setOrderMsg(userErrorMessage(e, { fallback: "تعذر إرسال الطلب." }));
    } finally {
      setOrderSending(false);
    }
  }

  async function ensureChatSession() {
    if (chatSessionId) return chatSessionId;

    const slug = getEffectivePublicStoreSlug();
    if (!slug) {
      setChatError("إعداد المتجر ناقص.");
      return null;
    }

    const restored = await tryRestorePublicChat(slug, () => false);
    if (restored) return restored;

    const res = await fetch(
      apiUrl(`/api/public/${encodeURIComponent(slug)}/chat/sessions`),
      { method: "POST" }
    );
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      throwIfNotOk(res, body, { fallback: "فشل إنشاء جلسة الشات." });
    }

    const newSessionId = body.data?.id;
    if (newSessionId != null) {
      writePublicChatSessionId(slug, newSessionId);
    }
    setChatSessionId(newSessionId);
    return newSessionId;
  }

  async function sendChatMessage(textOverride) {
    const text =
      typeof textOverride === "string" ? textOverride.trim() : chatText.trim();
    if (!text) return;

    setChatLoading(true);
    setChatError("");

    try {
      const sessionId = await ensureChatSession();
      if (!sessionId) return;

      const slug = getEffectivePublicStoreSlug();
      const res = await fetch(
        apiUrl(`/api/public/${encodeURIComponent(slug)}/chat/messages`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            message_text: text,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: "فشل إرسال الرسالة." });
      }

      setChatHumanTakeover(Boolean(body.data?.owner_takeover_active));
      setChatMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const incoming = (body.data?.messages || []).filter((m) => m != null && !seen.has(m.id));
        return [...prev, ...incoming];
      });
      setChatText("");
    } catch (e) {
      setChatError(userErrorMessage(e, { fallback: "تعذر إرسال الرسالة." }));
    } finally {
      setChatLoading(false);
    }
  }

  function scrollToProductsFromChat() {
    setPageMode("products");
    window.setTimeout(() => {
      productsSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function openCheckoutFromChat() {
    setShowCheckout(true);
    setPageMode("products");
    window.setTimeout(() => {
      checkoutSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  function addProductFromChat(product, shouldOpenCheckout = false) {
    setChatError("");
    setCartError("");
    setCartInfo("");

    const variants = Array.isArray(product.variants) ? product.variants : [];
    const availableVariants = variants.filter(
      (variant) => Number(variant.stock_qty || 0) > 0
    );

    if (variants.length > 1) {
      setChatError("هذا المنتج له أكثر من خيار. افتح التفاصيل لاختيار المواصفات المناسبة.");
      openProductFromChat(product.id);
      return;
    }

    if (variants.length === 1 && availableVariants.length === 0) {
      setChatError("هذا المنتج غير متوفر حاليًا.");
      return;
    }

    const selectedVariant = availableVariants[0] || null;
    const variantId = selectedVariant?.id ?? null;
    const unitPrice = Number(selectedVariant?.price ?? product.base_price);
    const maxStock = selectedVariant ? Number(selectedVariant.stock_qty || 0) : null;
    const existingLine = cart.find(
      (line) => line.product_id === product.id && line.variant_id === variantId
    );

    if (Number.isFinite(maxStock) && existingLine?.qty >= maxStock) {
      setChatError(`المتوفر فقط ${maxStock} من هذا الخيار.`);
      return;
    }

    setCart((prev) => {
      const existingIndex = prev.findIndex(
        (line) => line.product_id === product.id && line.variant_id === variantId
      );

      if (existingIndex >= 0) {
        const next = [...prev];
        const line = next[existingIndex];

        if (Number.isFinite(maxStock) && line.qty >= maxStock) {
          setChatError(`المتوفر فقط ${maxStock} من هذا الخيار.`);
          return prev;
        }

        next[existingIndex] = {
          ...line,
          qty: line.qty + 1,
        };
        return next;
      }

      return [
        ...prev,
        {
          product_id: product.id,
          variant_id: variantId,
          qty: 1,
          unitPrice,
          title: product.name,
          maxStock,
        },
      ];
    });

    setCartInfo("تمت الإضافة إلى السلة.");

    if (shouldOpenCheckout) {
      window.setTimeout(openCheckoutFromChat, 0);
    }
  }

  function getRecommendedProductsFromMessage(msg) {
    if (!msg || msg.sender_type !== "ai") return [];
    if (Array.isArray(msg.recommended_products) && msg.recommended_products.length > 0) {
      return msg.recommended_products;
    }
    if (typeof msg.payload === "string" && msg.payload.trim()) {
      try {
        const p = JSON.parse(msg.payload);
        const ids = Array.isArray(p.recommended_product_ids) ? p.recommended_product_ids : [];
        return ids
          .map((id) => products.find((pr) => Number(pr.id) === Number(id)))
          .filter(Boolean);
      } catch {
        return [];
      }
    }
    return [];
  }

  const closeProductSheet = useCallback(() => {
    setSelectedProductId(null);
    setProductDetail(null);
    setDetailError(null);
  }, []);

  function openProductFromChat(productId) {
    setSelectedProductId(productId);
    setPageMode("products");
    window.setTimeout(() => {
      productDetailSectionRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 80);
  }

  useEffect(() => {
    if (selectedProductId == null) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e) {
      if (e.key === "Escape") closeProductSheet();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedProductId, closeProductSheet]);

  const storePhone = String(store?.phone || "").trim();
  const whatsappPhone = storePhone.replace(/[^\d]/g, "");
  const whatsappMessage = encodeURIComponent(
    `مرحبًا، أريد الاستفسار عن منتجات ${store?.name || "المتجر"}`
  );
  const whatsappUrl =
    whatsappPhone.length >= 8
      ? `https://wa.me/${whatsappPhone}?text=${whatsappMessage}`
      : "";
  const storefrontStyle = {
    "--store-theme": store?.theme_color || "#6D5EF9",
    "--store-accent": store?.accent_color || "#22C55E",
    "--dm-color-primary-hover": "#5B4CF0",
  };

  function scrollToCartSection() {
    if (cart.length === 0) {
      setPageMode("products");
      window.setTimeout(() => {
        productsSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 0);
      return;
    }
    document.getElementById("storefront-cart-lines")?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  const assistantPanelInner = (
    <div className="storefront__assistant-panel-inner storefront__assistant-panel-inner--fullpage">
      <header className="storefront__ai-head">
        <div>
          <h2 className="storefront__ai-title">مساعد التسوق الذكي</h2>
          <p className="storefront__ai-sub">
            اسأل عن المنتجات، الأسعار، الخيارات، والتوصيل — نجيبك بأسرع وقت.
          </p>
        </div>
        <div className="storefront__ai-online" aria-hidden>
          <span className="storefront__ai-online-dot" />
          متصل الآن
        </div>
      </header>

      {chatHumanTakeover ? (
        <p className="storefront__chat-takeover-notice" role="status">
          فريق المتجر يردّ عليك مباشرة الآن — قد يتأخر الردّ قليلًا دون مساعد آلي.
        </p>
      ) : null}

      <div
        className="storefront__quick-questions storefront__quick-questions--chips"
        aria-label="أسئلة سريعة"
      >
        {QUICK_CHAT_QUESTIONS.map((question) => (
          <button
            key={question}
            type="button"
            onClick={() => sendChatMessage(question)}
            disabled={chatLoading}
          >
            {question}
          </button>
        ))}
      </div>

      <div className="storefront__chat-messages" ref={chatMessagesRef}>
        {chatMessages.length === 0 && (
          <div className="storefront__chat-welcome">
            <strong>ابدأ المحادثة</strong>
            <p>اختر سؤالًا سريعًا أعلاه أو اكتب ما تبحث عنه في الحقل بالأسفل.</p>
          </div>
        )}
        {chatMessages.map((msg) => {
          const mentionedProducts =
            msg.sender_type === "ai" ? getRecommendedProductsFromMessage(msg) : [];
          const isCustomer = msg.sender_type === "customer";
          const isOwner = msg.sender_type === "owner";
          const bubbleClass = isCustomer
            ? "is-customer"
            : isOwner
              ? "is-owner"
              : "is-ai";
          const senderLabel = isCustomer ? "أنت" : isOwner ? "فريق المتجر" : "مساعد المتجر";

          return (
            <div
              key={msg.id}
              className={`storefront__chat-message ${bubbleClass}`}
            >
              <strong>{senderLabel}</strong>
              <p>{msg.message_text}</p>
              {mentionedProducts.length > 0 && (
                <div className="storefront__chat-products">
                  {mentionedProducts.map((product) => {
                    const variants = Array.isArray(product.variants)
                      ? product.variants
                      : [];
                    const hasMultipleOptions = variants.length > 1;
                    const priceLabel = Number.isFinite(Number(product.base_price))
                      ? formatStoreMoney(product.base_price, storeCurrency)
                      : String(product.base_price ?? "—");

                    return (
                      <article
                        key={product.id}
                        className="storefront__chat-product-card"
                      >
                        <strong>{product.name}</strong>
                        {product.description ? (
                          <p>{product.description}</p>
                        ) : null}
                        <p>
                          {priceLabel}
                          {" · "}
                          {productHasStock(product) ? "متوفر" : "غير متوفر"}
                        </p>
                        <div className="storefront__chat-product-actions">
                          <button
                            type="button"
                            onClick={() => openProductFromChat(product.id)}
                          >
                            عرض التفاصيل
                          </button>
                          <button
                            type="button"
                            onClick={() => addProductFromChat(product)}
                          >
                            {hasMultipleOptions ? "اختيار الخيار" : "أضف للسلة"}
                          </button>
                          {!hasMultipleOptions && (
                            <button
                              type="button"
                              className="is-primary"
                              onClick={() => addProductFromChat(product, true)}
                            >
                              اشترِ الآن
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {chatLoading && !chatHumanTakeover && (
          <div className="storefront__chat-message is-ai storefront__typing">
            <strong>مساعد المتجر</strong>
            <p>
              <span />
              <span />
              <span />
            </p>
          </div>
        )}
      </div>

      {chatError && <p className="storefront__cart-error">{chatError}</p>}

      <form
        className="storefront__chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          sendChatMessage();
        }}
      >
        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          placeholder="اكتب رسالتك..."
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendChatMessage();
            }
          }}
        />
        <button type="submit" disabled={chatLoading || !chatText.trim()}>
          {chatLoading ? "…" : "إرسال"}
        </button>
      </form>

      <div className="storefront__chat-cta">
        {cart.length === 0 ? (
          <button type="button" onClick={scrollToProductsFromChat}>
            تصفح المنتجات
          </button>
        ) : (
          <button type="button" onClick={openCheckoutFromChat}>
            إتمام الطلب ({cartCount})
          </button>
        )}
      </div>
    </div>
  );

  function renderProductDetailOverlay() {
    if (selectedProductId == null) return null;

    const isBestseller = Boolean(
      featuredProduct && featuredProduct.id === selectedProductId
    );
    const contactHref = whatsappUrl || (storePhone ? `tel:${storePhone}` : "");

    return (
      <div className="storefront__pdp-root">
        <button
          type="button"
          className="storefront__pdp-backdrop"
          aria-label="إغلاق"
          onClick={closeProductSheet}
        />
        <div
          className="storefront__pdp-sheet"
          ref={productDetailSectionRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="storefront-pdp-title"
        >
          <div className="storefront__pdp-handle" aria-hidden />
          <header className="storefront__pdp-toolbar">
            <h2 id="storefront-pdp-title" className="storefront__pdp-toolbar-title">
              تفاصيل المنتج
            </h2>
            <button
              type="button"
              className="storefront__pdp-icon-close"
              onClick={closeProductSheet}
              aria-label="إغلاق"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M18 6L6 18M6 6l12 12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </header>

          <div className="storefront__pdp-scroll">
            {detailLoading && (
              <p className="storefront__pdp-status">جاري تحميل التفاصيل…</p>
            )}
            {detailError && (
              <div className="storefront__pdp-error" role="alert">
                {detailError}
              </div>
            )}
            {!detailLoading && !detailError && productDetail?.product && (() => {
              const product = productDetail.product;
              const variants = Array.isArray(product.variants) ? product.variants : [];
              const selectedVariant = variants.find((v) => v.id === pickVariantId);
              const activePrice = selectedVariant?.price ?? product.base_price;
              const activeStock = selectedVariant
                ? Number(selectedVariant.stock_qty || 0)
                : null;
              const hasVariants = variants.length > 0;

              return (
                <>
                  <div className="storefront__pdp-hero">
                    <div className="storefront__pdp-hero-visual">
                      <button
                        type="button"
                        className={
                          favoriteIds.includes(product.id)
                            ? "storefront__fav is-on"
                            : "storefront__fav"
                        }
                        onClick={() => toggleFavorite(product.id)}
                        aria-label={
                          favoriteIds.includes(product.id)
                            ? "إزالة من المفضلة"
                            : "إضافة للمفضلة"
                        }
                        aria-pressed={favoriteIds.includes(product.id)}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                          <path
                            fill="currentColor"
                            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                          />
                        </svg>
                      </button>
                      <span
                        className={
                          productHasStock(product)
                            ? "storefront__stock-pill is-in"
                            : "storefront__stock-pill is-out"
                        }
                      >
                        {productHasStock(product) ? "متوفر" : "غير متوفر"}
                      </span>
                      {isBestseller ? (
                        <span className="storefront__badge storefront__badge--hot storefront__pdp-hero-badge">
                          الأكثر طلبًا
                        </span>
                      ) : null}
                      {product.image_url ? (
                        <img
                          className="storefront__pdp-hero-img"
                          src={mediaUrl(product.image_url)}
                          alt=""
                        />
                      ) : (
                        <div className="storefront__pdp-hero-placeholder">بدون صورة</div>
                      )}
                    </div>

                    <div className="storefront__pdp-intro">
                      <h3 className="storefront__pdp-name">{product.name}</h3>
                      {product.description ? (
                        <p className="storefront__pdp-desc">{product.description}</p>
                      ) : null}
                      <div className="storefront__pdp-price-block">
                        <span className="storefront__pdp-price-label">السعر</span>
                        <div className="storefront__pdp-price-row">
                          <strong className="storefront__pdp-price-value">
                            {formatStoreMoney(activePrice, storeCurrency)}
                          </strong>
                          {selectedVariant && activeStock != null ? (
                            <span className="storefront__pdp-stock-hint">
                              متبقّي تقريبًا {activeStock}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <ul className="storefront__pdp-trust" aria-label="مزايا الطلب">
                    <li>طلب آمن</li>
                    <li>توصيل سريع</li>
                    <li>تأكيد قبل التجهيز</li>
                  </ul>

                  {hasVariants ? (
                    <div className="storefront__pdp-section">
                      <div className="storefront__pdp-section-head">
                        <span className="storefront__pdp-section-kicker">الخيارات</span>
                        <strong className="storefront__pdp-section-title">اختر الخيار المناسب</strong>
                      </div>
                      <div className="storefront__pdp-variant-grid">
                        {variants.map((variant) => {
                          const variantPrice = variant.price ?? product.base_price;
                          const variantStock = Number(variant.stock_qty || 0);
                          const selected = pickVariantId === variant.id;
                          const unavailable = variantStock <= 0;

                          return (
                            <button
                              key={variant.id}
                              type="button"
                              className={
                                selected
                                  ? "storefront__pdp-variant is-selected"
                                  : "storefront__pdp-variant"
                              }
                              disabled={unavailable}
                              onClick={() => setPickVariantId(variant.id)}
                            >
                              <span className="storefront__pdp-variant-line">
                                {formatProductOptionSummary(variant)}
                              </span>
                              <span className="storefront__pdp-variant-price">
                                {formatStoreMoney(variantPrice, storeCurrency)}
                              </span>
                              <span className="storefront__pdp-variant-stock">
                                {unavailable
                                  ? "غير متوفر"
                                  : `${variantStock} متوفر`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="storefront__pdp-section">
                    <div className="storefront__pdp-section-head">
                      <span className="storefront__pdp-section-kicker">الكمية</span>
                      <strong className="storefront__pdp-section-title">الكمية</strong>
                    </div>
                    <div className="storefront__pdp-qty">
                      <button
                        type="button"
                        className="storefront__pdp-qty-btn"
                        aria-label="نقص الكمية"
                        onClick={() => setAddQty((qty) => Math.max(1, Number(qty) - 1))}
                      >
                        −
                      </button>
                      <input
                        className="storefront__pdp-qty-input"
                        type="number"
                        min={1}
                        max={activeStock ?? undefined}
                        value={addQty}
                        onChange={(e) => setAddQty(Number(e.target.value))}
                        aria-label="الكمية"
                      />
                      <button
                        type="button"
                        className="storefront__pdp-qty-btn"
                        aria-label="زيادة الكمية"
                        disabled={activeStock != null && addQty >= activeStock}
                        onClick={() => setAddQty((qty) => Number(qty) + 1)}
                      >
                        +
                      </button>
                    </div>
                    {selectedVariant ? (
                      <p className="storefront__pdp-summary">
                        الإجمالي التقريبي:{" "}
                        <strong>
                          {formatStoreMoney(
                            Number(activePrice) * Number(addQty || 1),
                            storeCurrency
                          )}
                        </strong>
                      </p>
                    ) : null}
                  </div>

                  {cartError ? (
                    <p className="storefront__cart-error storefront__pdp-inline-msg">{cartError}</p>
                  ) : null}
                  {cartInfo ? (
                    <p className="storefront__cart-info storefront__pdp-inline-msg">{cartInfo}</p>
                  ) : null}
                </>
              );
            })()}
          </div>

          {!detailLoading && !detailError && productDetail?.product && (() => {
            const variants = Array.isArray(productDetail.product.variants)
              ? productDetail.product.variants
              : [];
            const selectedVariant = variants.find((v) => v.id === pickVariantId);
            const activeStock = selectedVariant
              ? Number(selectedVariant.stock_qty || 0)
              : null;
            const isOutOfStock = variants.length > 0 && activeStock <= 0;

            return (
              <footer className="storefront__pdp-footer">
                <button
                  type="button"
                  className="storefront__pdp-btn storefront__pdp-btn--primary"
                  disabled={isOutOfStock}
                  onClick={addToCartFromDetail}
                >
                  أضف إلى السلة
                </button>
                {contactHref ? (
                  <a
                    className="storefront__pdp-btn storefront__pdp-btn--secondary"
                    href={contactHref}
                    {...(whatsappUrl
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    مراسلة المتجر
                  </a>
                ) : null}
              </footer>
            );
          })()}
        </div>
      </div>
    );
  }

  const storefrontRootClass = [
    "storefront",
    `storefront--mode-${pageMode}`,
    cart.length > 0 ? "storefront--cart-bar-visible" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={storefrontRootClass}
      style={storefrontStyle}
      dir="rtl"
    >
      <header className="storefront__topnav">
        <div className="storefront__topnav-shell">
          <div className="storefront__topnav-brand">
            {store?.logo_url ? (
              <img
                className="storefront__topnav-logo"
                src={mediaUrl(store.logo_url)}
                alt=""
              />
            ) : (
              <div
                className="storefront__topnav-logo storefront__topnav-logo--placeholder"
                aria-hidden="true"
              >
                {(store?.name || "م").slice(0, 1)}
              </div>
            )}
            <div className="storefront__topnav-brand-text">
              <div className="storefront__topnav-title-row">
                <span className="storefront__topnav-name">
                  {store?.name ?? "المتجر"}
                </span>
                <span className="storefront__verified-badge">
                  <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
                    />
                  </svg>
                  موثّق
                </span>
              </div>
              <span className="storefront__topnav-tagline">متجر موثوق</span>
            </div>
          </div>

          <div className="storefront__topnav-search">
            <StorefrontSearchField
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              variant="nav"
              inputId="storefront-search-nav"
            />
          </div>

          <div className="storefront__topnav-actions">
            <button
              type="button"
              className="storefront__nav-ai"
              onClick={() => {
                setPageMode("assistant");
                window.setTimeout(() => {
                  document
                    .getElementById("storefront-chat-section")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 0);
              }}
            >
              <span className="storefront__nav-ai-icon" aria-hidden>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2l1.2 3.6L17 7l-3.8 1.4L12 12l-1.2-3.6L7 7l3.8-1.4L12 2z" />
                </svg>
              </span>
              مساعد
            </button>
            <button
              type="button"
              className="storefront__nav-cart"
              onClick={scrollToCartSection}
              aria-label={`السلة، ${cartCount} عنصر`}
            >
              <span className="storefront__nav-cart-icon" aria-hidden>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45C5.08 14.48 5.5 15 6.16 15H19v-2H6.42c-.14 0-.25-.11-.25-.25 0-.05.01-.09.03-.12L7.1 11h9.45c.75 0 1.41-.41 1.75-1.03L21.7 4H5.21l-.94-2H1zm16 16c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              {cartCount > 0 ? (
                <span className="storefront__nav-cart-badge">{cartCount}</span>
              ) : null}
            </button>
            {whatsappUrl ? (
              <a
                className="storefront__nav-wa storefront__nav-wa--icon"
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="تواصل واتساب"
              >
                <span aria-hidden>💬</span>
              </a>
            ) : (
              storePhone && (
                <a
                  className="storefront__nav-wa storefront__nav-wa--icon"
                  href={`tel:${storePhone}`}
                  aria-label="اتصال"
                >
                  <span aria-hidden>📞</span>
                </a>
              )
            )}
          </div>
        </div>
      </header>

      <div
        className="storefront__search-dock-mobile"
        data-open="false"
        aria-hidden="true"
      >
        <StorefrontSearchField
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          variant="dock"
          inputId="storefront-search-dock"
        />
      </div>

      {loading && <p className="storefront__status">جاري التحميل…</p>}
      {error && (
        <div className="storefront__error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && store?.policy_text && (
        <section className="storefront__policy-panel card">
          <strong>سياسة المتجر</strong>
          <p>{store.policy_text}</p>
        </section>
      )}

      {!loading && !error && store && (
        <>
          {pageMode === "assistant" && (
            <section
              id="storefront-chat-section"
              className="storefront__full-assistant"
              aria-label="مساعد التسوق الذكي"
            >
              <div
                className="storefront__assistant-panel storefront__assistant-panel--fullpage"
                id="storefront-assistant-panel"
                role="region"
                aria-label="مساعد التسوق الذكي"
              >
                {assistantPanelInner}
              </div>
            </section>
          )}
          {pageMode === "products" && (
            <div className="storefront__shop-layout">
              <div className="storefront__shop-main" id="storefront-products">
                <h2 className="storefront__products-landmark">المنتجات</h2>
                <nav className="storefront__filter-bar" aria-label="تصفية المنتجات">
                  <button
                    type="button"
                    className={productFilter === "all" ? "is-active" : ""}
                    onClick={() => setProductFilter("all")}
                  >
                    الكل
                  </button>
                  <button
                    type="button"
                    className={productFilter === "bestseller" ? "is-active" : ""}
                    onClick={() => setProductFilter("bestseller")}
                  >
                    الأكثر طلبًا
                  </button>
                  <button
                    type="button"
                    className={productFilter === "available" ? "is-active" : ""}
                    onClick={() => setProductFilter("available")}
                  >
                    المتوفر
                  </button>
                </nav>

                {products.length === 0 && (
                  <p className="storefront__empty">لا توجد منتجات.</p>
                )}
                {products.length > 0 && filteredProducts.length === 0 && (
                  <p className="storefront__empty">لا توجد نتائج مطابقة.</p>
                )}

                {(featuredProduct || gridProducts.length > 0) && (
                  <>
                    {featuredProduct && (
                      <section
                        className="storefront__featured"
                        aria-labelledby="storefront-featured-title"
                      >
                        <h2 id="storefront-featured-title" className="storefront__section-title">
                          الأكثر طلبًا
                        </h2>
                        <article className="storefront__card storefront__card--featured storefront__card--bestseller">
                          <div className="storefront__card-inner">
                            <div className="storefront__card-visual">
                              <button
                                type="button"
                                className={
                                  favoriteIds.includes(featuredProduct.id)
                                    ? "storefront__fav is-on"
                                    : "storefront__fav"
                                }
                                onClick={() => toggleFavorite(featuredProduct.id)}
                                aria-label={
                                  favoriteIds.includes(featuredProduct.id)
                                    ? "إزالة من المفضلة"
                                    : "إضافة للمفضلة"
                                }
                                aria-pressed={favoriteIds.includes(featuredProduct.id)}
                              >
                                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    fill="currentColor"
                                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                                  />
                                </svg>
                              </button>
                              <span
                                className={
                                  productHasStock(featuredProduct)
                                    ? "storefront__stock-pill is-in"
                                    : "storefront__stock-pill is-out"
                                }
                              >
                                {productHasStock(featuredProduct) ? "متوفر" : "غير متوفر"}
                              </span>
                              {featuredProduct.image_url ? (
                                <img
                                  className="storefront__product-image"
                                  src={mediaUrl(featuredProduct.image_url)}
                                  alt={featuredProduct.name}
                                />
                              ) : (
                                <div className="storefront__product-image-placeholder">
                                  بدون صورة
                                </div>
                              )}
                            </div>
                            <div className="storefront__card-body">
                              <div className="storefront__card-head">
                                <span className="storefront__badge storefront__badge--hot">
                                  الأكثر طلبًا
                                </span>
                                <h3>{featuredProduct.name}</h3>
                              </div>
                              {featuredProduct.description && (
                                <p className="storefront__desc">{featuredProduct.description}</p>
                              )}
                              <p className="storefront__price">
                                من {formatStoreMoney(featuredProduct.base_price, storeCurrency)}
                              </p>
                              {Array.isArray(featuredProduct.variants) &&
                                featuredProduct.variants.length > 0 && (
                                  <ul className="storefront__variants-preview">
                                    {featuredProduct.variants.slice(0, 3).map((v) => (
                                      <li key={v.id}>
                                        {formatProductOptionSummary(v)}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              <button
                                className={`storefront__cta${selectedProductId === featuredProduct.id ? " is-active" : ""}`}
                                type="button"
                                onClick={() =>
                                  selectedProductId === featuredProduct.id
                                    ? closeProductSheet()
                                    : setSelectedProductId(featuredProduct.id)
                                }
                              >
                                عرض التفاصيل
                              </button>
                            </div>
                          </div>
                        </article>
                      </section>
                    )}

                    <ul className="storefront__grid" ref={productsSectionRef}>
                      {gridProducts.map((p, index) => {
                        const isGridBestseller =
                          productFilter === "bestseller" && index === 0;
                        return (
                        <li key={p.id} className="storefront__grid-item">
                          <article
                            className={[
                              "storefront__card",
                              "storefront__card--compact",
                              isGridBestseller ? "storefront__card--bestseller" : "",
                              selectedProductId === p.id ? "is-selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                          >
                          <div className="storefront__card-inner">
                            <div className="storefront__card-visual">
                              <button
                                type="button"
                                className={
                                  favoriteIds.includes(p.id) ? "storefront__fav is-on" : "storefront__fav"
                                }
                                onClick={() => toggleFavorite(p.id)}
                                aria-label={
                                  favoriteIds.includes(p.id) ? "إزالة من المفضلة" : "إضافة للمفضلة"
                                }
                                aria-pressed={favoriteIds.includes(p.id)}
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    fill="currentColor"
                                    d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                                  />
                                </svg>
                              </button>
                              <span
                                className={
                                  productHasStock(p) ? "storefront__stock-pill is-in" : "storefront__stock-pill is-out"
                                }
                              >
                                {productHasStock(p) ? "متوفر" : "غير متوفر"}
                              </span>
                              {p.image_url ? (
                                <img className="storefront__product-image" src={mediaUrl(p.image_url)} alt={p.name} />
                              ) : (
                                <div className="storefront__product-image-placeholder">بدون صورة</div>
                              )}
                            </div>
                            <div className="storefront__card-body">
                              <div className="storefront__card-head">
                                <div className="storefront__card-badges">
                                  {productFilter === "all" && index === 1 && (
                                    <span className="storefront__badge storefront__badge--new">جديد</span>
                                  )}
                                  {isGridBestseller && (
                                    <span className="storefront__badge storefront__badge--hot">
                                      الأكثر طلبًا
                                    </span>
                                  )}
                                </div>
                                <h3>{p.name}</h3>
                              </div>
                              {p.description && <p className="storefront__desc">{p.description}</p>}
                              <p className="storefront__price">
                                من {formatStoreMoney(p.base_price, storeCurrency)}
                              </p>
                              {Array.isArray(p.variants) && p.variants.length > 0 && (
                                <ul className="storefront__variants-preview">
                                  {p.variants.slice(0, 3).map((v) => (
                                    <li key={v.id}>
                                      {formatProductOptionSummary(v)}
                                    </li>
                                  ))}
                                  {p.variants.length > 3 && <li>+{p.variants.length - 3} خيارات</li>}
                                </ul>
                              )}
                              <button
                                className={`storefront__cta${selectedProductId === p.id ? " is-active" : ""}`}
                                type="button"
                                onClick={() =>
                                  selectedProductId === p.id
                                    ? closeProductSheet()
                                    : setSelectedProductId(p.id)
                                }
                              >
                                عرض التفاصيل
                              </button>
                            </div>
                          </div>
                          </article>
                        </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                {selectedProductId != null && renderProductDetailOverlay()}

                <section className="storefront__hero-compact storefront__hero-compact--after-products">
                  <div className="storefront__hero-compact-copy">
                    <h2 className="storefront__hero-heading">
                      اكتشف منتجات المتجر وتسوّق بهدوء مع مساعد ذكي
                    </h2>
                    <p className="storefront__hero-lead">
                      {store?.delivery_info ||
                        "نساعدك تختار الخيار المناسب وتكمل طلبك بخطوات واضحة."}
                    </p>
                    <ul className="storefront__hero-trust-inline">
                      <li>
                        <span className="storefront__hero-trust-dot" aria-hidden />
                        طلب آمن
                      </li>
                      <li>
                        <span className="storefront__hero-trust-dot" aria-hidden />
                        رد سريع
                      </li>
                      <li>
                        <span className="storefront__hero-trust-dot" aria-hidden />
                        تأكيد قبل التجهيز
                      </li>
                    </ul>
                  </div>
                  <div className="storefront__hero-compact-art" aria-hidden="true" />
                </section>

                <section className="storefront__features-row" aria-label="لماذا هذا المتجر">
                  <article className="storefront__feature-card">
                    <span className="storefront__feature-num">01</span>
                    <div>
                      <strong>تأكيد قبل التجهيز</strong>
                      <p>الطلب يُراجع معك قبل التحضير أو الشحن.</p>
                    </div>
                  </article>
                  <article className="storefront__feature-card">
                    <span className="storefront__feature-num">02</span>
                    <div>
                      <strong>خيارات واضحة</strong>
                      <p>مواصفات وسعر ومخزون واضحين قبل الإضافة للسلة.</p>
                    </div>
                  </article>
                  <article className="storefront__feature-card">
                    <span className="storefront__feature-num">03</span>
                    <div>
                      <strong>دعم سريع</strong>
                      <p>المساعد الذكي أو التواصل المباشر عند الحاجة.</p>
                    </div>
                  </article>
                </section>
              </div>
            </div>
          )}
          <button
            type="button"
            className="storefront__view-toggle"
            onClick={() =>
              setPageMode((m) => (m === "assistant" ? "products" : "assistant"))
            }
            aria-pressed={pageMode === "assistant"}
            aria-label={
              pageMode === "assistant" ? "عرض المنتجات" : "عرض المساعد الذكي"
            }
          >
            {pageMode === "assistant" ? (
              <>
                <span className="storefront__view-toggle-icon" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
                  </svg>
                </span>
                المنتجات
              </>
            ) : (
              <>
                <span className="storefront__view-toggle-icon" aria-hidden>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M12 2l1.09 3.26L16 6l-2.91 1.74L12 11l-1.09-3.26L8 6l2.91-1.74L12 2z"
                      fill="currentColor"
                    />
                    <path
                      d="M19 15l.68 2.05 2.17.66-2.17.66L19 20l-.68-2.05-2.17-.66 2.17-.66L19 15z"
                      fill="currentColor"
                      opacity="0.85"
                    />
                  </svg>
                </span>
                المساعد
              </>
            )}
          </button>
        </>
      )}

      {cart.length > 0 && (
        <ul
          className="storefront__cart-list card"
          id="storefront-cart-lines"
        >
          {cart.map((line, i) => (
            <li key={`${line.product_id}-${line.variant_id}-${i}`}>
              <span>
                {line.title} — {formatStoreMoney(line.unitPrice * line.qty, storeCurrency)}
              </span>
              <div className="cart-line-actions">
                <button type="button" onClick={() => decreaseLineQty(i)}>
                  -
                </button>
                <span>{line.qty}</span>
                <button
                  type="button"
                  onClick={() => increaseLineQty(i)}
                  disabled={Number.isFinite(line.maxStock) && line.qty >= line.maxStock}
                  title={
                    Number.isFinite(line.maxStock) && line.qty >= line.maxStock
                      ? "وصلت للحد الأقصى من المخزون"
                      : ""
                  }
                >
                  +
                </button>
                <button type="button" onClick={() => removeLine(i)}>
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showCheckout && cart.length > 0 && (
        <section className="storefront__checkout card" ref={checkoutSectionRef}>
          <div className="storefront__checkout-head">
            <div>
              <p>خطوة أخيرة</p>
              <h2>تأكيد بيانات الطلب</h2>
            </div>
            <span>{cartCount} عنصر</span>
          </div>
          <div className="storefront__checkout-summary">
            <span>إجمالي تقريبي</span>
            <strong>{formatStoreMoney(cartTotal, storeCurrency)}</strong>
            <small>سيتواصل المتجر معك لتأكيد التفاصيل والتوصيل.</small>
          </div>
          <div className="storefront__checkout-fields">
            <label className="storefront__field">
              الاسم *
              <input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                placeholder="اسمك الكامل"
              />
            </label>
            <label className="storefront__field">
              الهاتف *
              <input
                dir="ltr"
                value={custPhone}
                onChange={(e) => setCustPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
              />
            </label>
            <label className="storefront__field storefront__field--wide">
              العنوان *
              <input
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                placeholder="المدينة، المنطقة، أقرب علامة"
              />
            </label>
            <label className="storefront__field storefront__field--wide">
              ملاحظات اختيارية
              <input
                value={custNotes}
                onChange={(e) => setCustNotes(e.target.value)}
                placeholder="ملاحظات التوصيل أو المنتج (اختياري)"
              />
            </label>
          </div>
          <button
            type="button"
            className="storefront__submit-order"
            disabled={
              orderSending ||
              !custName.trim() ||
              !custPhone.trim() ||
              !custAddress.trim()
            }
            onClick={sendOrder}
          >
            {orderSending ? "جاري الإرسال…" : "تأكيد الطلب"}
          </button>
          {checkoutError && <p className="storefront__cart-error">{checkoutError}</p>}
          {orderMsg && <p className="storefront__order-msg">{orderMsg}</p>}
        </section>
      )}

      {cart.length > 0 && (
        <div className="storefront__cart-bar">
          <div className="storefront__cart-bar-inner">
            <div className="storefront__cart-bar-left">
              <div className="storefront__cart-bar-thumbs" aria-hidden="true">
                {cart.slice(0, 4).map((line, i) => {
                  const thumb = productThumbUrl(line.product_id);
                  return (
                    <span
                      key={`${line.product_id}-${line.variant_id}-${i}-thumb`}
                      className="storefront__cart-thumb"
                    >
                      {thumb ? (
                        <img src={thumb} alt="" />
                      ) : (
                        <span>{line.title.slice(0, 1)}</span>
                      )}
                    </span>
                  );
                })}
              </div>
              <span className="storefront__cart-bar-count">{cartCount} عنصر</span>
            </div>
            <div className="storefront__cart-bar-center">
              <small>الإجمالي</small>
              <strong>{formatStoreMoney(cartTotal, storeCurrency)}</strong>
            </div>
            <button
              type="button"
              className="storefront__cart-bar-cta"
              onClick={() => {
                setPageMode("products");
                setShowCheckout(true);
                window.setTimeout(() => {
                  checkoutSectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  });
                }, 0);
              }}
            >
              إتمام الطلب
            </button>
          </div>
        </div>
      )}
      {createdOrder && (
        <div className="storefront__order-confirmation">
          <span>تم استلام طلبك</span>
          <strong>سنراجع الطلب ونتواصل معك قريبًا.</strong>
          <p>رقم الطلب: #{createdOrder.order_id}</p>
          <p>الإجمالي: {createdOrder.total_amount}</p>
          <p>الحالة: {createdOrder.status}</p>
          <div className="storefront__next-steps">
            <b>الخطوة التالية</b>
            <small>
              المتجر سيتأكد من التفاصيل، ثم يتواصل معك لتأكيد التوصيل أو أي
              ملاحظة قبل التجهيز.
            </small>
          </div>
          <div className="storefront__confirmation-actions">
            {storePhone && <a href={`tel:${storePhone}`}>اتصال بالمتجر</a>}
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                WhatsApp المتجر
              </a>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
