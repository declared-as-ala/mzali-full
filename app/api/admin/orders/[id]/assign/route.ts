import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { employeeService, orderService } from '@/services';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    const employeeId = body?.employeeId ?? null;

    if (employeeId !== null) {
      const target = await employeeService.get(String(employeeId));
      if (!target) return NextResponse.json({ error: 'Employé introuvable' }, { status: 400 });
      if (!target.active) return NextResponse.json({ error: 'Employé inactif' }, { status: 400 });
    }
    const order = await orderService.assignEmployee(id, employeeId, 'admin');
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'assign failed' }, { status: 500 });
  }
}
