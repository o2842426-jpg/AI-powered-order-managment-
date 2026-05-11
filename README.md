# DM Commerce

AI-powered order management system for Instagram shops and small online stores.

## Monorepo Structure

- `apps/api` - Node.js + Express backend API
- `apps/web` - React + Vite frontend
- `docs` - product and API documentation
- `infra/db` - migrations and seed files (next step)

## Requirements

- Node.js 20+
- npm 10+

## Installation

```bash
npm install
```

If workspace install is not available on your npm setup, install each app separately:

```bash
cd apps/api && npm install
cd ../web && npm install
```

## Run

Backend:

```bash
npm run dev:api
```

Frontend:

```bash
npm run dev:web
```

## API Health Check

`GET /api/health`

Response:

```json
{ "ok": true, "service": "dm-commerce-api" }
```

## Next Steps

1. Add SQLite connection layer and migrations
2. Implement auth register/login
3. Implement products and variants APIs
4. Connect frontend storefront to public APIs
