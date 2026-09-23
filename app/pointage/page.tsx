import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import PointageKiosk from './PointageKiosk';

export const dynamic = 'force-dynamic';

/**
 * The physical kiosk lives on the main storefront domain (not the admin
 * subdomain — see middleware.ts, which rewrites a bare `/pointage` on
 * ADMIN_DOMAIN to `/admin/pointage`, a different page entirely). Gated to
 * an ADMIN session specifically (not 'employee') — an admin unlocks the
 * kiosk once on the shop's device, after which employees clock in/out
 * with just their PIN via PointageKiosk's own UI. See admin-login's
 * `fromOk` allowlist for the one-hop redirect back here after login.
 */
export default async function PointagePage() {
  const session = await getSession();
  if (session?.role !== 'admin') {
    redirect(`/admin-login?from=${encodeURIComponent('/pointage')}`);
  }
  return <PointageKiosk />;
}
