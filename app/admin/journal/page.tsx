import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import JournalView from '@/components/admin/JournalView';
import type { AuditLogEntry } from '@/types/audit';

export const dynamic = 'force-dynamic';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export default async function JournalPage() {
  if (PROVIDER !== 'mzali-api') {
    return (
      <div className="p-8">
        <h1 className="mb-4 text-3xl font-black">Journal</h1>
        <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
          Le journal d&apos;audit nécessite le backend Mzali API (COMMERCE_PROVIDER=mzali-api).
        </p>
      </div>
    );
  }
  const bearer = await getValidAccessToken();
  const data = bearer
    ? await apiRequest<{ items: AuditLogEntry[]; total: number }>('/admin/audit-logs', { bearer, query: { perPage: 50 } }).catch(() => ({ items: [], total: 0 }))
    : { items: [], total: 0 };
  return <JournalView initial={data.items} />;
}
