import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/**
 * Validated at startup by ConfigModule — the app refuses to boot with
 * missing/invalid required configuration. Optional groups (carriers, Woo
 * migration source) only become required by the features that use them.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  // MongoDB — must be a replica-set member (transactions are required)
  MONGODB_URI: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // MinIO
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: bool.default('false'),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  /** Public base URL media objects are served from (reverse proxy / CDN). */
  MINIO_PUBLIC_URL: z.string().url(),

  // Auth
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(3650),
  /** Shared secret for server-to-server calls from the Next BFF. */
  SERVICE_TOKEN: z.string().min(32, 'SERVICE_TOKEN must be at least 32 characters'),

  // Commerce behavior
  STRICT_STOCK: bool.default('false'),

  /** Internal (Docker-network) base URL of the storefront, used by the
   *  worker to call its on-demand revalidation route when stock crosses
   *  the sold-out boundary. Not exposed publicly. */
  STOREFRONT_URL: z.string().default('http://storefront:3000'),

  // Swagger (always off unless explicitly enabled; never expose publicly in prod)
  SWAGGER_ENABLED: bool.default('false'),

  // Carrier integrations (optional — features degrade to "not configured")
  NAVEX_API_BASE: z.string().optional(),
  NAVEX_TOKEN_ADD: z.string().optional(),
  NAVEX_TOKEN_GET: z.string().optional(),
  NAVEX_TOKEN_DELETE: z.string().optional(),
  NAVEX_AUTO_PUSH_LABEL: z.string().default('navex'),
  FIRST_DELIVERY_API_BASE: z.string().optional(),
  FIRST_DELIVERY_TOKEN: z.string().optional(),
  FIRST_DELIVERY_AUTO_PUSH_LABEL: z.string().default('firstdelivery'),
  AXESS_API_BASE: z.string().optional(),
  AXESS_TOKEN: z.string().optional(),
  AXESS_ENTREPOT_ID: z.string().optional(),
  AXESS_SOURCE_NOM: z.string().optional(),
  AXESS_SOURCE_TEL: z.string().optional(),
  AXESS_SOURCE_ADDRESS: z.string().optional(),
  AXESS_SOURCE_GOV: z.string().optional(),
  AXESS_SOURCE_DELEGATION: z.string().optional(),
  AXESS_SOURCE_LOCALITE: z.string().optional(),

  // WooCommerce migration source (read-only; required only by migration commands)
  WOO_API_URL: z.string().optional(),
  WOO_CONSUMER_KEY: z.string().optional(),
  WOO_CONSUMER_SECRET: z.string().optional(),
  /** Path to the legacy storefront's data/ directory (employees.json, admin.json,
   *  site-settings.json). Defaults to ../data relative to the backend/ working dir,
   *  i.e. <repo-root>/data when the backend runs from <repo-root>/backend. */
  LEGACY_DATA_DIR: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return parsed.data;
}
