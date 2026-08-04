import { Module } from '@nestjs/common';
import { DirectoryController } from './directory.controller';
import { EmployeesController } from './employees.controller';
import { UsersService } from './users.service';

/** Employee schema is registered by the global AuthModule. */
@Module({
  controllers: [EmployeesController, DirectoryController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
