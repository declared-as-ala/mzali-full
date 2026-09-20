import StockMovementHistory from '@/components/admin/StockMovementHistory';
export default function Page({ searchParams }: { searchParams: { variantId?: string; locationId?: string } }) { return <StockMovementHistory variantId={searchParams.variantId} initialLocation={searchParams.locationId} />; }
