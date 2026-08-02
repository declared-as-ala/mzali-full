import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { Counter } from './counter.schema';

@Injectable()
export class CountersService {
  constructor(@InjectModel(Counter.name) private readonly model: Model<Counter>) {}

  /** Atomically claim the next value of a named sequence. */
  async next(name: string, session?: ClientSession): Promise<number> {
    const doc = await this.model.findOneAndUpdate(
      { _id: name },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session },
    );
    return doc.seq;
  }

  /**
   * Raise a sequence floor (idempotent). Used by the migration to seed
   * orderNumber above the highest WooCommerce order number.
   */
  async ensureAtLeast(name: string, minimum: number): Promise<void> {
    await this.model.findOneAndUpdate(
      { _id: name },
      { $max: { seq: minimum } },
      { upsert: true },
    );
  }
}
