// Backend-only contract (not mirrored from frontend types/).
import type { EmployeeRole } from './auth';

export type EmployeeRecord = {
  id: string;
  email: string;
  name: string;
  role: EmployeeRole;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeCreateInput = {
  name: string;
  email: string;
  password: string;
  role?: EmployeeRole;
  active?: boolean;
};

export type EmployeeUpdateInput = {
  name?: string;
  email?: string;
  password?: string;
  role?: EmployeeRole;
  active?: boolean;
  mustChangePassword?: boolean;
};
