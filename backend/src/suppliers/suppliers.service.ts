import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CountersService } from '@/database/counters.service';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import { Supplier, SupplierDocument } from './supplier.schema';

const SEQUENCE_NAME = 'supplier';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectModel(Supplier.name) private readonly model: Model<Supplier>,
    private readonly counters: CountersService,
  ) {}

  async list(): Promise<SupplierDocument[]> {
    return this.model.find().sort({ companyName: 1 });
  }

  async getById(id: string): Promise<SupplierDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Fournisseur introuvable');
    return doc;
  }

  async namesByIds(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const docs = await this.model.find({ _id: { $in: ids } }).select({ companyName: 1 });
    return new Map(docs.map((d) => [d.id, d.companyName]));
  }

  async create(dto: CreateSupplierDto): Promise<SupplierDocument> {
    const seq = await this.counters.next(SEQUENCE_NAME);
    const code = `SUP-${String(seq).padStart(4, '0')}`;
    return this.model.create({
      code,
      companyName: dto.companyName,
      contactName: dto.contactName ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      whatsapp: dto.whatsapp ?? null,
      billingAddress: dto.billingAddress ?? null,
      notes: dto.notes ?? null,
    });
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<SupplierDocument> {
    const doc = await this.getById(id);
    if (dto.companyName !== undefined) doc.companyName = dto.companyName;
    if (dto.contactName !== undefined) doc.contactName = dto.contactName;
    if (dto.email !== undefined) doc.email = dto.email;
    if (dto.phone !== undefined) doc.phone = dto.phone;
    if (dto.whatsapp !== undefined) doc.whatsapp = dto.whatsapp;
    if (dto.billingAddress !== undefined) doc.billingAddress = dto.billingAddress as Supplier['billingAddress'];
    if (dto.notes !== undefined) doc.notes = dto.notes;
    if (dto.status !== undefined) doc.status = dto.status;
    await doc.save();
    return doc;
  }

  async delete(id: string): Promise<void> {
    await this.model.deleteOne({ _id: id });
  }

  async deleteMany(ids: string[]): Promise<number> {
    const res = await this.model.deleteMany({ _id: { $in: ids } });
    return res.deletedCount;
  }
}
