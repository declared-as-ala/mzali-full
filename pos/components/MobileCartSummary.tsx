'use client';
import { ShoppingBag } from 'lucide-react';
import { formatMinor } from '@/lib/money';

export default function MobileCartSummary({
  itemCount,
  totalMinor,
  onClick,
}: {
  itemCount: number;
  totalMinor: number;
  onClick: () => void;
}) {
  if (itemCount === 0) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-between bg-emerald-600 text-white px-4 py-3 shadow-2xl border-t-2 border-emerald-700 active:bg-emerald-700 transition safe-bottom"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/20">
          <ShoppingBag size={16} />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold">
            {itemCount} article{itemCount > 1 ? 's' : ''}
          </p>
          <p className="text-[10px] text-emerald-100">Voir la commande</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xl font-black">{formatMinor(totalMinor)}</p>
      </div>
    </button>
  );
}
