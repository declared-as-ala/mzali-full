import { Command, CommandRunner, Option } from 'nest-commander';
import { MigrateCategoriesCommand } from './migrate-categories.command';
import { MigrateCustomersCommand } from './migrate-customers.command';
import { MigrateEmployeesCommand } from './migrate-employees.command';
import { MigrateMediaCommand } from './migrate-media.command';
import { MigrateOrdersCommand } from './migrate-orders.command';
import { MigrateProductsCommand } from './migrate-products.command';
import { MigrateSettingsCommand } from './migrate-settings.command';

type Options = { dryRun?: boolean; since?: string; limit?: number };

@Command({ name: 'migrate:all', description: 'Run the full migration pipeline in order' })
export class MigrateAllCommand extends CommandRunner {
  constructor(
    private readonly categories: MigrateCategoriesCommand,
    private readonly media: MigrateMediaCommand,
    private readonly products: MigrateProductsCommand,
    private readonly employees: MigrateEmployeesCommand,
    private readonly orders: MigrateOrdersCommand,
    private readonly customers: MigrateCustomersCommand,
    private readonly settings: MigrateSettingsCommand,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }
  @Option({ flags: '--since <iso>', description: 'Only entities modified since this ISO timestamp' })
  parseSince(val: string): string {
    return val;
  }
  @Option({ flags: '--limit <n>', description: 'Stop each step after this many source records' })
  parseLimit(val: string): number {
    return Number(val);
  }

  async run(params: string[], options: Options): Promise<void> {
    console.log('=== migrate:all — step 1/7 categories ===');
    await this.categories.run(params, options);
    console.log('=== migrate:all — step 2/7 media ===');
    await this.media.run(params, options);
    console.log('=== migrate:all — step 3/7 products ===');
    await this.products.run(params, options);
    console.log('=== migrate:all — step 4/7 employees ===');
    await this.employees.run(params, options);
    console.log('=== migrate:all — step 5/7 orders ===');
    await this.orders.run(params, options);
    console.log('=== migrate:all — step 6/7 customers ===');
    await this.customers.run(params, options);
    console.log('=== migrate:all — step 7/7 settings ===');
    await this.settings.run(params, options);
    console.log('=== migrate:all — done. Run `migrate:verify` next. ===');
  }
}
