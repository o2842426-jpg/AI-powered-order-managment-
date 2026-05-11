# Coding Mistakes Log

## 2026-05-05 - Storefront cart checks

- **Mistake:** Mixing draft pseudo-code and real code inside the same function.
  - **Why it happened:** Trying ideas quickly without deleting old trial lines.
  - **Rule:** Keep one final code path only; remove any temporary lines before testing.

- **Mistake:** Using undeclared variables (`p`, `selectedVariant`, `availableStock`) before proper declaration.
  - **Why it happened:** Thinking in algorithm steps but skipping `const/let` declarations.
  - **Rule:** Declare each step variable explicitly in order: input -> validation -> lookup -> decision -> update.

- **Mistake:** Wrong number validation shape (`isNaN.Number(...)`).
  - **Why it happened:** Confusing `isNaN` APIs while coding fast.
  - **Rule:** For numeric checks use `Number.isNaN(value)` after `Number(...)`.

- **Mistake:** Using wrong property while matching cart line (`p.variantId` instead of selected `variantId`).
  - **Why it happened:** Mixing product object fields with local computed fields.
  - **Rule:** Compare cart lines with `product_id` and local `variantId` that you already resolved.

- **Mistake:** Not calling state setter (`cartError(\"...\")` instead of `setCartError(\"...\")`).
  - **Why it happened:** Naming slip when moving quickly.
  - **Rule:** State values are read-only. Every update must use `setX`.
