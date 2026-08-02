# FIX — Product images not showing in admin/storefront + admin order list empty despite non-zero count

You are a senior full-stack engineer picking up mid-migration work on the
Mzali Boutique WooCommerce→NestJS/MongoDB/MinIO project. Repo root:
`c:\Users\Ala\Desktop\mzali full` (frontend Next.js at root, backend NestJS
in `backend/`). `COMMERCE_PROVIDER=mzali-api` is active in `.env.local` for
manual QA against a fully-migrated dev database (~32k real orders, 21
products, 9 categories, all migrated from the live WooCommerce store). Two
concrete bugs were found during manual QA and need fixing. Both are backend
bugs; no storefront route/slug/UI changes are needed — just correct data
and correct filtering.

Read `progress.md` at the repo root first for full context on what's been
built (TASK-01 through TASK-06 are done; this is a bugfix on top of TASK-06).

## Bug 1 — MinIO object keys are double-nested, so every migrated (and every
future admin-uploaded) image 404s

**Root cause** — `backend/src/media/media.service.ts`, method `upload()`:

```ts
const bucket = opts.bucket ?? DEFAULT_BUCKET;           // 'catalog'
const objectKey = `${bucket}/${randomUUID()}.${detected.ext}`;  // 'catalog/<uuid>.jpg'
await this.minio.putObject(bucket, objectKey, buffer, ...);
```

`minio.putObject(bucketName, objectName, ...)` already scopes the object
inside `bucketName`. Prefixing `objectKey` with the bucket name AGAIN means
the object is actually stored at path `catalog/catalog/<uuid>.jpg` **inside**
the `catalog` bucket — a redundant, unintended subfolder. This same
`objectKey` value is also used to build the public URL via
`toUploadResult()`:

```ts
const base = this.config.getOrThrow<string>('MINIO_PUBLIC_URL').replace(/\/$/, '');
return { id: doc.id, url: `${base}/${doc.objectKey}`, ... };
```

Since `doc.objectKey` is `catalog/<uuid>.jpg`, this produces
`http://host:9000/catalog/<uuid>.jpg` — which, per MinIO's path-style S3
addressing (`http://host:9000/<bucket>/<key>`), resolves to bucket=`catalog`,
key=`<uuid>.jpg` — but the object was actually stored at key
`catalog/<uuid>.jpg` (with the redundant subfolder). **The generated public
URL is therefore always wrong by exactly one `catalog/` (or `categories/`)
segment**, in the "too few segments" direction. This affects:
- `MediaService.upload()` itself — both the original file put and the
  `buildVariants()` thumb/md webp puts (same bug, see that private method).
- Every already-uploaded object in MinIO (admin uploads AND the 132 files
  migrated by `migrate:media`).
- Every `Product.images[].url` written by `migrate:products.command.ts`
  (which additionally re-derives the URL as
  `` `${mediaDoc.bucket}/${mediaDoc.objectKey}` `` — a SECOND, independent
  bug stacking a third `catalog/` segment on top; that specific line has
  already been fixed to use `${MINIO_PUBLIC_URL}/${mediaDoc.objectKey}`
  instead — do not re-break it, but it's still wrong until the underlying
  `objectKey` scheme below is fixed, because `objectKey` itself carries the
  spurious bucket prefix).

**The correct fix**: `objectKey` must NOT include the bucket name — it's
already implied by which bucket you call `putObject`/`presignedGetObject`
against. Fix in `backend/src/media/media.service.ts`:

```ts
// before
const objectKey = `${bucket}/${randomUUID()}.${detected.ext}`;
// after
const objectKey = `${randomUUID()}.${detected.ext}`;
```

Same fix needed in `buildVariants()` (the `-thumb.webp` / `-md.webp` object
keys currently also prefix `${bucket}/`).

Then fix URL construction (`toUploadResult()`) to include the bucket
explicitly, since objectKey no longer does:

```ts
return {
  id: doc.id,
  url: `${base}/${doc.bucket}/${doc.objectKey}`,
  variants: doc.variants.map((v) => ({ ..., url: `${base}/${doc.bucket}/${v.objectKey}` })),
};
```

