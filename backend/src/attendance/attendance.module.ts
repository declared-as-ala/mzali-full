import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditModule } from '@/audit/audit.module';
import { AttendanceEmployee, AttendanceEmployeeSchema } from './attendance-employee.schema';
import { AttendanceSession, AttendanceSessionSchema } from './attendance-session.schema';
import { AttendanceService } from './attendance.service';
import { AttendanceEmployeesAdminController } from './attendance-employees-admin.controller';
import { AttendancePublicController } from './attendance-public.controller';

const AttendanceMongoose = MongooseModule.forFeature([
  { name: AttendanceEmployee.name, schema: AttendanceEmployeeSchema },
  { name: AttendanceSession.name, schema: AttendanceSessionSchema },
]);

/**
 * Fully isolated Pointage/payroll domain — no import of, or from,
 * `users/` or `auth/`'s Employee/RBAC beyond the JWT+PermissionsGuard
 * plumbing every admin controller in this codebase already uses. See
 * todo-pointage.md for the "isolated employee" decision this module
 * exists to honor.
 */
@Module({
  imports: [AttendanceMongoose, AuditModule],
  controllers: [AttendanceEmployeesAdminController, AttendancePublicController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
