# Current System Audit — Mzali Boutique

Date: 2026-07-17. Snapshot of the system **before** the NestJS/MongoDB migration.
Companion documents: `docs/target-architecture.md` (written in later phases), the
approved migration plan, and `docs/woocommerce-migration.md` (runbook, later phase).

## 1. Application shape

One Next.js **14.2.34** App Router application at the repo root (npm,
`package-lock.json`, TypeScript strict, path alias `@/*` → `./*`, Tailwind 3.4,
Zustand, lucide-react only — no UI kit). `output: 'standalone'`, Node ≥ 20.
No tests, no Docker, no CI/CD, no monorepo tooling. Deployment is manual
(Hostinger Node / standalone output).

Three surfaces inside the one app:

| Surface | Routes | Guard |
|---|---|---|
| Storefront (public) | `/`, `/shop`, `/categorie/[slug]`, `/produit/[slug]`, `/panier`, `/commande`, `/merci`, `/admin-login` | none |
| Admin console | `/mzali`, `/mzali/{commandes,produits,categories,employees,profile}` | `app/mzali/layout.tsx` requires role `admin` |
| Employee console | `/employee`, `/employee/commandes` | `app/employee/layout.tsx` requires `employee` or `admin` |

`proxy.ts` at root is middleware-style guard code but is **not** auto-registered
(file/export not named `middleware`); protection is effectively enforced by the
layouts plus per-route session checks in every `app/api/admin/*` and
`app/api/employee/*` handler.

## 2. Data sources (current)

| Data | Where it lives | Access path |
|---|---|---|
| Products, categories, orders | WooCommerce at `wp.ahmedmzaliboutique.com` | `services/woo/woo-client.ts` — Basic auth (`WC_CONSUMER_KEY/SECRET`) against `/wp-json/wc/v3`, always `cache: 'no-store'`, pagination via `x-wp-total` headers |
| Product/category images | WordPress media library (`wp-content` URLs rendered directly via `<img>`) | uploads through `POST /wp-json/wp/v2/media` (`WP_ADMIN_USER` + `WP_APP_PASSWORD`) from `app/api/admin/upload/route.ts` |
| Employees | `data/employees.json` — `{id (UUID), email, name, passwordHash (scrypt), salt, active, createdAt, updatedAt}` | `lib/employee-storage.ts` via `services/employees/file-employee-service.ts` |
| Admin credential | env `ADMIN_PASSWORD` master fallback + optional `data/admin.json` (scrypt) | `lib/admin-storage.ts` |
| Site settings (logo, phones, socials) | `data/site-settings.json` | `lib/admin-storage.ts` |
| Round-robin pointer | `data/round-robin-pointer.json` + `data/round-robin.lock` | `lib/round-robin.ts` (O_EXCL lock, atomic rename) |
| Cart | Browser localStorage key `mzali-cart` | `lib/cart.tsx` (Zustand persist) |

**The service abstraction is already in place.** `services/index.ts` is the single
factory ("THIS is the only place that knows which backend powers the storefront")
instantiating the Woo/file implementations behind interfaces:
`services/product-service.ts`, `category-service.ts`, `order-service.ts`,
`employee-service.ts`. The UI and API routes consume only normalized types from
`types/{product,category,order,cart}.ts`; raw Woo shapes are isolated in
`services/woo/woo-types.ts` and converted by `services/woo/woo-mappers.ts`.

## 3. WooCommerce endpoints actually used

- `GET|POST|PUT|DELETE /products`, `POST /products/batch` (menu_order reorder)
- `GET|POST|PUT|DELETE /products/categories`
- `GET|POST|PUT|DELETE /orders`
- `POST /wp-json/wp/v2/media` (WordPress core, not WC)

**Not used anywhere:** variations, customers, reviews, coupons, shipping zones,
payment gateways, Store API/CoCart, webhooks.

## 4. Business data carried in Woo meta (the real field-level contract)

Products: `_mzem_bundles` (offers: `regularPrice, price, quantity, badgeColor,
imageUrl, isDefault, name, label`), `_mzem_options`, `_mzem_cost`,
`_mzem_delivery_price`, `_mzem_delivery_cost`.

Orders: `_mzem_employee_id`, `_mzem_assigned_at`, `_mzem_assigned_by`,
`_mzem_assignment_history`, `_mzem_delivery_company`, `_mzem_phone_2`,
`_mzem_private_note`, `_mzem_exchange`, `_mzem_manual_subtotal`,
`_mzem_manual_total`, `_mzem_attempts`, `_mzem_source`, plus carrier results
`_navex_*`, `_fd_*`, `_axess_*`.

