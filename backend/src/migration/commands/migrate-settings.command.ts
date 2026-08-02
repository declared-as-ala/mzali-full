import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CountersService } from '@/database/counters.service';
import { Order } from '@/orders/order.schema';
import { SettingsService } from '@/settings/settings.service';
import { LegacyFilesReader } from '../legacy-files.reader';
import { writeReport } from '../report-writer';

type Options = { dryRun?: boolean };

const ORDER_NUMBER_SEQUENCE = 'orderNumber';
const COUNTER_HEADROOM = 1000;

@Command({ name: 'migrate:settings', description: 'Import site settings and seed the order-number counter' })
export class MigrateSettingsCommand extends CommandRunner {
  constructor(
    private readonly files: LegacyFilesReader,
    private readonly settings: SettingsService,
    private readonly counters: CountersService,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const legacySite = await this.files.readSiteSettings();
    const [maxOrder] = await this.orders.find().sort({ orderNumber: -1 }).limit(1);
    const seedTo = (maxOrder?.orderNumber ?? 0) + COUNTER_HEADROOM;

    const report = { siteSettingsImported: false, counterSeededTo: seedTo };

    if (!options.dryRun) {
      await this.settings.setSite(legacySite);
      await this.counters.ensureAtLeast(ORDER_NUMBER_SEQUENCE, seedTo);
      report.siteSettingsImported = true;
    }

    const path = await writeReport('migrate-settings', { options, report });
    console.log(`migrate:settings — siteSettingsImported=${report.siteSettingsImported} counterSeededTo=${seedTo}`);
    console.log(`Report: ${path}`);
  }
}
