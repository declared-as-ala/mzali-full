import type { Category as CategoryContract } from '@contracts';
import { normalizePublicMediaUrl } from '@/common/public-media-url';
import { Category as CategorySchema } from './category.schema';

export function toCategoryContract(doc: CategorySchema & { id?: string; _id?: unknown }): CategoryContract {
  return {
    id: String(doc.id ?? doc._id),
    parentId: doc.parentId ?? null,
    name: doc.name,
    slug: doc.slug,
    description: doc.description || undefined,
    imageUrl: doc.imageUrl ? normalizePublicMediaUrl(doc.imageUrl) : undefined,
    productCount: doc.productCount ?? 0,
  };
}

export type CategoryTreeNode = CategoryContract & { children: CategoryTreeNode[] };

/**
 * Builds a nested tree from a flat category list. Orphans (parentId points
 * at a missing category, or a cycle) are attached at the root instead of
 * being silently dropped.
 */
export function buildCategoryTree(categories: CategoryContract[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const c of categories) byId.set(c.id, { ...c, children: [] });

  const roots: CategoryTreeNode[] = [];

  for (const node of byId.values()) {
    if (!node.parentId || !byId.has(node.parentId) || wouldCycle(node.id, node.parentId, byId)) {
      roots.push(node);
      continue;
    }
    byId.get(node.parentId)!.children.push(node);
  }
  return roots;
}

function wouldCycle(id: string, parentId: string, byId: Map<string, CategoryTreeNode>): boolean {
  let current: string | null = parentId;
  const visited = new Set<string>([id]);
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}
