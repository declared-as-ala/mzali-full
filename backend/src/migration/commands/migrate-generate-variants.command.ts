import { Command, CommandRunner, Option } from 'nest-commander';
import { ProductVariantsService } from '@/catalog/product-variants.service';

type Options = { dryRun?: boolean };

@Command({ name: 'migrate:generate-variants', description: 'Ensure every product has exactly one variant' })
export class MigrateGenerateVariantsCommand extends CommandRunner {
  constructor(private readonly variants: ProductVariantsService) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = await this.variants.generateForAllProducts(options.dryRun ?? false);
    console.log(
      `migrate:generate-variants — created=${report.created} skipped=${report.skipped} total=${report.total}${options.dryRun ? ' (dry-run)' : ''}`,
    );
  }
}
