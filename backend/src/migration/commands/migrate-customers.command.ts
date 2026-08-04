import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from '@/customers/customer.schema';
import { Order } from '@/orders/order.schema';
import { normalizePhone } from '@/common/phone';
import { writeReport } from '../report-writer';

type Options = { dryRun?: boolean };

@Command({ name: 'migrate:customers', description: 'Derive guest customer records from migrated orders' })
export class MigrateCustomersCommand extends CommandRunner {
  constructor(
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = { customersCreated: 0, customersUpdated: 0, ordersWithoutPhone: 0 };

    const orders = await this.orders.find().sort({ createdAt: 1 });
    const byPhone = new Map<string, typeof orders>();
    for (const order of orders) {
      const phone = normalizePhone(order.customer.phone);
      if (!phone) {
        report.ordersWithoutPhone += 1;
        continue;
      }
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone)!.push(order);
    }

    for (const [phone, custOrders] of byPhone) {
      if (options.dryRun) {
        const exists = await this.customers.exists({ phone });
        if (exists) report.customersUpdated += 1;
        else report.customersCreated += 1;
        continue;
      }

      const last = custOrders[custOrders.length - 1];
      const totalSpentMinor = custOrders.reduce((s, o) => s + (o.manualTotalMinor ?? o.totalMinor), 0);

      const existed = await this.customers.exists({ phone });
      await this.customers.findOneAndUpdate(
        { phone },
        {
          $set: {
            firstName: last.customer.firstName,
            lastName: last.customer.lastName,
            email: last.customer.email || null,
            city: last.customer.city,
            address: last.customer.address,
            ordersCount: custOrders.length,
            totalSpentMinor,
            firstOrderAt: custOrders[0].createdAt,
            lastOrderAt: last.createdAt,
          },
        },
        { upsert: true },
      );
      if (existed) report.customersUpdated += 1;
      else report.customersCreated += 1;
      // Backfill customerId on the orders now that the customer exists.
      const customerDoc = await this.customers.findOne({ phone }).select({ _id: 1 });
      if (customerDoc) {
        await this.orders.updateMany(
          { _id: { $in: custOrders.map((o) => o._id) } },
          { $set: { customerId: customerDoc.id } },
        );
      }
    }

    const path = await writeReport('migrate-customers', { options, report });
    console.log(`migrate:customers — created=${report.customersCreated} updated=${report.customersUpdated} ordersWithoutPhone=${report.ordersWithoutPhone}`);
    console.log(`Report: ${path}`);
  }
}
