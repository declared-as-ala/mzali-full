import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '@/orders/order.schema';
import { DirectoryController } from './directory.controller';
import { EmployeesController } from './employees.controller';
import { UsersService } from './users.service';

/**
 * Employee schema is registered by the global AuthModule. Order schema is
 * registered directly here (not via OrdersModule, which pulls in
 * JwtAuthGuard/AuthModule-dependent controllers) so UsersService can
 * unassign a deleted employee's orders without a circular module import.
 */
@Module({
  imports: [MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }])],
  controllers: [EmployeesController, DirectoryController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
