import { getValidAccessToken } from '@/lib/api-auth';
import { apiRequest } from '@/services/mzali-api/client';
import CouponsView from '@/components/admin/CouponsView';
import type { Coupon } from '@/types/coupon';

export const dynamic = 'force-dynamic';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

export default async function CouponsPage() {
  if (PROVIDER !== 'mzali-api') {
    return (
      <div className="p-8">
        <h1 className="mb-4 text-3xl font-black">Codes promo</h1>
        <p className="rounded-xl bg-amber-50 p-4 text-amber-800">
          Les codes promo nécessitent le backend Mzali API (COMMERCE_PROVIDER=mzali-api).
        </p>
      </div>
    );
  }
  const bearer = await getValidAccessToken();
  const coupons = bearer ? await apiRequest<Coupon[]>('/admin/coupons', { bearer }).catch(() => []) : [];
  return <CouponsView initial={coupons} />;
}
