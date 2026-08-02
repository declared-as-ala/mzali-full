import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { productService } from '@/services';

/**
 * Read-only product details for employees.
 * They need this so the order drawer can populate the bundle dropdown
 * and the per-variation attribute selects when editing a line.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || (session.role !== 'employee' && session.role !== 'admin')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const p = await productService.getById(id);
  return p ? NextResponse.json(p) : NextResponse.json({ error: 'not found' }, { status: 404 });
}
