import { useEffect, useState } from 'react';
import { authFetch, getOwnerStoreIdFromAuth } from '../lib/auth';
import { throwIfNotOk, userErrorMessage, withNetworkError } from '../lib/apiErrors';
import { formatStoreMoney, normalizeStoreCurrencyCode } from '../lib/storeCurrency';
import './OwnerOrdersPage.css';

const ORDER_STATUSES = [
  'new',
  'confirmed',
  'shipped',
  'delivered',
  'cancelled',
];

const STATUS_LABELS = {
  all: 'الكل',
  new: 'جديد',
  confirmed: 'مؤكد',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
};

export function OwnerOrdersPage({ searchQuery: controlledSearch, onSearchChange } = {}) {
  const storeId = getOwnerStoreIdFromAuth();
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderDetail, setOrderDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [statusDraft, setStatusDraft] = useState('new');
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    new: 0,
    confirmed: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
    hidden: 0,
  });
  const [showHiddenOrders, setShowHiddenOrders] = useState(false);
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [internalSearch, setInternalSearch] = useState('');
  const controlled = typeof onSearchChange === 'function';
  const searchTerm = controlled ? (controlledSearch ?? '') : internalSearch;
  function setSearchTerm(v) {
    if (controlled) onSearchChange(v);
    else setInternalSearch(v);
  }




  useEffect(() => {
    if (orderDetail?.order?.status) {
      setStatusDraft(orderDetail.order.status);
    }
  }, [orderDetail]);

  useEffect(() => {
    if (!selectedOrderId) {
      setOrderDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);

    const url = `/api/orders/${selectedOrderId}`;

    authFetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throwIfNotOk(res, body, { fallback: 'تعذّر تحميل الطلب.' });
        }
        return body;
      })
      .then((body) => {
        if (!cancelled) {
          setOrderDetail(body.data ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDetailError(userErrorMessage(err, { fallback: 'تعذّر تحميل تفاصيل الطلب.' }));
          setOrderDetail(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedOrderId]);

  useEffect(() => {
    let cancelled = false;

    async function load({ silent = false } = {}) {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      if (!storeId.trim()) {
        setOrders([]);
        setError('لم يُعثر على معرّف المتجر في جلسة المالك. سجّل الخروج ثم الدخول مجددًا.');
        setLoading(false);
        return;
      }
      const hiddenQs = showHiddenOrders ? '&hidden_only=1' : '';
      const url = `/api/orders?store_id=${encodeURIComponent(storeId)}${hiddenQs}`;
      const countsUrl = `/api/orders/status-counts?store_id=${encodeURIComponent(storeId)}`;

      try {
        const [res, countsRes] = await Promise.all([
          authFetch(url),
          authFetch(countsUrl),
        ]);
        const body = await res.json().catch(() => ({}));
        const countsBody = await countsRes.json().catch(() => ({}));

        if (!res.ok) {
          throwIfNotOk(res, body, { fallback: 'تعذّر تحميل الطلب.' });
        }

        if (!cancelled) {
          setOrders(Array.isArray(body.data) ? body.data : []);
          if (countsRes.ok && countsBody?.data) {
            setStatusCounts((prev) => ({ ...prev, ...countsBody.data }));
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(userErrorMessage(e, { fallback: 'تعذّر تحميل الطلبات.' }));
          setOrders([]);
        }
      } finally {
        if (!cancelled && !silent) {
          setLoading(false);
        }
      }
    }

    load();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      load({ silent: true });
    }, 12000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [storeId, showHiddenOrders]);

  async function setOrderHidden(orderId, hidden) {
    setVisibilitySaving(true);
    setStatusMessage(null);
    try {
      const res = await authFetch(`/api/orders/${orderId}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hidden }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: 'تعذّر تحديث إظهار الطلب.' });
      }
      if (selectedOrderId === orderId && hidden) {
        setSelectedOrderId(null);
        setOrderDetail(null);
      }
      setOrders((prev) =>
        hidden && !showHiddenOrders
          ? prev.filter((row) => row.id !== orderId)
          : prev.map((row) =>
              row.id === orderId
                ? { ...row, is_hidden: hidden ? 1 : 0 }
                : row
            )
      );
      if (orderDetail?.order?.id === orderId) {
        setOrderDetail((prev) =>
          prev?.order
            ? { ...prev, order: { ...prev.order, is_hidden: hidden ? 1 : 0 } }
            : prev
        );
      }
      setStatusMessage(hidden ? 'تم إخفاء الطلب من القائمة.' : 'تم إرجاع الطلب للقائمة.');
      const countsRes = await authFetch(
        `/api/orders/status-counts?store_id=${encodeURIComponent(storeId)}`
      );
      const countsBody = await countsRes.json().catch(() => ({}));
      if (countsRes.ok && countsBody?.data) {
        setStatusCounts((prev) => ({ ...prev, ...countsBody.data }));
      }
    } catch (e) {
      setStatusMessage(userErrorMessage(e, { fallback: 'تعذّر تحديث إظهار الطلب.' }));
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveOrderStatus() {
    if (!selectedOrderId) return;
    setStatusSaving(true);
    setStatusMessage(null);
    const url = `/api/orders/${selectedOrderId}/status`;
    try {
      const res = await authFetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: 'تعذّر تحميل الطلب.' });
      }
      const updated = body.data;
      setOrderDetail((prev) => {
        if (!prev?.order) return prev;
        return {
          ...prev,
          order: {
            ...prev.order,
            status: updated.status ?? statusDraft,
            total_amount:
              updated.total_amount ?? prev.order.total_amount,
            created_at: updated.created_at ?? prev.order.created_at,
          },
        };
      });
      setOrders((prev) =>
        prev.map((row) =>
          row.id === selectedOrderId
            ? { ...row, status: updated.status ?? statusDraft }
            : row
        )
      );
      setStatusMessage('تم تحديث الحالة.');
    } catch (e) {
      setStatusMessage(userErrorMessage(e, { fallback: 'تعذر تحديث حالة الطلب.' }));
    } finally {
      setStatusSaving(false);
    }
  }

  async function quickUpdateStatus(orderId, nextStatus) {
    setStatusSaving(true);
    setStatusMessage(null);

    try {
      const res = await authFetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throwIfNotOk(res, body, { fallback: 'تعذّر تحميل الطلب.' });
      }

      setOrders((prev) =>
        prev.map((row) =>
          row.id === orderId ? { ...row, status: body.data?.status ?? nextStatus } : row
        )
      );
      setOrderDetail((prev) => {
        if (!prev?.order || prev.order.id !== orderId) return prev;
        return {
          ...prev,
          order: {
            ...prev.order,
            status: body.data?.status ?? nextStatus,
          },
        };
      });
      setStatusMessage('تم تحديث الحالة.');
    } catch (e) {
      setStatusMessage(userErrorMessage(e, { fallback: 'تعذر تحديث حالة الطلب.' }));
    } finally {
      setStatusSaving(false);
    }
  }

  function openOrderDetails(orderId) {
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      setOrderDetail(null);
      setStatusMessage(null);
      return;
    }

    setSelectedOrderId(orderId);
  }

  function getWhatsappUrl(order) {
    const phoneDigits = String(order?.customer_phone || '').replace(/[^\d]/g, '');
    if (phoneDigits.length < 8) return '';

    const message = encodeURIComponent(
      `مرحبًا ${order?.customer_name || ''}، معك المتجر بخصوص طلبك رقم #${order?.id}.`
    );

    return `https://wa.me/${phoneDigits}?text=${message}`;
  }

  function renderQuickStatusButtons(order) {
    const steps = [
      { status: 'confirmed', label: 'تأكيد' },
      { status: 'shipped', label: 'تم الشحن' },
      { status: 'delivered', label: 'تم التسليم' },
      { status: 'cancelled', label: 'إلغاء' },
    ];

    return steps
      .filter((step) => step.status !== order.status)
      .map((step) => (
        <button
          key={step.status}
          type="button"
          className={`owner-orders__status-action status-${step.status}`}
          onClick={() => quickUpdateStatus(order.id, step.status)}
          disabled={statusSaving}
        >
          {step.label}
        </button>
      ));
  }

  const filteredOrders = [...orders]
    .sort((a, b) => {
      const bTime = new Date(b.created_at || 0).getTime();
      const aTime = new Date(a.created_at || 0).getTime();
      return bTime - aTime || Number(b.id) - Number(a.id);
    })
    .filter((order) => {
      const search = searchTerm.trim().toLowerCase();
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      const searchableText = `${order.id} ${order.customer_name ?? ''} ${
        order.customer_phone ?? ''
      }`.toLowerCase();

      return matchesStatus && (!search || searchableText.includes(search));
    });

  function renderSelectedOrderDetail() {
    if (detailLoading) {
      return <p className="owner-orders__status">جاري تحميل تفاصيل الطلب…</p>;
    }

    if (detailError) {
      return (
        <div className="owner-orders__error" role="alert">
          {detailError}
        </div>
      );
    }

    if (!orderDetail) return null;

    const whatsappUrl = getWhatsappUrl(orderDetail.order);
    const detailCurrency = normalizeStoreCurrencyCode(
      orderDetail.order?.store_currency_code
    );

    return (
      <div className="owner-orders__detail" key={selectedOrderId}>
        <div className="owner-orders__detail-head">
          <div>
            <span>متابعة الطلب</span>
            <h2>تفاصيل الطلب #{selectedOrderId}</h2>
          </div>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              className="owner-orders__whatsapp"
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp العميل
            </a>
          )}
        </div>

        <section className="owner-orders__detail-block">
          <h3>معلومات الطلب</h3>
          <dl className="owner-orders__dl">
            <div>
              <dt>الحالة</dt>
              <dd>
                <span className="owner-orders__badge">
                  {orderDetail.order?.status}
                </span>
              </dd>
            </div>
            <div>
              <dt>المبلغ</dt>
              <dd>{formatStoreMoney(orderDetail.order?.total_amount, detailCurrency)}</dd>
            </div>
            <div>
              <dt>التاريخ</dt>
              <dd>{orderDetail.order?.created_at ?? '—'}</dd>
            </div>
            <div>
              <dt>العميل</dt>
              <dd>{orderDetail.order?.customer_name ?? '—'}</dd>
            </div>
            <div>
              <dt>الهاتف</dt>
              <dd dir="ltr">{orderDetail.order?.customer_phone ?? '—'}</dd>
            </div>
            <div>
              <dt>عنوان التوصيل</dt>
              <dd>{orderDetail.order?.delivery_address ?? '—'}</dd>
            </div>
            <div>
              <dt>ملاحظة العميل</dt>
              <dd>{orderDetail.order?.customer_note ?? '—'}</dd>
            </div>
          </dl>
          <div className="owner-orders__customer-actions">
            {orderDetail.order?.customer_phone && (
              <a href={`tel:${orderDetail.order.customer_phone}`}>اتصال بالعميل</a>
            )}
            {whatsappUrl && (
              <a href={whatsappUrl} target="_blank" rel="noreferrer">
                رسالة WhatsApp جاهزة
              </a>
            )}
          </div>
        </section>

        <section className="owner-orders__detail-block">
          <h3>تحديث الحالة</h3>
          <div className="owner-orders__status-actions">
            {renderQuickStatusButtons(orderDetail.order)}
          </div>
          <div className="owner-orders__status-row">
            <label htmlFor="order-status">الحالة</label>
            <select
              id="order-status"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              disabled={statusSaving}
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="owner-orders__save-status"
              onClick={saveOrderStatus}
              disabled={statusSaving}
            >
              {statusSaving ? 'جاري الحفظ…' : 'حفظ الحالة'}
            </button>
          </div>
          {statusMessage && (
            <p className="owner-orders__status-msg">{statusMessage}</p>
          )}
          <div className="owner-orders__visibility-actions">
            {Number(orderDetail.order?.is_hidden) === 1 ? (
              <button
                type="button"
                className="owner-orders__unhide-btn"
                disabled={visibilitySaving}
                onClick={() => void setOrderHidden(selectedOrderId, false)}
              >
                {visibilitySaving ? 'جاري التحديث…' : 'إرجاع للقائمة'}
              </button>
            ) : (
              <button
                type="button"
                className="owner-orders__hide-btn"
                disabled={visibilitySaving}
                onClick={() => void setOrderHidden(selectedOrderId, true)}
              >
                {visibilitySaving ? 'جاري الإخفاء…' : 'إخفاء من القائمة'}
              </button>
            )}
          </div>
        </section>

        <section className="owner-orders__detail-block">
          <h3>عناصر الطلب</h3>
          {Array.isArray(orderDetail.items) && orderDetail.items.length > 0 ? (
            <div className="owner-orders__table-wrap owner-orders__table-wrap--nested">
              <table className="owner-orders__table">
                <thead>
                  <tr>
                    <th>المنتج</th>
                    <th>المواصفة 1</th>
                    <th>المواصفة 2</th>
                    <th>SKU</th>
                    <th>الكمية</th>
                    <th>سعر الوحدة</th>
                    <th>الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {orderDetail.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.product_name ?? '—'}</td>
                      <td>{it.variant_size ?? '—'}</td>
                      <td>{it.variant_color ?? '—'}</td>
                      <td dir="ltr">{it.variant_sku ?? '—'}</td>
                      <td>{it.qty}</td>
                      <td>{formatStoreMoney(it.unit_price, detailCurrency)}</td>
                      <td>{formatStoreMoney(it.line_total, detailCurrency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="owner-orders__empty">لا توجد عناصر.</p>
          )}
        </section>

        <button
          type="button"
          className="owner-orders__close-detail"
          onClick={() => {
            setSelectedOrderId(null);
            setOrderDetail(null);
            setStatusMessage(null);
          }}
        >
          إغلاق التفاصيل
        </button>
      </div>
    );
  }

  return (
    <div className="owner-orders">
      <header className="owner-orders__header">
        <p className="owner-orders__eyebrow">Orders Command Center</p>
        <h1>الطلبات</h1>
        <p className="owner-orders__hint">
          تابع الطلبات الجديدة، أكّدها بسرعة، وتواصل مع العميل بدون ضغط.
        </p>
        <div className="owner-orders__store-badge" dir="ltr">
          <span>معرّف المتجر</span>
          <strong>{storeId || '—'}</strong>
          <small>من جلسة تسجيل الدخول</small>
        </div>
      </header>

      <section className="owner-orders__toolbar" aria-label="بحث وفلترة الطلبات">
        {!controlled && (
          <label className="owner-orders__search">
            <span>بحث سريع</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="اسم العميل، الهاتف، أو رقم الطلب"
            />
          </label>
        )}
        <div className="owner-orders__filters">
          <button
            type="button"
            className={showHiddenOrders ? 'is-active is-archive' : 'is-archive'}
            onClick={() => {
              setShowHiddenOrders((v) => !v);
              setSelectedOrderId(null);
              setOrderDetail(null);
            }}
          >
            {showHiddenOrders ? 'الطلبات النشطة' : 'المخفية'}
            {!showHiddenOrders && statusCounts.hidden > 0 ? (
              <span className="owner-orders__filter-badge owner-orders__filter-badge--muted">
                {statusCounts.hidden}
              </span>
            ) : null}
          </button>
          {!showHiddenOrders &&
            ['all', ...ORDER_STATUSES].map((status) => {
            const count =
              status === 'all' ? statusCounts.all : statusCounts[status] ?? 0;
            return (
            <button
              key={status}
              type="button"
              className={statusFilter === status ? 'is-active' : ''}
              onClick={() => setStatusFilter(status)}
            >
              {STATUS_LABELS[status] ?? status}
              {count > 0 ? (
                <span className="owner-orders__filter-badge" aria-label={`${count} طلب`}>
                  +{count}
                </span>
              ) : null}
            </button>
            );
          })}
        </div>
      </section>

      {loading && <p className="owner-orders__status">جاري التحميل…</p>}
      {error && (
        <div className="owner-orders__error" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && orders.length === 0 && (
        <>
          <p className="owner-orders__empty">
            {showHiddenOrders
              ? 'لا توجد طلبات مخفية.'
              : 'لا توجد طلبات لهذا المتجر.'}
          </p>
          {!showHiddenOrders && statusCounts.hidden > 0 ? (
            <p className="owner-orders__empty owner-orders__empty--hint">
              لديك {statusCounts.hidden} طلبًا مخفيًا — اضغط «المخفية» في شريط الفلترة
              لعرضه أو إظهاره مجددًا.
            </p>
          ) : null}
        </>
      )}

      {!loading && !error && orders.length > 0 && filteredOrders.length === 0 && (
        <p className="owner-orders__empty">لا توجد طلبات مطابقة للبحث.</p>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div className="owner-orders__board">
          <div className="owner-orders__cards">
            {filteredOrders.map((row) => (
              <article
                key={row.id}
                className={
                  selectedOrderId === row.id
                    ? 'owner-orders__card is-selected'
                    : 'owner-orders__card'
                }
              >
                <div className="owner-orders__card-top">
                  <div>
                    <span className="owner-orders__order-id">طلب #{row.id}</span>
                    <h2>{row.customer_name ?? 'عميل بدون اسم'}</h2>
                  </div>
                  <span className={`owner-orders__badge status-${row.status}`}>
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </div>

                <div className="owner-orders__meta">
                  <span>
                    الإجمالي:{' '}
                    {formatStoreMoney(
                      row.total_amount,
                      normalizeStoreCurrencyCode(row.store_currency_code)
                    )}
                  </span>
                  <span dir="ltr">{row.customer_phone ?? 'لا يوجد هاتف'}</span>
                  <span>{row.created_at ?? '—'}</span>
                </div>

                <div className="owner-orders__quick-actions">
                  {renderQuickStatusButtons(row).slice(0, 2)}
                  {row.customer_phone && (
                    <a href={`tel:${row.customer_phone}`}>اتصال</a>
                  )}
                  {getWhatsappUrl(row) && (
                    <a
                      href={getWhatsappUrl(row)}
                      className="owner-orders__quick-whatsapp"
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                  <button type="button" onClick={() => openOrderDetails(row.id)}>
                    {selectedOrderId === row.id ? 'إغلاق' : 'التفاصيل'}
                  </button>
                  {!showHiddenOrders ? (
                    <button
                      type="button"
                      className="owner-orders__hide-btn owner-orders__hide-btn--compact"
                      disabled={visibilitySaving}
                      onClick={() => void setOrderHidden(row.id, true)}
                    >
                      إخفاء
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="owner-orders__unhide-btn owner-orders__hide-btn--compact"
                      disabled={visibilitySaving}
                      onClick={() => void setOrderHidden(row.id, false)}
                    >
                      إرجاع
                    </button>
                  )}
                </div>
                {selectedOrderId === row.id && renderSelectedOrderDetail()}
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

