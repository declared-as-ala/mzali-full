'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem } from '@/types';

type AddInput = Omit<CartItem, 'lineId'> & { lineId?: string };

type CartState = {
  items: CartItem[];
  add: (item: AddInput) => void;
  setQty: (lineId: string, qty: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
};

function newId(): string {
  // RFC 4122-ish; falls back to Math.random when crypto is unavailable.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sameLine(a: CartItem, b: AddInput): boolean {
  if (a.productId !== b.productId) return false;
  if ((a.bundleId ?? '') !== (b.bundleId ?? '')) return false;
  if ((a.bundleSlot ?? null) !== (b.bundleSlot ?? null)) return false;
  return JSON.stringify(a.variation ?? null) === JSON.stringify(b.variation ?? null);
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (input) => {
        const items = get().items.slice();
        // For non-bundled lines: collapse identical lines (same product + variation) into one.
        const i = items.findIndex((x) => sameLine(x, input));
        if (i >= 0 && input.bundleSlot === undefined) {
          items[i] = { ...items[i], qty: items[i].qty + input.qty };
        } else {
          items.push({ ...input, lineId: input.lineId ?? newId() });
        }
        set({ items });
      },
      setQty: (lineId, qty) =>
        set({ items: get().items.map((x) => (x.lineId === lineId ? { ...x, qty: Math.max(1, qty) } : x)) }),
      remove: (lineId) => set({ items: get().items.filter((x) => x.lineId !== lineId) }),
      clear: () => set({ items: [] }),
    }),
    { name: 'mzali-cart' },
  ),
);

export function selectSubtotal(items: CartItem[]): number {
  return items.reduce((s, x) => s + x.price * x.qty, 0);
}
export function selectCount(items: CartItem[]): number {
  return items.reduce((s, x) => s + x.qty, 0);
}
