import type { Employee } from '@/lib/employee-storage';
import type { EmployeeInput, EmployeeService, EmployeeUpdate } from '../employee-service';
import { apiRequest } from './client';
import { getValidAccessToken } from '@/lib/api-auth';

type BackendEmployeeRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toEmployee(r: BackendEmployeeRecord): Employee {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    active: r.active,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class MzaliApiEmployeeService implements EmployeeService {
  async list(): Promise<Employee[]> {
    const bearer = await getValidAccessToken();
    const records = await apiRequest<BackendEmployeeRecord[]>('/admin/employees', { bearer: bearer ?? undefined });
    return records.map(toEmployee);
  }

  async get(id: string): Promise<Employee | null> {
    const bearer = await getValidAccessToken();
    try {
      const r = await apiRequest<BackendEmployeeRecord>(`/admin/employees/${id}`, { bearer: bearer ?? undefined });
      return toEmployee(r);
    } catch {
      return null;
    }
  }

  async getByEmail(email: string): Promise<Employee | null> {
    const all = await this.list();
    const norm = email.trim().toLowerCase();
    return all.find((e) => e.email.toLowerCase() === norm) ?? null;
  }

  /** Kept for interface completeness; app/api/auth/route.ts calls the backend
   *  /auth/login endpoint directly for the mzali-api provider (it needs the
   *  real tokens, which this Employee-shaped return can't carry). */
  async verifyCredentials(email: string, password: string): Promise<Employee | null> {
    try {
      const result = await apiRequest<{ user: BackendEmployeeRecord & { role: string } }>('/auth/login', {
        method: 'POST',
        body: { username: email, password },
      });
      return toEmployee(result.user);
    } catch {
      return null;
    }
  }

  async create(input: EmployeeInput): Promise<Employee> {
    const bearer = await getValidAccessToken();
    const r = await apiRequest<BackendEmployeeRecord>('/admin/employees', {
      method: 'POST',
      bearer: bearer ?? undefined,
      body: { name: input.name, email: input.email, password: input.password, active: input.active, role: input.role },
    });
    return toEmployee(r);
  }

  async update(id: string, patch: EmployeeUpdate): Promise<Employee> {
    const bearer = await getValidAccessToken();
    const r = await apiRequest<BackendEmployeeRecord>(`/admin/employees/${id}`, {
      method: 'PATCH',
      bearer: bearer ?? undefined,
      body: patch,
    });
    return toEmployee(r);
  }

  async remove(id: string): Promise<void> {
    const bearer = await getValidAccessToken();
    await apiRequest(`/admin/employees/${id}`, { method: 'DELETE', bearer: bearer ?? undefined });
  }
}
