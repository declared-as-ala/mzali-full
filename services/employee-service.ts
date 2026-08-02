import type { Employee } from '@/lib/employee-storage';

// `role` is optional and ignored by the legacy file-based provider (which
// has no roles concept beyond admin/employee) — only the mzali-api
// provider acts on it. See backend/src/auth/permissions.ts for the values.
export type EmployeeInput = { name: string; email: string; password: string; active?: boolean; role?: string };
export type EmployeeUpdate = { name?: string; email?: string; active?: boolean; password?: string; role?: string };

export interface EmployeeService {
  list(): Promise<Employee[]>;
  get(id: string): Promise<Employee | null>;
  getByEmail(email: string): Promise<Employee | null>;
  verifyCredentials(email: string, password: string): Promise<Employee | null>;
  create(input: EmployeeInput): Promise<Employee>;
  update(id: string, patch: EmployeeUpdate): Promise<Employee>;
  remove(id: string): Promise<void>;
}

export type { Employee } from '@/lib/employee-storage';
