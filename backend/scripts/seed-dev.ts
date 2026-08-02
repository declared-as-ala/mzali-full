import 'dotenv/config';
import mongoose from 'mongoose';
import { hashPassword } from '@/auth/password';
import { Employee, EmployeeSchema } from '@/users/employee.schema';

const ADMIN_EMAIL = 'admin@mzali.local';

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  const password = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const EmployeeModel = mongoose.model(Employee.name, EmployeeSchema);
  const existing = await EmployeeModel.findOne({ email: ADMIN_EMAIL });

  if (existing) {
    existing.name = 'Mzali Admin';
    existing.role = 'super_admin';
    existing.active = true;
    existing.mustChangePassword = false;
    existing.passwordHash = await hashPassword(password);
    existing.failedLoginAttempts = 0;
    existing.lockedUntil = null;
    await existing.save();
    process.stdout.write(`Updated dev super-admin credentials for ${ADMIN_EMAIL}\n`);
    return;
  }

  await EmployeeModel.create({
    email: ADMIN_EMAIL,
    name: 'Mzali Admin',
    role: 'super_admin',
    active: true,
    mustChangePassword: false,
    passwordHash: await hashPassword(password),
  });
  process.stdout.write(`Created dev super-admin ${ADMIN_EMAIL}\n`);
}

seed()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
