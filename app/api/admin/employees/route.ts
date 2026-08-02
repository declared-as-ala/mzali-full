import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { employeeService, orderService } from '@/services';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const employees = await employeeService.list();

  // Count active assigned orders per employee (single WC fetch, then group)
  const counts: Record<string, number> = {};
  try {
    const ACTIVE = 'pending,en-attente,on-hold,processing,confirme,tentative';
    const res = await orderService.list({ perPage: 100, status: ACTIVE as never });
    for (const o of res.items) {
      const id = o.assignedEmployeeId;
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }
  } catch { /* leave counts at 0 */ }

  return NextResponse.json(
    employees.map((e) => ({ ...e, activeOrdersCount: counts[e.id] ?? 0 })),
  );
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const employee = await employeeService.create({
      name: String(body.name ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      active: body.active === false ? false : true,
      role: body.role ? String(body.role) : undefined,
    });
    return NextResponse.json(employee, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 400 });
  }
}
