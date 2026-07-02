import { getApiBase } from "./api";

/** Sentinel values kept for conditional UI (upgrade CTAs, takeover gates). */
export const API_ERROR_CODES = {
  PLAN_REQUIRED: "PLAN_REQUIRED",
  TAKEOVER_REQUIRED: "TAKEOVER_REQUIRED",
  INSTAGRAM_SEND_FAILED: "INSTAGRAM_SEND_FAILED",
};

const CODE_MESSAGES_AR = {
  PLAN_REQUIRED:
    "هذه الميزة تحتاج ترقية الباقة — انتقل إلى صفحة الترقية لتفعيلها.",
  SUBSCRIPTION_REQUIRED:
    "الاشتراك غير نشط — جدّد الاشتراك أو تواصل مع الدعم للوصول إلى لوحة المالك.",
  AI_QUOTA_EXCEEDED:
    "وصلت للحد الشهري لردود الذكاء الاصطناعي — رقِّ الباقة لمتابعة الردود التلقائية.",
  TAKEOVER_REQUIRED:
    "فعّل «التولّي اليدوي» أولاً قبل إرسال رسائل من لوحة التحكم.",
  INSTAGRAM_SEND_FAILED:
    "تعذّر الإرسال إلى إنستغرام — تحقق من ربط الحساب وصلاحيات التطبيق ثم أعد المحاولة.",
  ENCRYPTION_NOT_CONFIGURED:
    "السيرفر غير مهيأ لتشفير توكن إنستغرام — تواصل مع الدعم.",
  CHANNEL_CONNECTION_UNAVAILABLE:
    "ربط إنستغرام غير متاح أو منقطع — أعد الربط من الإعدادات.",
  CONVERSATION_ARCHIVED:
    "هذه المحادثة مؤرشفة — لا يمكن الإرسال إليها.",
  MANUAL_BILLING:
    "الدفع اليدوي مفعّل — استخدم تعليمات التحويل البنكي في صفحة الترقية.",
  STORE_AI_DISABLED:
    "الرد التلقائي معطّل لهذا المتجر.",
};

const STATUS_MESSAGES_AR = {
  400: "طلب غير صالح — تحقق من البيانات المدخلة.",
  401: "انتهت الجلسة أو بيانات الدخول غير صحيحة — سجّل الدخول مجددًا.",
  402: "اشتراك مطلوب للوصول إلى هذه الميزة.",
  403: "ليس لديك صلاحية لهذا الإجراء.",
  404: "المورد المطلوب غير موجود.",
  409: "تعارض في البيانات — حدّث الصفحة وحاول مجددًا.",
  413: "الملف كبير جدًا — استخدم صورة أصغر.",
  429: "طلبات كثيرة — انتظر قليلًا ثم أعد المحاولة.",
  500: "خطأ داخلي في السيرفر — أعد المحاولة لاحقًا.",
  502: "الخادم أو إنستغرام لم يستجب — تحقق من حالة api.shopiq.me.",
  503: "الخدمة غير متاحة مؤقتًا — أعد المحاولة بعد دقائق.",
  504: "انتهت مهلة الاتصال بالخادم — تحقق من الإنترنت وحاول مجددًا.",
};

export class ApiError extends Error {
  /**
   * @param {{ userMessage: string, code?: string, status?: number, body?: object, cause?: unknown }} opts
   */
  constructor({ userMessage, code, status, body, cause }) {
    super(userMessage);
    this.name = "ApiError";
    this.userMessage = userMessage;
    this.code = code || body?.code || "";
    this.status = status ?? 0;
    this.body = body || {};
    if (cause) this.cause = cause;
  }
}

function apiHostLabel() {
  const base = getApiBase();
  if (!base) return "الخادم";
  try {
    const normalized =
      base.startsWith("http://") || base.startsWith("https://")
        ? base
        : `https://${base.replace(/^\/+/, "")}`;
    return new URL(normalized).host;
  } catch {
    return base.replace(/^https?:\/\//, "").replace(/\/$/, "") || "الخادم";
  }
}

function isNetworkFailure(err) {
  if (!err) return false;
  const msg = String(err.message || "").toLowerCase();
  if (err.name === "TypeError") {
    return (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    );
  }
  return false;
}

function networkMessage() {
  const host = apiHostLabel();
  return `تعذّر الاتصال بـ ${host} — تحقق من الإنترنت، أو أن الخادم يعمل، أو إعدادات CORS/Cloudflare.`;
}

function pickServerMessage(body) {
  if (!body || typeof body !== "object") return "";
  const raw = body.message || body.error || body.detail || "";
  const text = String(raw).trim();
  return text;
}

/**
 * Build a user-facing Arabic message from an HTTP response.
 * @param {Response} res
 * @param {object} body
 * @param {{ fallback?: string }} [opts]
 */
export function messageFromApiResponse(res, body = {}, { fallback = "تعذّر إتمام الطلب." } = {}) {
  const code = String(body?.code || "").trim();
  if (code && CODE_MESSAGES_AR[code]) {
    return CODE_MESSAGES_AR[code];
  }

  const serverMsg = pickServerMessage(body);
  if (serverMsg) {
    return serverMsg;
  }

  const statusMsg = STATUS_MESSAGES_AR[res?.status];
  if (statusMsg) {
    return `${statusMsg} (رمز ${res.status})`;
  }

  if (res?.status) {
    return `${fallback} (رمز ${res.status})`;
  }

  return fallback;
}

/**
 * @param {Response} res
 * @param {object} body
 * @param {{ fallback?: string }} [opts]
 */
export function createApiErrorFromResponse(res, body = {}, opts = {}) {
  const code = String(body?.code || "").trim();
  const userMessage = messageFromApiResponse(res, body, opts);
  return new ApiError({
    userMessage,
    code,
    status: res?.status ?? 0,
    body,
  });
}

/**
 * @param {Response} res
 * @param {object} body
 * @param {{ fallback?: string }} [opts]
 */
export function throwIfNotOk(res, body = {}, opts = {}) {
  if (res?.ok) return;
  throw createApiErrorFromResponse(res, body, opts);
}

/**
 * Turn any thrown value into a specific Arabic message for the UI.
 * @param {unknown} err
 * @param {{ fallback?: string }} [opts]
 */
export function userErrorMessage(err, { fallback = "تعذّر إتمام الطلب." } = {}) {
  if (err instanceof ApiError && err.userMessage) {
    return err.userMessage;
  }

  if (isNetworkFailure(err)) {
    return networkMessage();
  }

  const msg = String(err?.message || "").trim();
  if (!msg) return fallback;

  if (msg.toLowerCase() === "failed to fetch") {
    return networkMessage();
  }

  if (msg === "billing status failed") {
    return "تعذّر تحميل حالة الفوترة — تحقق من الاتصال بالخادم.";
  }

  return msg;
}

/**
 * Wrap fetch failures as ApiError with a clear network message.
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withNetworkError(fn) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isNetworkFailure(err)) {
      throw new ApiError({
        userMessage: networkMessage(),
        cause: err,
      });
    }
    throw err;
  }
}
