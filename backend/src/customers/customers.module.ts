import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomersAdminController } from './customers-admin.controller';
import { Customer, CustomerSchema } from './customer.schema';
import { CustomersService } from './customers.service';

const CustomerMongoose = MongooseModule.forFeature([{ name: Customer.name, schema: CustomerSchema }]);

@Module({
  imports: [CustomerMongoose],
  controllers: [CustomersAdminController],
  providers: [CustomersService],
  exports: [CustomersService, CustomerMongoose],
})
export class CustomersModule {}
