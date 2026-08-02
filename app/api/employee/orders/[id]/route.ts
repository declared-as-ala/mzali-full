import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { orderService } from '@/services';

async function requireOwnOrder(id: string, sessionUserId: string) {
  const order = await orderService.getById(id);
  if (!order) return { error: NextResponse.json({ error: 'not found' }, { status: 404 }) };
  if (order.assignedEmployeeId !== sessionUserId) {
    return { error: NextResponse.json({ error: 'forbidden' }, { status: 403 }) };
  }
  return { order };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const guard = await requireOwnOrder(id, session.userId);
  if (guard.error) return guard.error;
  return NextResponse.json(guard.order);
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const guard = await requireOwnOrder(id, session.userId);
  if (guard.error) return guard.error;
  try {
    const body = await req.json();
    // Reject any field that would change ownership — server-enforced safety.
    delete body.assignedEmployeeId;
    delete body.assignedAt;
    const updated = await orderService.update(id, body);
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const guard = await requireOwnOrder(id, session.userId);
  if (guard.error) return guard.error;
  try {
    await orderService.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'delete failed';
    if (/\b404\b/.test(msg) || /invalid_id/i.test(msg)) {
      return NextResponse.json({ ok: true, alreadyDeleted: true });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
