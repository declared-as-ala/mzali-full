import { Command, CommandRunner, Option } from 'nest-commander';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { hashPassword } from '@/auth/password';
import { Employee } from '@/users/employee.schema';
import { checksumOf } from '../checksum';
import { LegacyFilesReader } from '../legacy-files.reader';
import { LegacyMappingService } from '../legacy-mapping.service';
import { mapLegacyAdmin, mapLegacyEmployee, validateLegacyEmployeeRow } from '../mappers/map-employee';
import { writeReport } from '../report-writer';

type Options = { dryRun?: boolean };

@Command({ name: 'migrate:employees', description: 'Import data/employees.json + data/admin.json into MongoDB' })
export class MigrateEmployeesCommand extends CommandRunner {
  constructor(
    private readonly files: LegacyFilesReader,
    private readonly mappings: LegacyMappingService,
    @InjectModel(Employee.name) private readonly employees: Model<Employee>,
  ) {
    super();
  }

  @Option({ flags: '--dry-run', description: 'Report only, write zero data' })
  parseDryRun(): boolean {
    return true;
  }

  async run(_params: string[], options: Options): Promise<void> {
    const report = {
      created: 0,
      updated: 0,
      skipped: 0,
      invalid: [] as { row: unknown; reason: string }[],
      duplicateEmails: [] as string[],
      adminImported: false,
      adminGeneratedPassword: null as string | null,
    };

    const rows = await this.files.readEmployees();
    const seenEmails = new Set<string>();
    for (const row of rows) {
      const invalidReason = validateLegacyEmployeeRow(row);
      if (invalidReason) {
        report.invalid.push({ row: { id: (row as { id?: unknown }).id }, reason: invalidReason });
        continue;
      }
      const mapped = mapLegacyEmployee(row);
      if (seenEmails.has(mapped.email)) {
        report.duplicateEmails.push(mapped.email);
        continue;
      }
      seenEmails.add(mapped.email);

      const checksum = checksumOf({ email: mapped.email, name: mapped.name, active: mapped.active, hash: mapped.passwordHash.hash });
      const resolution = await this.mappings.resolve('file', 'employee', mapped.legacyId, checksum);
      if (resolution.action === 'skip') {
        report.skipped += 1;
        continue;
      }
      if (options.dryRun) {
        if (resolution.existingNewId) report.updated += 1;
        else report.created += 1;
        continue;
      }

      const doc = await this.employees.findOneAndUpdate(
        { legacyId: mapped.legacyId },
        {
          $set: {
            email: mapped.email,
            name: mapped.name,
            role: mapped.role,
            active: mapped.active,
            passwordHash: mapped.passwordHash,
            mustChangePassword: mapped.mustChangePassword,
          },
        },
        { upsert: true, new: true },
      );
      if (resolution.existingNewId) report.updated += 1;
      else report.created += 1;
      await this.mappings.recordMigrated('file', 'employee', mapped.legacyId, doc.id, checksum);
    }

    // Admin account
    const adminFile = await this.files.readAdmin();
    if (!options.dryRun) {
      if (adminFile) {
        const mapped = mapLegacyAdmin(adminFile);
        const checksum = checksumOf({ hash: mapped.passwordHash.hash });
        const resolution = await this.mappings.resolve('file', 'employee', mapped.legacyId, checksum);
        if (resolution.action !== 'skip') {
          const doc = await this.employees.findOneAndUpdate(
            { legacyId: mapped.legacyId },
            {
              $set: {
                email: mapped.email,
                name: mapped.name,
                role: mapped.role,
                active: mapped.active,
                passwordHash: mapped.passwordHash,
                mustChangePassword: mapped.mustChangePassword,
              },
            },
            { upsert: true, new: true },
          );
          await this.mappings.recordMigrated('file', 'employee', mapped.legacyId, doc.id, checksum);
        }
        report.adminImported = true;
      } else {
        // No data/admin.json — the legacy admin relied solely on ADMIN_PASSWORD.
        // Never copy that plaintext env value into Mongo: generate a one-time
        // random password instead and force a reset at first login.
        const existing = await this.employees.findOne({ legacyId: 'admin' });
        if (!existing) {
          const generated = randomBytes(18).toString('base64url');
          const doc = await this.employees.create({
            email: 'admin@mzali.local',
            name: 'Mzali Admin',
            role: 'super_admin',
            active: true,
            passwordHash: await hashPassword(generated),
            mustChangePassword: true,
            legacyId: 'admin',
          });
          await this.mappings.recordMigrated('file', 'employee', 'admin', doc.id, checksumOf('generated'));
          report.adminGeneratedPassword = generated;
          console.log('\n=== GENERATED ADMIN PASSWORD (shown once, not logged elsewhere) ===');
          console.log(`  email: admin@mzali.local`);
          console.log(`  password: ${generated}`);
          console.log('=== Save this now. The employee must change it at first login. ===\n');
        }
      }
    }

    // Never persist the plaintext password in the report file.
    const path = await writeReport('migrate-employees', {
      options,
      report: { ...report, adminGeneratedPassword: report.adminGeneratedPassword ? '[REDACTED — shown once in console]' : null },
    });
    console.log(
      `migrate:employees — created=${report.created} updated=${report.updated} skipped=${report.skipped} invalid=${report.invalid.length} duplicates=${report.duplicateEmails.length}`,
    );
    console.log(`Report: ${path}`);
  }
}
