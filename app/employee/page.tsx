import Link from 'next/link';
import { ShoppingCart, Clock, CheckCircle2, Package } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { orderService } from '@/services';
import { formatPrice } from '@/lib/site-config';

export const dynamic = 'force-dynamic';

const ACTIVE = ['pending', 'en-attente', 'processing', 'confirme', 'on-hold', 'tentative'];
const DONE = ['completed'];
const CANCELLED = ['cancelled', 'annule', 'refunded', 'failed'];

export default async function EmployeeDashboard() {
  const session = await getSession();
  if (!session || session.role !== 'employee') return null; // layout already redirected

  const result = await orderService.list({
    perPage: 100,
    assignedEmployeeId: session.userId,
  }).catch(() => ({ items: [], total: 0, totalPages: 0, page: 1 }));

  const items = result.items;
  const pending = items.filter((o) => ['pending', 'en-attente', 'on-hold', 'tentative'].includes(String(o.status))).length;
  const inProgress = items.filter((o) => ['processing', 'confirme'].includes(String(o.status))).length;
  const completed = items.filter((o) => DONE.includes(String(o.status))).length;
  const cancelled = items.filter((o) => CANCELLED.includes(String(o.status))).length;

  const cards = [
    { label: 'En attente', value: pending, icon: Clock, color: 'from-amber-500 to-orange-600' },
    { label: 'En cours', value: inProgress, icon: Package, color: 'from-blue-500 to-blue-700' },
    { label: 'Terminées', value: completed, icon: CheckCircle2, color: 'from-emerald-500 to-emerald-700' },
    { label: 'Annulées', value: cancelled, icon: ShoppingCart, color: 'from-rose-500 to-pink-600' },
  ];

  return (
    <div className="p-8">
      <header className="mb-8">
        <p className="text-sm font-bold uppercase tracking-widest text-brand-500">Espace employé</p>
        <h1 className="text-3xl font-black">Bonjour, {session.name}</h1>
        <p className="text-ink-700">Voici vos commandes assignées</p>
      </header>

      <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((k) => (
          <div key={k.label} className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${k.color} p-6 text-white shadow-card`}>
            <k.icon size={28} className="opacity-30" />
            <p className="mt-4 text-3xl font-black">{k.value}</p>
            <p className="text-sm opacity-90">{k.label}</p>
          </div>
        ))}
      </div>

      <section className="card p-6">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-black">Dernières commandes</h2>
          <Link href="/employee/commandes" className="text-sm font-bold text-brand-500 hover:underline">
            Voir tout →
          </Link>
        </header>
        <ul className="space-y-2">
          {items.slice(0, 6).map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded-xl bg-ink-100 px-4 py-3">
              <div>
                <p className="font-bold">#{o.number}</p>
                <p className="text-xs text-ink-700">{o.customer.firstName} · {new Date(o.createdAt).toLocaleDateString('fr-FR')}</p>
              </div>
              <span className="font-black text-brand-500">{formatPrice(o.total)}</span>
            </li>
          ))}
          {!items.length && <li className="p-4 text-center text-ink-700">Aucune commande assignée pour l&apos;instant.</li>}
        </ul>
      </section>
    </div>
  );
}
