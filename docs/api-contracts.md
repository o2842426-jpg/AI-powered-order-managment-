# API Contracts (MVP v1 Draft)

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

## Planned Public Endpoints

- `GET /api/public/:storeSlug/products`
- `POST /api/public/:storeSlug/chat/sessions`
- `POST /api/public/:storeSlug/orders`

## Planned Owner Endpoints

- `GET /api/products`
- `POST /api/products`
- `GET /api/orders`
- `PATCH /api/orders/:id/status`
