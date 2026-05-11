# SQLite Build Hints (Mentor Notes)

## 1) Start Simple

For today, build only these tables:

- `stores`
- `users`
- `products`
- `product_variants`

Leave `orders` and `chat` for next session.

## 2) Field Hints

### stores
- `id` integer primary key
- `name` text not null
- `slug` text unique not null
- `phone` text
- `delivery_info` text
- `created_at` text default current timestamp

### users
- `id` integer primary key
- `store_id` integer not null (FK -> stores.id)
- `name` text not null
- `email` text unique not null
- `password_hash` text not null
- `role` text default 'owner'

### products
- `id` integer primary key
- `store_id` integer not null (FK -> stores.id)
- `name` text not null
- `description` text
- `base_price` real not null
- `is_active` integer default 1

### product_variants
- `id` integer primary key
- `product_id` integer not null (FK -> products.id)
- `size` text
- `color` text
- `price` real
- `stock_qty` integer not null default 0

## 3) Validation Hints

- price must be >= 0
- stock must be >= 0
- variant must belong to a valid product
- slug and email must be unique

## 4) Common Mistakes To Avoid

- Do not store arrays in one field for size/color
- Do not skip `unit_price` later in `order_items`
- Do not rely only on app logic; enforce key constraints in DB

## 5) Tomorrow Next Step

Add:

- `customers`
- `orders`
- `order_items`

Then create one seed file with:

- 1 store
- 1 owner user
- 3 products
- 6 variants
