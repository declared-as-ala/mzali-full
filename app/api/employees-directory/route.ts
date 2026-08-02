import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { employeeService } from '@/services';
import { apiRequest } from '@/services/mzali-api/client';
import { getValidAccessToken } from '@/lib/api-auth';

const PROVIDER = process.env.COMMERCE_PROVIDER ?? 'woocommerce';

/**
 * Minimal employee directory (id → name) usable by any authenticated user.
 * Returned data has no sensitive fields — names only, for UI labels.
 *
 * mzali-api: calls the backend's lighter /employees/directory endpoint
 * directly (JwtAuthGuard only, no permission requirement) instead of going
 * through employeeService.list() — that method hits /admin/employees, which
 * needs the employees.read permission an employee-role session doesn't have.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  if (PROVIDER === 'mzali-api') {
    const bearer = await getValidAccessToken();
    if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const directory = await apiRequest<{ id: string; name: string; active: boolean }[]>('/employees/directory', { bearer });
    return NextResponse.json(directory);
  }

  const employees = await employeeService.list();
  return NextResponse.json(employees.map((e) => ({ id: e.id, name: e.name, active: e.active })));
}
