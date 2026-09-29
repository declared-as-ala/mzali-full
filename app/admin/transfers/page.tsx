import { redirect } from 'next/navigation';

/** Depot <-> Boutique transfers are disabled (single inventory). */
export default function TransfersPage() {
  redirect('/admin/stock');
}
