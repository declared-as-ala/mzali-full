import { categoryService } from '@/services';
import CategoriesView from '@/components/admin/CategoriesView';

export const dynamic = 'force-dynamic';

export default async function Categories() {
  const cats = await categoryService.list({ hideEmpty: false }).catch(() => []);
  return <CategoriesView initial={cats} />;
}
