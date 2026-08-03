import type { Employee } from '@/lib/employee-storage';

// `role` stays optional for records created before role-based access was added.
// Both providers preserve it; see backend/src/auth/permissions.ts for values.
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
