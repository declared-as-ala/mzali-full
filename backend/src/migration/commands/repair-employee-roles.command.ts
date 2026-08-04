import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Employee } from '@/users/employee.schema';

type Options = { dryRun?: boolean };

/**
 * One-off repair for the 'employee' -> 'cashier' role merge (see
 * permissions.ts and contracts/auth.ts — 'employee' no longer exists as a
 * valid EmployeeRole; the admin UI's "Employé" option now writes 'cashier').
 * Existing accounts stored with the old role value still validate against
 * the old enum in the database (Mongoose only enforces the enum on
 * write), so they keep working, but should be normalized so the schema's
 * enum constraint holds for every document going forward. Safe to re-run.
 */
@Command({ name: 'repair:employee-roles', description: "Convert existing role:'employee' accounts to role:'cashier'" })
export class RepairEmployeeRolesCommand extends CommandRunner {
  constructor(@InjectModel(Employee.name) private readonly employees: Model<Employee>) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const docs = await this.employees.find({ role: 'employee' });
    for (const doc of docs) {
      console.log(`${options.dryRun ? '[dry-run] ' : ''}${doc.email} (${doc.id}): employee -> cashier`);
      if (!options.dryRun) {
        doc.role = 'cashier';
        await doc.save();
      }
    }
    console.log(`repair:employee-roles — converted=${docs.length}${options.dryRun ? ' (dry-run)' : ''}`);
  }
}
