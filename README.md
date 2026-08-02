# Mzali Next.js Storefront + Admin

Custom Next.js 14 storefront and admin console for **Ahmed Mzali Boutique**.
Reads/writes WooCommerce on `ahmedmzaliboutique.com` via REST API.
Includes Navex (Nourexpress) shipment integration.

## Stack
- Next.js 14 (App Router)
- TypeScript + Tailwind CSS
- Zustand (cart)
- WooCommerce REST API v3
- Navex REST API

## One-command Docker stack

The root [`docker-compose.yml`](./docker-compose.yml) runs the complete local
platform: storefront, NestJS API, BullMQ worker, MongoDB replica set, Redis,
MinIO, and bucket initialization.

The existing `.env.local` and `backend/.env` files provide configuration and
must remain gitignored. On a fresh checkout, create them from `.env.example`
and `backend/.env.example`, then keep `MZALI_SERVICE_TOKEN` equal to the
backend `SERVICE_TOKEN` and use the same `JWT_ACCESS_SECRET` in both files.

```bash
docker compose up --build
```

Use `-d` to run in the background. Once healthy:

- Storefront/admin: <http://localhost:3000>
- API health: <http://localhost:4000/health/ready>
- MinIO API: <http://localhost:9000>
- MinIO console: <http://localhost:9001>

Useful commands:

```bash
docker compose ps
docker compose logs -f storefront api worker
docker compose down          # preserves Mongo/Redis/MinIO named volumes
```

Do not add `-v` to `docker compose down` unless you intentionally want to
delete the local database, queues, and uploaded media.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in the keys
npm run dev
```

Open <http://localhost:3000>.

Admin: <http://localhost:3000/admin> (will redirect to `/admin-login`, password = `ADMIN_PASSWORD` from `.env.local`).

## Required env vars (`.env.local`)

| Variable | Where to get it |
| --- | --- |
| `WC_API_URL` | Your WordPress URL (e.g. `https://ahmedmzaliboutique.com`) |
| `WC_CONSUMER_KEY` / `WC_CONSUMER_SECRET` | WP Admin → WooCommerce → Settings → Advanced → REST API → Add key (Read/Write) |
| `NAVEX_API_BASE` / `NAVEX_API_TOKEN` | Navex dashboard → Settings → API |
| `ADMIN_PASSWORD` | Anything strong — used to log into `/admin` |
| `SESSION_SECRET` | A long random string |

## Deploy to Hostinger Node.js

> Hostinger Business / Cloud plans expose **Node.js** in hPanel.

1. **Build locally**:
   ```bash
   npm run build
   ```
   This produces `.next/` and a `node_modules/` tree.

2. **Upload via File Manager** (or SFTP) to `domains/ahmedmzaliboutique.com/public_html/app/`:
   - `.next/`, `node_modules/`, `package.json`, `next.config.mjs`, `public/`, `app/`, `components/`, `lib/`, `middleware.ts`

3. **hPanel → Advanced → Node.js**:
   - **Application root**: `public_html/app`
   - **Application URL**: `https://ahmedmzaliboutique.com/` (or a subdomain)
   - **Startup file**: `node_modules/next/dist/bin/next` with args `start -p 3000`
   - Or simpler — set startup script to `npm` with command `start`
   - **Environment variables**: paste all vars from `.env.local`
   - Click **Start**.

4. **Edit `.htaccess`** in `public_html/` to proxy all WordPress-conflicting routes to Node. Since you said you hate WordPress, the cleanest path is to **move WordPress to a subdomain** like `wp.ahmedmzaliboutique.com`, then point the root domain at this Next.js app.

   Tell Hostinger support to redirect `ahmedmzaliboutique.com` to the Node.js app and put the WordPress installation behind `wp.ahmedmzaliboutique.com`. The REST API stays at `https://wp.ahmedmzaliboutique.com/wp-json/wc/v3` — update `WC_API_URL` accordingly.

## Deploy to Vercel (recommended if Hostinger Node.js is flaky)

```bash
npm install -g vercel
vercel
```

Add env vars in the Vercel dashboard. Point your Hostinger DNS `A` record for `ahmedmzaliboutique.com` to Vercel.

## Pages

| URL | What it does |
| --- | --- |
| `/` | Home — hero + nouveautés + categories |
| `/categorie/[slug]` | Category listing |
| `/produit/[slug]` | Product page (gallery, attributes, add to cart) |
| `/panier` | Cart (localStorage-persisted) |
| `/commande` | COD checkout — creates real WooCommerce order |
| `/merci` | Thank-you page |
| `/admin` | Dashboard (KPIs, status mix, top products) |
| `/admin/commandes` | Orders list — soon: drawer editor |
| `/admin/produits` | Products list — soon: drawer editor |
| `/admin/categories` | Categories CRUD |

## Sending an order to Navex
From an order row in `/admin/commandes`, hit `POST /api/navex` with `{ orderId }`. The API creates the shipment and stores the tracking number on the WooCommerce order meta (`_navex_tracking`).
