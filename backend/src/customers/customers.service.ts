import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model, Types } from 'mongoose';
import type { CheckoutCustomer } from '@contracts';
import { clampPagination, paginate } from '@/common/pagination';
import { normalizePhone } from '@/common/phone';
import { Customer, CustomerDocument } from './customer.schema';

@Injectable()
export class CustomersService {
  constructor(@InjectModel(Customer.name) private readonly model: Model<Customer>) {}

  /**
   * Upsert the guest customer record for an order. Called inside the
   * checkout transaction so customer stats stay consistent with orders.
   */
  async upsertFromOrder(
    customer: CheckoutCustomer,
    totalMinor: number,
    orderCreatedAt: Date,
    session?: ClientSession,
  ): Promise<CustomerDocument | null> {
    const phone = normalizePhone(customer.phone);
    if (!phone) return null;
    const doc = await this.model.findOneAndUpdate(
      { phone },
      {
        $set: {
          firstName: customer.firstName,
          lastName: customer.lastName ?? '',
          email: customer.email ?? null,
          city: customer.city,
          address: customer.address,
          lastOrderAt: orderCreatedAt,
        },
        $setOnInsert: { firstOrderAt: orderCreatedAt, altPhones: [] },
        $inc: { ordersCount: 1, totalSpentMinor: totalMinor },
      },
      { new: true, upsert: true, session },
    );
    return doc;
  }

  /**
   * Finds a customer by phone, or creates a minimal record if none exists.
   * Unlike `upsertFromOrder` this isn't tied to placing an order — it's
   * the POS "quick customer/loyalty create" path, where a customer record
   * needs to exist before their first purchase.
   */
  async findOrCreateByPhone(
    phone: string,
    patch?: { firstName?: string; lastName?: string },
    session?: ClientSession,
  ): Promise<CustomerDocument> {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error('Numéro de téléphone invalide');
    const update: Record<string, unknown> = { $setOnInsert: { altPhones: [], ordersCount: 0, totalSpentMinor: 0 } };
    if (patch?.firstName || patch?.lastName) {
      update.$set = {
        ...(patch.firstName ? { firstName: patch.firstName } : {}),
        ...(patch.lastName ? { lastName: patch.lastName } : {}),
      };
    }
    return this.model.findOneAndUpdate({ phone: normalized }, update, { new: true, upsert: true, session });
  }

  async recordAssignment(phone: string, employeeId: string | null, session?: ClientSession): Promise<void> {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    await this.model.updateOne(
      { phone: normalized },
      { $set: { lastAssignment: { employeeId, at: employeeId ? new Date() : null } } },
      { session },
    );
  }

  async findByPhone(phone: string): Promise<CustomerDocument | null> {
    const normalized = normalizePhone(phone);
    if (!normalized) return null;
    return this.model.findOne({ phone: normalized });
  }

  async list(page?: number, perPage?: number, search?: string) {
    const { page: p, perPage: pp, skip } = clampPagination(page, perPage, 100);
    const filter: Record<string, unknown> = {};
    if (search) {
      const normalized = normalizePhone(search);
      filter.$or = [
        { phone: { $regex: normalized || search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
      ];
    }
    const [docs, total] = await Promise.all([
      this.model.find(filter).sort({ lastOrderAt: -1 }).skip(skip).limit(pp),
      this.model.countDocuments(filter),
    ]);
    return paginate(docs.map((d) => this.toDto(d)), total, p, pp);
  }

  async deleteMany(ids: string[]): Promise<number> {
    const validIds = [...new Set(ids)].filter((id) => Types.ObjectId.isValid(id));
    if (validIds.length === 0) return 0;
    const result = await this.model.deleteMany({ _id: { $in: validIds } });
    return result.deletedCount;
  }

  private toDto(doc: CustomerDocument) {
    return {
      id: doc.id,
      phone: doc.phone,
      firstName: doc.firstName,
      lastName: doc.lastName,
      email: doc.email,
      city: doc.city,
      address: doc.address,
      ordersCount: doc.ordersCount,
      totalSpentMinor: doc.totalSpentMinor,
      firstOrderAt: doc.firstOrderAt?.toISOString() ?? null,
      lastOrderAt: doc.lastOrderAt?.toISOString() ?? null,
    };
  }
}
