import 'server-only';
import { employeeStore } from '@/lib/employee-storage';
import type { Employee, EmployeeService, EmployeeInput, EmployeeUpdate } from '../employee-service';

export class FileEmployeeService implements EmployeeService {
  list(): Promise<Employee[]> { return employeeStore.list(); }
  get(id: string): Promise<Employee | null> { return employeeStore.get(id); }
  getByEmail(email: string): Promise<Employee | null> { return employeeStore.getByEmail(email); }
  verifyCredentials(email: string, password: string): Promise<Employee | null> {
    return employeeStore.verifyCredentials(email, password);
  }
  create(input: EmployeeInput): Promise<Employee> { return employeeStore.create(input); }
  update(id: string, patch: EmployeeUpdate): Promise<Employee> { return employeeStore.update(id, patch); }
  remove(id: string): Promise<void> { return employeeStore.delete(id); }
}
