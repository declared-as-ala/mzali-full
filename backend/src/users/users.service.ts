import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { EmployeeCreateInput, EmployeeRecord, EmployeeUpdateInput } from '@contracts';
import { hashPassword } from '@/auth/password';
import { Employee, EmployeeDocument } from './employee.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(Employee.name) private readonly model: Model<Employee>,
  ) {}

  async list(): Promise<EmployeeRecord[]> {
    const docs = await this.model.find().sort({ createdAt: 1 });
    return docs.map((d) => this.toRecord(d));
  }

  /** Lightweight labels for pickers — matches the legacy employees-directory route. */
  async directory(): Promise<{ id: string; name: string; active: boolean }[]> {
    const docs = await this.model
      .find({ role: 'employee' })
      .select({ name: 1, active: 1 })
      .sort({ name: 1 });
    return docs.map((d) => ({ id: d.id, name: d.name, active: d.active }));
  }

  async get(id: string): Promise<EmployeeRecord> {
    const doc = await this.findDoc(id);
    return this.toRecord(doc);
  }

  async create(input: EmployeeCreateInput): Promise<EmployeeRecord> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.model.findOne({ email });
    if (existing) throw new ConflictException('Un compte avec cet email existe déjà');
    const doc = await this.model.create({
      email,
      name: input.name.trim(),
      role: input.role ?? 'employee',
      active: input.active ?? true,
      passwordHash: await hashPassword(input.password),
    });
    return this.toRecord(doc);
  }

  async update(id: string, patch: EmployeeUpdateInput): Promise<EmployeeRecord> {
    const doc = await this.findDoc(id);
    if (patch.email !== undefined) {
      const email = patch.email.trim().toLowerCase();
      const clash = await this.model.findOne({ email, _id: { $ne: doc._id } });
      if (clash) throw new ConflictException('Un compte avec cet email existe déjà');
      doc.email = email;
    }
    if (patch.name !== undefined) doc.name = patch.name.trim();
    if (patch.role !== undefined) doc.role = patch.role;
    if (patch.active !== undefined) doc.active = patch.active;
    if (patch.mustChangePassword !== undefined) doc.mustChangePassword = patch.mustChangePassword;
    if (patch.password !== undefined) {
      if (patch.password.length < 8) {
        throw new BadRequestException('Mot de passe trop court (8 caractères minimum)');
      }
      doc.passwordHash = await hashPassword(patch.password);
    }
    await doc.save();
    return this.toRecord(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findDoc(id);
    await doc.deleteOne();
  }

  private async findDoc(id: string): Promise<EmployeeDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Employé introuvable');
    return doc;
  }

  private toRecord(doc: EmployeeDocument): EmployeeRecord {
    return {
      id: doc.id,
      email: doc.email,
      name: doc.name,
      role: doc.role,
      active: doc.active,
      mustChangePassword: doc.mustChangePassword,
      lastLoginAt: doc.lastLoginAt ? doc.lastLoginAt.toISOString() : null,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
