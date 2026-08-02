import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BOUTIQUE_CODE, DEPOT_CODE, Location } from '@/catalog/location.schema';

type Options = { dryRun?: boolean };

const SEED_LOCATIONS = [
  {
    code: DEPOT_CODE,
    name: 'Dépôt principal',
    type: 'WAREHOUSE' as const,
    isDefaultOnlineLocation: true,
    isDefaultPosLocation: false,
    allowOnlineFulfillment: true,
    allowPosSales: false,
  },
  {
    code: BOUTIQUE_CODE,
    name: 'Boutique',
    type: 'STORE' as const,
    isDefaultOnlineLocation: false,
    isDefaultPosLocation: true,
    allowOnlineFulfillment: false,
    allowPosSales: true,
  },
];

@Command({ name: 'migrate:seed-locations', description: 'Seed the DEPOT and BOUTIQUE inventory locations' })
export class MigrateSeedLocationsCommand extends CommandRunner {
  constructor(@InjectModel(Location.name) private readonly locations: Model<Location>) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    let created = 0;
    let existing = 0;
    for (const seed of SEED_LOCATIONS) {
      const found = await this.locations.findOne({ code: seed.code });
      if (found) { existing += 1; continue; }
      created += 1;
      if (!options.dryRun) {
        await this.locations.create({ ...seed, active: true, allowNegativeStock: false });
      }
    }
    console.log(`migrate:seed-locations — created=${created} existing=${existing}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
