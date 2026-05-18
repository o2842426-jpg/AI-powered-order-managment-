# API Contracts (MVP v1 Draft)

## Implementation layout (server)

- **Public storefront** (`apps/api/src/modules/public/`): `public.routes.js` wires handlers from `public.catalog.controller.js` (products), `public.orders.controller.js` (orders), `public.chat.controller.js` (chat), `public.chat.service.js` (shared catalog + message enrichment), and `publicSlug.js` (slug normalization).
- **Store summary analytics** (`apps/api/src/modules/analytics/`): `storeAnalytics.service.js` يجمّع `computeStoreAnalytics`؛ المساعدات في `storeAnalytics.helpers.js` ومخطط الإيراد في `storeAnalytics.incomeChart.js` — يُستدعى من `GET /api/stores/:storeId/summary` في `stores.controller.js`.

- **Store memory facts (P5)** — `GET|POST /api/stores/:storeId/memory-facts`, `DELETE /api/stores/:storeId/memory-facts/:factId` (خطة **`customer_memory`** = Pro عند تفعيل الفوترة). تُقرأ حتى 40 حقيقة وتُدمَج في برومبت مساعد الشات العام عند أهلية المتجر لـ Pro.
- **Lead scoring (P6)** — `apps/api/src/modules/leads/leadScoring.service.js`: قواعد إرشادية على `chat_sessions` و`payload` لرسائل العميل؛ تُستدعى من `public.chat.controller.js` وتُعرَض في `conversations.controller.js` و`public.chat.service.js`.
- **AI follow-up phrases (برومبت المساعد)** — `GET|POST /api/stores/:storeId/ai-followups`, `DELETE .../ai-followups/:followupId` (خطة **`ai_followups`** = Pro عند تفعيل الفوترة). تُقرأ حتى 40 عبارة وتُدمَج في برومبت مساعد الشات العام (`ai.service.js` + `public.chat.controller.js`).
- **مقترحات متابعة في لوحة المحادثات (P7)** — `GET /api/stores/:storeId/followup-tasks`، `PATCH .../followup-tasks/:taskId` مع `{ "status": "done" | "dismissed" }` (خطط **`conversations_dashboard`** + **`followup_tasks`**، أي Growth للوحة ثم Pro للمهام). تُزامَن مع جلسات آخرُ كلام فيها العميل؛ لا إرسال بريد/رسائل خارجية.

## Auth

- `POST /api/auth/register` — body: `{ store_id, name, email, password }` (store must already exist).
- `POST /api/auth/login` — body: `{ email, password }`.
- `POST /api/auth/create-store` — self-service: body `{ store_name, slug?, phone?, delivery_info?, owner_name, email, password }`. Creates `stores` row + owner `users` row in one transaction; returns same shape as login plus `data.store` `{ id, slug, name }`. Slug: lowercase `a-z0-9-`; if omitted, derived from `store_name` (ASCII) or random `store-hex…`; must be unique.

## Billing (owner)

- `GET /api/billing/status` — returns `data.billing_enforced`, `data.has_access`, `data.subscription_status`, `data.access_reason` (`in_trial` | `subscribed` | `trial_expired` | `payment_required` | `subscription_inactive` | `suspended`), `data.trial_started_at`, `data.trial_ends_at` (ISO), `data.current_period_end`, `data.can_use_portal`. When billing is enforced, owner tools require `has_access === true` (paid/trialing Stripe **or** in-window app trial after `POST /api/auth/create-store`).

## System

- `GET /api/health`

## Admin (platform)

يتطلب رأس `X-Admin-Key` مطابقًا لـ `ADMIN_API_KEY` في الخادم. إذا لم يُضبط المفتاح، تُعاد `503`.

- `GET /api/admin/stores?limit=&offset=` — قائمة المتاجر مع `owner_email` وحقول الفوترة/التجربة.
- `PATCH /api/admin/stores/:storeId` — جسم JSON اختياري: `subscription_status` (`active` \| `trial` \| `suspended` \| `trialing` \| `past_due` \| `unpaid`)، `trial_ends_at` (ISO)، `extend_trial_days` (1–365)، `clear_stripe` (`true` لمسح معرفات Stripe على المتجر).

## Public chat (storefront)

- **تقييم الاهتمام (P6)** — خطة **`lead_scoring`** = Pro عند تفعيل الفوترة؛ عند عدم التفعيل يُحسب للجميع (تطوير محلي). بعد كل رسالة عميل مؤهّلة: تُحدَّث أعمدة الجلسة `lead_score` (0–100)، `lead_score_reason` (نص قصير)، `lead_scored_at`؛ ويُخزَّن نفس اللقطة في `payload` لصف رسالة العميل كـ JSON `{ "lead_score": number, "lead_score_reason": string }` (قواعد إرشادية وليست حقيقة مطلقة).

