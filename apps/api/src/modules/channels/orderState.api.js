const { ORDER_STATES } = require("./orderState.constants");

/**
 * @param {object | null | undefined} row
 */
function mapOrderStateFromRow(row) {
  if (!row) {
    return {
      order_state: ORDER_STATES.AWAITING_PRODUCT,
      order_product_id: null,
      order_product_name: null,
      customer_city: null,
      customer_phone: null,
      customer_name: null,
      customer_address: null,
      payment_method: null,
      buy_committed: false,
    };
  }

  return {
    order_state: row.order_state || ORDER_STATES.AWAITING_PRODUCT,
    order_product_id: row.order_product_id ?? null,
    order_product_name: row.order_product_name ?? null,
    customer_city: row.customer_city ?? null,
    customer_phone: row.customer_phone ?? null,
    customer_name: row.customer_name ?? null,
    customer_address: row.customer_address ?? null,
    payment_method: row.payment_method ?? null,
    buy_committed: Number(row.buy_committed) === 1,
  };
}

const ORDER_STATE_LABELS_AR = {
  [ORDER_STATES.AWAITING_PRODUCT]: "اختيار المنتج",
  [ORDER_STATES.AWAITING_LOCATION]: "بانتظار العنوان",
  [ORDER_STATES.AWAITING_PHONE]: "بانتظار الهاتف",
  [ORDER_STATES.CONFIRMED_AWAITING_FINALIZE]: "جاهز للتثبيت",
  [ORDER_STATES.CONFIRMED]: "تم التثبيت",
};

const PAYMENT_LABELS_AR = {
  cash_on_delivery: "كاش عند الاستلام",
};

/**
 * @param {ReturnType<typeof mapOrderStateFromRow>} state
 */
function formatOrderStateForApi(state) {
  const orderState = state?.order_state || ORDER_STATES.AWAITING_PRODUCT;
  return {
    ...state,
    order_state_label_ar: ORDER_STATE_LABELS_AR[orderState] || orderState,
    payment_method_label_ar: state?.payment_method
      ? PAYMENT_LABELS_AR[state.payment_method] || state.payment_method
      : null,
  };
}

module.exports = {
  mapOrderStateFromRow,
  formatOrderStateForApi,
  ORDER_STATE_LABELS_AR,
};
