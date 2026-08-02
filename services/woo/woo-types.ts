// Raw WooCommerce shapes — kept ISOLATED inside /services/woo.
// Never re-exported outside this folder.
export type WooImage = { id: number; src: string; alt: string };

export type WooCategoryRaw = {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
  parent: number;
  image: WooImage | null;
};

export type WooProductRaw = {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  status: 'publish' | 'draft' | 'private';
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  stock_quantity: number | null;
  images: WooImage[];
  categories: { id: number; name: string; slug: string }[];
  attributes: { id: number; name: string; options: string[]; variation: boolean }[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  meta_data: { id: number; key: string; value: unknown }[];
};

export type WooOrderRaw = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  date_created: string;
  billing: {
    first_name: string; last_name: string; phone: string; email: string;
    address_1: string; address_2: string; city: string; state: string; postcode: string; country: string;
  };
  shipping: WooOrderRaw['billing'];
  line_items: { id: number; product_id: number; name: string; quantity: number; price: string; total: string; image?: { id: number; src: string }; meta_data?: { id?: number; key: string; value: unknown; display_key?: string; display_value?: string }[] }[];
  shipping_lines?: { id?: number; method_id: string; method_title: string; total: string }[];
  meta_data: { id: number; key: string; value: unknown }[];
};
