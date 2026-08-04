import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { employeeService } from '@/services';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const employees = await employeeService.list();
  return NextResponse.json(employees);
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
