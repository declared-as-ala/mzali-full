export type Category = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  productCount: number;
};

export type CategoryListQuery = {
  hideEmpty?: boolean;
  parentId?: string | null;
  perPage?: number;
};
