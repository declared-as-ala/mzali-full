export type Paginated<T> = {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
};

export function paginate<T>(items: T[], total: number, page: number, perPage: number): Paginated<T> {
  return {
    items,
    total,
    totalPages: perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1,
    page,
  };
}

export function clampPagination(page?: number, perPage?: number, maxPerPage = 100) {
  const p = Math.max(1, Math.floor(page ?? 1));
  const pp = Math.min(maxPerPage, Math.max(1, Math.floor(perPage ?? 20)));
  return { page: p, perPage: pp, skip: (p - 1) * pp };
}
