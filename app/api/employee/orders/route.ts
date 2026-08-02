import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { orderService } from '@/services';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session || session.role !== 'employee') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('q') || undefined;

  const resultPromise = orderService.list({
    perPage: 100,
    status: (status && status !== 'any' ? status : undefined) as never,
    search,
    assignedEmployeeId: session.userId, // server-enforced scope
  });

  // If no status is requested, or it's 'any', fetch trash orders as well
  if (!status || status === 'any') {
    const trashPromise = orderService.list({
      perPage: 100,
      status: 'trash' as never,
      search,
      assignedEmployeeId: session.userId,
    });
    
    const [result, trashResult] = await Promise.all([resultPromise, trashPromise]);
    result.items = [...result.items, ...trashResult.items];
    return NextResponse.json(result);
  }

  const result = await resultPromise;
  return NextResponse.json(result);
}
