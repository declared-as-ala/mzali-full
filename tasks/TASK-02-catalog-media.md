# TASK 02 — Catalog + media (products, categories, MinIO)

You are a senior NestJS engineer on the Mzali migration. Repo root:
`c:\Users\Ala\Desktop\mzali full`. Backend: `backend/` (NestJS, Mongo,
millimes money — see `backend/src/common/money.ts`). TASK-01 must already
pass its gate. Do not modify the Next.js storefront.

## Read first

- `docs/current-system-audit.md` — what the storefront needs
- `types/product.ts`, `types/category.ts` — the EXACT response contract
- `services/product-service.ts`, `services/category-service.ts` — the
  interface the endpoints must be able to satisfy (list/getBySlug/getById/
  getRelated/create/update/remove/reorder; categories CRUD)
- `services/woo/woo-mappers.ts` — field-level semantics to replicate
  (effective price, onSale, bundle/options meta handling)

## Build

### 1. `backend/src/catalog/` — products + categories

**Product schema** (`products` collection): slug (unique), name, status
(`published|draft|private`), description, shortDescription, sku,
`regularPriceMinor`, `salePriceMinor` (null when not on sale), currency 'TND',
manageStock, images `[{mediaId?, url, alt, position}]`, categoryIds,
categorySlugs (denormalized), options `[{label, type: text|select|radio,
values: [string]}]` (note: frontend `ProductInput.options[].values` is a
comma-separated STRING — normalize to array on write, serialize back on read),
bundles `[{id, name, label, regularPriceMinor, priceMinor,
deliveryPriceMinor, quantity, badgeColor, imageUrl, isDefault}]`, upsellIds,
crossSellIds, costMinor, deliveryPriceMinor, deliveryCostMinor, menuOrder,
totalSales, featured, legacyId (unique sparse), timestamps.
Indexes: slug; {status, menuOrder}; {categoryIds, status, menuOrder};
text(name); {createdAt: -1}.

**Category schema** (`categories`): slug unique, name, parentId (null for
roots), description, imageUrl/mediaId, menuOrder, productCount (denormalized),
legacyId unique sparse. Prevent circular parents on update.

**Mapping to contract**: a `toProduct()` mapper returning the EXACT
`types/product.ts` shape — prices as float dinars via `toDinars()`,
`price` = effective price (sale ?? regular), `onSale`, `inStock` +
`stockQuantity` read from the inventory module when present (TASK-03) — until
then from a simple `stockQuantity` field on the product schema; keep
`attributes` mapped from options (name/options/variation=false) exactly as
`woo-mappers.ts` does; `meta` carries `cost`, `deliveryPrice`, `deliveryCost`.

**Endpoints** (`/api/v1`):
- Public (ServiceTokenGuard): `GET /catalog/products` (page, perPage, search,
  categorySlug, categoryId, orderBy `date|price|popularity|title|menu_order`
  [+accept `rating` mapped to date], order asc|desc, onSale, featured; status
  forced published), `GET /catalog/products/slug/:slug`,
  `GET /catalog/products/:id`, `GET /catalog/products/:id/related?limit=`,
  `GET /catalog/categories` (hideEmpty, parentId, perPage),
  `GET /catalog/categories/slug/:slug`, `GET /catalog/categories/tree`.
- Admin (JwtAuthGuard + permissions `products.*`/`categories.*`):
  `GET/POST /admin/products`, `GET/PUT/DELETE /admin/products/:id`,
  `POST /admin/products/reorder` (menuOrder batch),
  `GET /admin/products/picker` ({id,name,price,image} list),
  `GET/POST /admin/categories`, `PUT/DELETE /admin/categories/:id`.
  All writes audit-logged. Product delete = soft (status change to a
  `deletedAt` timestamp + excluded from all queries) when the product was ever
  ordered; hard delete allowed otherwise.

### 2. `backend/src/media/` — MinIO storage

- MinIO client provider from env config. Media schema (`media` collection):
  bucket, objectKey, mime, size, sha256 checksum (indexed for dedupe), width,
  height, alt, variants `[{name: thumb|md|webp, objectKey, width, height,
  size}]`, originalUrl (sparse index — legacy wp-content URL), createdBy.
- `POST /api/v1/admin/media` (multipart, permission `media.write`, 8 MB cap):
  validate MIME by magic bytes (jpeg/png/webp/gif), re-encode with sharp,
  generate `md` (max 1200px) and `thumb` (max 400px) webp variants, dedupe by
  checksum (return existing media doc), store objectKey NOT absolute URL,
  return `{ id, url, variants }` where url = `MINIO_PUBLIC_URL/bucket/key`.
- `GET /api/v1/admin/media` list with pagination + search by filename/alt.

### 3. Unit tests

- Product list query builder: every orderBy value maps to the right sort;
  search/category/onSale/featured filters compose; pagination clamps.
- toProduct mapper: millimes→dinars, onSale logic, options serialize
  round-trip (string ⇄ array), bundle mapping.
- Category tree builder (nesting + orphan safety).

## Verification gate

```bash
cd backend
npm run check:contracts && npm run typecheck && npm run lint && npm test
npm run build
# with dev compose up + API running + a seeded product (create via Swagger
# or curl with a super_admin token):
curl -H "X-Service-Token: $SERVICE_TOKEN" "http://localhost:4000/api/v1/catalog/products?perPage=5"
# → items match types/product.ts shape exactly (spot-check price/onSale/images)
```

## Do NOT

- Introduce a variants collection (options stay embedded — locked decision).
- Store absolute media URLs in Mongo (objectKey only; URL built at the edge).
- Touch the storefront or `types/*`.
