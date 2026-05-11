# Architecture (MVP v1)

## Purpose

Reduce operational chaos for small stores by using AI chat to support customers from first question to order placement.

## Core Modules

- Customer storefront and chat (web)
- Owner dashboard (web)
- Backend API (Express)
- SQLite database
- AI assistant (OpenAI API, grounded by store data)

## MVP Scope

- Product management with variants and stock
- Public storefront link
- AI-assisted chat
- Order creation flow
- Owner order management

## MVP Database Entities

- `stores`
- `users`
- `products`
- `product_variants`
- `customers`
- `orders`
- `order_items`
- `chat_sessions`
- `chat_messages`

## Pricing Rule (Important)

- Use `product_variants.price` when it exists.
- Otherwise fallback to `products.base_price`.
- Save final price in `order_items.unit_price` at order time.