Check `backend/src/migration/commands/migrate-products.command.ts` too —
it currently builds
`` `${minioPublicBase}/${mediaDoc.objectKey}` `` (no bucket segment). Once
`objectKey` no longer carries the bucket prefix, this line must become
`` `${minioPublicBase}/${mediaDoc.bucket}/${mediaDoc.objectKey}` `` to match
the corrected `toUploadResult()` convention.

### Data already in MongoDB/MinIO is inconsistent — you must reconcile it

Because this bug was discovered mid-QA, the **live dev database currently
has a MIX of URL shapes** across the 21 migrated products' `images[]`
arrays: some were manually patched via ad-hoc `mongosh` one-liners during
debugging (values may currently look like
`http://localhost:9000/catalog/<uuid>.jpg`, i.e. one `catalog/` segment —
still WRONG relative to the real object location, which has two), and the
underlying MinIO objects themselves are physically stored at
`catalog/catalog/<uuid>.jpg` / `catalog/catalog/<uuid>-thumb.webp` /
`catalog/catalog/<uuid>-md.webp` (verified via
`docker exec deploy-minio-1 mc ls local/catalog/catalog/` — confirmed
non-empty, real files are there).

Do NOT trust any existing `Media.objectKey` or `Product.images[].url` value
in the current dev database as ground truth. Recommended approach:

1. Apply the code fix above first.
2. Since `objectKey` values already in Mongo predate the fix (they still
   have the old `catalog/<uuid>.ext` shape) and the physical MinIO objects
   are at `catalog/catalog/<uuid>.ext`, you have two consistent options —
   pick ONE:
   - **(a) Re-run the migration cleanly**: wipe the `media` collection and
     the `catalog`/`categories` MinIO buckets (drop dev data — this is a
     throwaway dev DB, confirm with the user first per this project's "no
     destructive action without confirmation" rule, but it's the cleanest
     option), then re-run `migrate:media` and `migrate:products` for real
     against the live WooCommerce store (credentials are in
     `backend/.env` as `WOO_API_URL`/`WOO_CONSUMER_KEY`/`WOO_CONSUMER_SECRET`
     — read-only, safe). This guarantees `Media.objectKey`,
     `Media.bucket`, and the physical MinIO paths are all consistent under
     the new scheme.
   - **(b) Patch in place**: write a one-off script (or `mongosh` command)
     that (i) renames every object in MinIO from
     `<bucket>/<bucket>/<name>` down to `<bucket>/<name>` (mc supports
     `mc mv` or copy+remove), (ii) updates every `Media.objectKey` to strip
     the leading `<bucket>/` prefix, (iii) recomputes every
     `Product.images[].url` from the corrected `Media` docs. More fragile,
     only worth it if a full re-migration is undesirable for some reason.
3. **Verify**: fetch a product via
   `curl -H "X-Service-Token: $SERVICE_TOKEN" http://localhost:4000/api/v1/catalog/products/slug/djin`
   (or any real migrated product), take `images[0].url`, and confirm
   `curl -o /dev/null -w '%{http_code}\n' "<that url>"` returns `200`, not
   `404`. Then confirm the same product's image actually renders in the
   browser at `http://localhost:3000/produit/djin` and in the admin product
   list/drawer at `http://localhost:3000/mzali/produits`.
4. Also do a fresh admin image upload through the UI (`/mzali/produits` →
   create/edit a product → upload an image) and confirm THAT also renders
   correctly — this is the code path most future-relevant, since it's what
   every new product image will go through after this fix.

## Bug 2 — Admin order list shows a correct total count but an empty table

**Symptom** (see attached screenshot from `/mzali/commandes`): header says
"20460 commandes" but the table body renders "Aucune commande pour le
moment." This means the COUNT query succeeds but the LIST query returns
zero items.

**Root cause** — `app/mzali/commandes/page.tsx` (frontend, unchanged by
TASK-06, pre-existing legacy code) builds the main list query with a
**comma-separated multi-status string**:

