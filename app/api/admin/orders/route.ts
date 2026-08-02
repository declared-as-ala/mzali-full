import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { orderService } from '@/services';

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json();
    const order = await orderService.create(body);
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'create failed' }, { status: 500 });
  }
}