## 5. Order workflow

- **Statuses:** `en-attente` (default via `WC_DEFAULT_ORDER_STATUS`), `confirme`,
  `annule`, `tentative`, `checkout-draft` (abandoned-checkout drafts), plus
  standard WC `pending/processing/on-hold/completed/cancelled`.
- **Checkout** (`app/commande/page.tsx` → `POST /api/orders`): guest-only, COD-only,
  flat shipping hardcoded `8` DT, city from the 24-governorate list in
  `lib/site-config.ts`. Debounced draft auto-save posts `status: 'checkout-draft'`
  and reuses the same `orderId` (upsert semantics in `app/api/orders/route.ts`).
- **Auto-assignment** on create: sticky customer (same active employee who handled
  that phone/email within 30 days, looked up via Woo order search +
  `_mzem_employee_id`), else file-locked round-robin over active employees.
- **Employee scoping:** employees only see/edit orders where
  `assignedEmployeeId === session.userId`; status changes restricted to
  `ALLOWED_FOR_EMPLOYEE` = `pending, en-attente, processing, confirme, on-hold,
  tentative, completed, cancelled, annule`
  (`app/api/employee/orders/[id]/status/route.ts`).
- **Carriers:** Navex (`lib/navex.ts`), First Delivery (`lib/firstdelivery.ts`),
  Axess (`lib/axess.ts`). Auto-push on create/update when the delivery-company
  label matches `*_AUTO_PUSH_LABEL`; manual push from admin/employee routes;
  idempotency is in-memory only (`lib/delivery-idempotency.ts`) — does not survive
  restarts. Results written to order meta.

## 6. Auth (current)

- Signed cookie `mzali_session` = JSON `{role, userId, name}` + HMAC-SHA256
  (`SESSION_SECRET`), httpOnly, SameSite=Lax, 7 days (`lib/auth.ts`). Legacy
  `mzali_admin` cookie still accepted.
- Roles: `admin | employee` only. Login at `/admin-login` (username `admin` or an
  employee email) → `POST /api/auth`.
- Passwords: Node **scrypt** with per-record salt (employees + stored admin
  password). Not plaintext.

## 7. Money, i18n, SEO, caching

- **Money:** floats from `parseFloat` of Woo strings; `formatPrice` rounds to whole
  dinars → `"120 DT"`; currency TND, symbol DT, `decimals: 0`. No integer-minor
  units, no money utility.
- **i18n:** custom FR/AR dictionaries (`lib/i18n.ts`), cookie `mzali-lang`, RTL.
- **SEO:** static metadata in `app/layout.tsx` only. **No** `generateMetadata`, no
  JSON-LD, no sitemap, no canonicals. Static `public/robots.txt` (disallows
  `/admin`, `/admin-login`, `/api/`, `/employee` — note `/admin` is stale, the
  console lives at `/mzali`).
- **Caching:** `revalidate = 60` on shop/category/product pages, but the Woo client
  forces `cache: 'no-store'`, so every render hits WooCommerce. Root layout is
  `force-dynamic` (reads language cookie + file settings).

## 8. Feature inventory — what parity means

Present today (must survive migration unchanged): catalog browse/search/sort/
pagination, product page with options + bundle offers, cart (localStorage),
guest COD checkout with draft auto-save, thank-you page, admin dashboard KPIs,
order/product/category/employee management, order assignment, carrier pushes,
site-settings editing, admin password change, FR/AR + RTL.

**Not present today** (deferred or net-new per approved plan): customer accounts,
product reviews, coupons (being added as a new feature), email of any kind,
payment gateways beyond COD, stock movement history, audit logs, media library
UI, SEO metadata.

## 9. Security posture & known issues

1. `.env.local` on the dev machine contains **live secrets** (WC keys, WP app
   password, admin password, session secret, three carrier tokens). Verified
   never committed to git (all refs). **All must be rotated at cutover.**
2. `SESSION_SECRET` defaults to `'change-me'` when unset.
3. `next.config.mjs` allows images from any host (`hostname: '**'`) and
   `serverActions.allowedOrigins: ['*']`.
4. Carrier push idempotency is in-memory only.
5. `proxy.ts` middleware is not registered (mitigated by layout + route guards).
6. No rate limiting on login; no audit trail of staff actions.
7. Stock changes in Woo have no history/audit.

## 10. Verified-never-committed check

`git log --all` over `.env*` and `data/` plus `git ls-files` confirm no env file
or data-directory file has ever been tracked. `.gitignore` covers `.env`,
`.env.local`, `.env*.local`, `data/`.