- `POST /api/public/:storeSlug/chat/sessions` — ينشئ جلسة شات؛ الاستجابة تتضمن حقول الجلسة بما فيها `owner_takeover` و`lead_score` / `lead_score_reason` / `lead_scored_at` عند توفرها في المخطط (قد تكون فارغة حتى أول رسالة عميل).
- `POST /api/public/:storeSlug/chat/messages` — جسم `{ session_id, message_text }`. عند **`owner_takeover = 1`** على الجلسة: يُحفظ رسالة العميل فقط، **بدون** رد AI وبدون زيادة عدّاد الاستخدام؛ الاستجابة قد تتضمن `data.owner_takeover_active: true` و`data.messages` (آخر رسالتين). عند التولّي غير المفعّل: يُنشأ رد AI كالعادة مع `payload` اختياري `{ "recommended_product_ids": number[] }` وحقول `recommended_product_ids` / `recommended_products` على صفوف `sender_type === "ai"`. في المسارين (مع أهلية الخطة أو بدون فوترة): `data.lead_score` و`data.lead_score_reason` تعكس آخر تقييم بعد الرسالة (أو `null` إن لم يُفعَّل التقييم للمتجر).
- `GET /api/public/:storeSlug/chat/sessions/:sessionId/messages` — يعيد `data.session` (يشمل `owner_takeover` وأعمدة التقييم إن وُجدت) و`data.messages` بنفس شكل التوسيع للرسائل AI؛ لرسائل العميل ذات `payload` تقييم تُعرَض أيضًا `lead_score` و`lead_score_reason` على الكائن.
- عند أهلية المتجر لـ **`ai_followups`** (أو عند عدم فرض الفوترة للتطوير)، تُدمَج «عبارات المتابعة» من لوحة المالك في برومبت مساعد الشات قبل توليد رد AI (`POST .../chat/messages` في المسار غير التولّي).

## Owner — مساعد الشات (ذاكرة ومتابعات، Pro عند تفعيل الفوترة)

يتطلب `Authorization: Bearer` ومسار تحت `/api/stores/:storeId/...` لمطابقة `store_id` للمستخدم.

- `GET|POST /api/stores/:storeId/memory-facts`، `DELETE /api/stores/:storeId/memory-facts/:factId` — خطة **`customer_memory`**؛ جسم الإنشاء `{ "fact_text": "..." , "sort_order"?: number }`.
- `GET|POST /api/stores/:storeId/ai-followups`، `DELETE /api/stores/:storeId/ai-followups/:followupId` — خطة **`ai_followups`**؛ جسم الإنشاء `{ "followup_text": "..." , "sort_order"?: number }`؛ حد أقصى 40 صفًا لكل متجر.
- `GET /api/stores/:storeId/followup-tasks`، `PATCH /api/stores/:storeId/followup-tasks/:taskId` — خطط **`conversations_dashboard`** و **`followup_tasks`**؛ الـ PATCH يحدّث حالة المقترح (`done` أو `dismissed`). جدول `chat_followup_tasks` في `followupTasks.controller.js`.

## Owner — محادثات المتجر (مصادقة + اشتراك + خطة عند تفعيل الفوترة)

يتطلب `Authorization: Bearer` ومسار تحت `/api/stores/:storeId/...` لمطابقة `store_id` للمستخدم.

- `GET /api/stores/:storeId/chat-sessions` — قائمة الجلسات (خطة: **`conversations_dashboard`** عند تفعيل الفوترة)؛ كل صف يتضمن `lead_score`، `lead_score_reason`، `lead_scored_at` عند توفرها.
- `GET /api/stores/:storeId/chat-sessions/:sessionId` — تفاصيل جلسة + الرسائل (نفس خطة القائمة)؛ الجلسة بنفس أعمدة التقييم؛ رسائل العميل قد تتضمن `lead_score` و`lead_score_reason` المستخرجة من `payload` عند وجودها.
- `PATCH /api/stores/:storeId/chat-sessions/:sessionId/takeover` — جسم `{ "enabled": true | false }` فقط؛ يحدّث `owner_takeover` (خطة: **`human_takeover`**).
- `POST /api/stores/:storeId/chat-sessions/:sessionId/owner-messages` — جسم `{ "message_text": "..." }`؛ مسموح عندما تكون الجلسة في وضع التولّي (`owner_takeover = 1`) (خطة: **`human_takeover`**). عند غير التفعيل: استجابة تعارض مع رمز مثل `TAKEOVER_REQUIRED`.

عند رفض الخطة: `403` مع `code: "PLAN_REQUIRED"` و`feature` و`message` (نص إنجليزي في الـ API).

## Planned Public Endpoints

- (مُنجَز أعلاه: المنتجات والطلبات وجلسات الشات — يُبقى هذا القسم للمراجعات التاريخية أو التوسعات القادمة.)

## Planned Owner Endpoints

- **صفحة الترقية (P8)** — واجهة `OwnerUpgradePage` في `apps/web` مع حركات خفيفة تحترم `prefers-reduced-motion` (انظر `OwnerUpgradePage.css`).

- (مُنجَز: مسارات المنتجات والطلبات والإعدادات حسب التطبيق — راجع كود `apps/api` للقائمة الحالية.)
