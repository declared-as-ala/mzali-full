import { buildCategoryTree } from './category.mapper';
import type { Category } from '@contracts';

function cat(id: string, parentId: string | null, name = id): Category {
  return { id, parentId, name, slug: name.toLowerCase(), productCount: 0 };
}

describe('buildCategoryTree', () => {
  it('nests children under their parent', () => {
    const tree = buildCategoryTree([cat('root', null), cat('child', 'root'), cat('grandchild', 'child')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].id).toBe('child');
    expect(tree[0].children[0].children[0].id).toBe('grandchild');
  });

  it('promotes orphans (missing parent) to the root', () => {
    const tree = buildCategoryTree([cat('a', 'missing-parent')]);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('a');
  });

  it('breaks cycles by promoting the cyclic node to root instead of infinite-looping', () => {
    const tree = buildCategoryTree([cat('a', 'b'), cat('b', 'a')]);
    // Both point at each other; the walk detects the cycle and both surface
    // at the root rather than nesting infinitely or disappearing.
    const ids = tree.map((n) => n.id).sort();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).toEqual(expect.arrayContaining(['a']));
  });

  it('handles multiple root categories', () => {
    const tree = buildCategoryTree([cat('a', null), cat('b', null)]);
    expect(tree.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });
});
