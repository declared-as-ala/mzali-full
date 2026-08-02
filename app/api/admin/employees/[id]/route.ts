import { NextResponse } from 'next/server';
import { isAdmin, currentUserId } from '@/lib/auth';
import { employeeService } from '@/services';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { id } = await params;
  const e = await employeeService.get(id);
  return e ? NextResponse.json(e) : NextResponse.json({ error: 'not found' }, { status: 404 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;
    const body = await req.json();
    
    // Prevent self-deactivation
    if (body.active === false) {
      const currentId = await currentUserId();
      if (id === currentId) {
        return NextResponse.json({ error: 'Vous ne pouvez pas désactiver votre propre compte.' }, { status: 400 });
      }
    }

    const e = await employeeService.update(id, {
      name: body.name,
      email: body.email,
      active: body.active,
      password: body.password,
      role: body.role,
    });
    return NextResponse.json(e);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'update failed' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const { id } = await params;

    // Prevent self-deletion
    const currentId = await currentUserId();
    if (id === currentId) {
      return NextResponse.json({ error: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 });
    }

    await employeeService.remove(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 400 });
  }
}
