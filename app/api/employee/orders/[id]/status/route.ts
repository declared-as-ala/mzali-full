import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { orderService } from '@/services';

const ALLOWED_FOR_EMPLOYEE = new Set([
  'pending', 'en-attente',
  'processing', 'confirme',
  'on-hold', 'tentative',
  'completed',
  'cancelled', 'annule',
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const order = await orderService.getById(id);
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (order.assignedEmployeeId !== session.userId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { status } = await req.json();
  if (!status || typeof status !== 'string' || !ALLOWED_FOR_EMPLOYEE.has(status)) {
    return NextResponse.json({ error: 'Statut non autorisé' }, { status: 400 });
  }
  try {
    const updated = await orderService.update(id, { status });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 });
  }
}