```ts
const NORMAL_STATUSES = 'en-attente,confirme,annule,tentative';
...
queryStatus = status || NORMAL_STATUSES;   // 'en-attente,confirme,annule,tentative'
...
orderService.list({ ..., status: queryStatus as any, ... })
```

This relies on the backend treating `status` as an **OR-list** when it
contains commas. The WooCommerce REST API historically accepts this
loosely; the new NestJS backend does not. Confirm in
`backend/src/orders/orders.service.ts`, method `list()`:

```ts
if (query.status && query.status !== 'any') filter.status = query.status;
```

This does a MongoDB **exact-string-equality** match. Passing
`status=en-attente,confirme,annule,tentative` makes Mongo look for a
document whose `status` field literally equals the 4-statuses-joined string
— which no real order has — so the query correctly, silently returns zero
results. Meanwhile the SEPARATE per-status count queries the same page
issues (in a `Promise.all` loop, one request per individual status: `
en-attente`, `confirme`, etc.) each use a single valid status value and
therefore return correct non-zero counts. That's why the header total is
right and the table is empty — two different query shapes, only one of
which the backend supports.

**The fix**: make `backend/src/orders/orders.service.ts`'s `list()` treat a
comma-separated `status` value as a Mongo `$in` filter instead of an exact
match:

```ts
if (query.status && query.status !== 'any') {
  const statuses = query.status.split(',').map((s) => s.trim()).filter(Boolean);
  filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
}
```

Check whether `backend/src/orders/dto/order-list-query.dto.ts`'s `status`
field/validation needs updating too (it's currently typed as a plain
string — a comma-separated string is still a valid string, so likely no DTO
change needed, but verify `class-validator` isn't rejecting commas).

Also check `app/api/admin/customer-orders/route.ts` and any other frontend
route that might pass a comma-joined multi-status value through
`orderService.list()` — search the frontend for other `NORMAL_STATUSES`-style
constants (`grep -rn "en-attente,confirme" app/ components/`) to make sure
every caller benefits from this fix, not just the orders page.

**Verify**: reload `http://localhost:3000/mzali/commandes` and confirm the
table now populates with real orders matching the "Normal" tab's 4 statuses,
and that switching to the "Abandonnées" (checkout-draft) and "Supprimées"
(trash) tabs also populates correctly (those tabs use single-status queries
already and should already work, but confirm — they still route through the
same `orderService.list()` method).

## General verification gate (run after both fixes)

```bash
cd backend
npm run typecheck && npm run lint && npm test && npm run build
```

Then with the dev stack up (`docker compose -f deploy/docker-compose.yml -f
deploy/docker-compose.dev.yml up -d`, backend running via
`node dist/main.js`, frontend via `npm run dev` with
`COMMERCE_PROVIDER=mzali-api` / `NEXT_PUBLIC_COMMERCE_PROVIDER=mzali-api` in
`.env.local` — both already configured from the prior session):

- `/mzali/produits` — product list shows real thumbnails, not broken-image
  icons.
- `/produit/<any real slug>` — storefront product page shows real images in
  the gallery.
- `/mzali/commandes` — "Normal" tab table populates with real orders;
  numbers/customer/phone/total look sane; switching tabs and status filter
  dropdown works.
- Do a fresh image upload via the admin product editor and confirm it
  renders immediately (proves the `MediaService.upload()` fix works
  going forward, not just for migrated data).

## Do NOT

- Touch anything under `services/woo/*` or the WooCommerce provider path —
  this is a mzali-api-only bug (WooCommerce images/orders were never
  affected, they still come straight from `wp-content` URLs / Woo's own
  REST API).
- Change `MINIO_PUBLIC_URL`, bucket names, or the `catalog`/`categories`
  bucket-per-purpose convention — only the object-key-inside-a-bucket
  scheme is wrong.
- Silently drop the dev Mongo/MinIO data without flagging it to the user
  first if you choose remediation option (a) above (full re-migration) —
  confirm before running any destructive `docker compose down -v`,
  `db.dropDatabase()`, or `mc rm --recursive` command.
