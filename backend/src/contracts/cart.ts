export type CartItem = {
  lineId: string;     // unique per cart line — required so bundle slots stay separate
  productId: string;
  name: string;
  price: number;      // unit price actually paid (may include bundle discount)
  qty: number;
  image: string;
  variation?: Record<string, string>;       // single-item variation
  bundleItems?: Record<string, string>[];   // legacy — when stored as one line with N sub-items
  bundleId?: string;
  bundleName?: string;
  bundleSlot?: number;                      // 1-based slot index when a bundle is split into multiple lines
  meta?: Record<string, unknown>;
};

export type Cart = {
  items: CartItem[];
  subtotal: number;
  itemCount: number;
};
