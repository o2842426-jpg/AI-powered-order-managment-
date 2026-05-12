# API Contracts (MVP v1 Draft)

## Auth

- `POST /api/auth/register` — body: `{ store_id, name, email, password }` (store must already exist).
- `POST /api/auth/login` — body: `{ email, password }`.
- `POST /api/auth/create-store` — self-service: body `{ store_name, slug?, phone?, delivery_info?, owner_name, email, password }`. Creates `stores` row + owner `users` row in one transaction; returns same shape as login plus `data.store` `{ id, slug, name }`. Slug: lowercase `a-z0-9-`; if omitted, derived from `store_name` (ASCII) or random `store-hex…`; must be unique.

## System

- `GET /api/health`

## Planned Public Endpoints

- `GET /api/public/:storeSlug/products`
- `POST /api/public/:storeSlug/chat/sessions`
- `POST /api/public/:storeSlug/orders`

## Planned Owner Endpoints

- `GET /api/products`
- `POST /api/products`
- `GET /api/orders`
- `PATCH /api/orders/:id/status`
