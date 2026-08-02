import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import type { Coupon as CouponContract, CouponValidation } from '@contracts';
import { normalizePhone } from '@/common/phone';
import { toDinars, toMinor } from '@/common/money';
import { CouponEvalResult, evaluateCoupon } from './coupon-calc';
import { Coupon, CouponDocument, CouponRedemption } from './coupon.schema';
import { CreateCouponDto, UpdateCouponDto } from './dto/coupon.dto';

export type CouponApplyResult = { couponId: string; code: string; type: 'percent' | 'fixed'; value: number; discountMinor: number };

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name) private readonly model: Model<Coupon>,
    @InjectModel(CouponRedemption.name) private readonly redemptions: Model<CouponRedemption>,
  ) {}

  async list(): Promise<CouponContract[]> {
    const docs = await this.model.find().sort({ createdAt: -1 });
    return docs.map((d) => this.toContract(d));
  }

  async create(input: CreateCouponDto): Promise<CouponContract> {
    const code = input.code.trim().toUpperCase();
    if (await this.model.findOne({ code })) throw new ConflictException('Un code promo avec ce code existe déjà');
    const doc = await this.model.create({
      code,
      type: input.type,
      value: input.type === 'fixed' ? toMinor(input.value) : input.value,
      minSubtotalMinor: input.minSubtotal != null ? toMinor(input.minSubtotal) : null,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      usageLimit: input.usageLimit ?? null,
      perPhoneLimit: input.perPhoneLimit ?? null,
      active: input.active ?? true,
      appliesTo: input.appliesTo ?? { kind: 'all', ids: [] },
    });
    return this.toContract(doc);
  }

  async update(id: string, input: UpdateCouponDto): Promise<CouponContract> {
    const doc = await this.findDoc(id);
    if (input.code !== undefined) {
      const code = input.code.trim().toUpperCase();
      if (code !== doc.code && (await this.model.findOne({ code, _id: { $ne: id } }))) {
        throw new ConflictException('Un code promo avec ce code existe déjà');
      }
      doc.code = code;
    }
    if (input.type !== undefined) doc.type = input.type;
    if (input.value !== undefined) {
      doc.value = (input.type ?? doc.type) === 'fixed' ? toMinor(input.value) : input.value;
    }
    if (input.minSubtotal !== undefined) doc.minSubtotalMinor = input.minSubtotal != null ? toMinor(input.minSubtotal) : null;
    if (input.startsAt !== undefined) doc.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) doc.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.usageLimit !== undefined) doc.usageLimit = input.usageLimit;
    if (input.perPhoneLimit !== undefined) doc.perPhoneLimit = input.perPhoneLimit;
    if (input.active !== undefined) doc.active = input.active;
    if (input.appliesTo !== undefined) doc.appliesTo = input.appliesTo;
    await doc.save();
    return this.toContract(doc);
  }

  async remove(id: string): Promise<void> {
    const doc = await this.findDoc(id);
    await doc.deleteOne();
  }

  /** Preview validation for the checkout coupon field — no side effects. */
  async validate(code: string, eligibleSubtotalDinars: number, phone?: string): Promise<CouponValidation> {
    const doc = await this.model.findOne({ code: code.trim().toUpperCase() });
    if (!doc) return { valid: false, reason: 'Code promo introuvable' };
    const phoneCount = phone ? await this.redemptions.countDocuments({ couponId: doc.id, phone: normalizePhone(phone) }) : 0;
    const result = evaluateCoupon(this.toSnapshot(doc), {
      eligibleSubtotalMinor: toMinor(eligibleSubtotalDinars),
      now: new Date(),
      phoneRedemptionCount: phoneCount,
    });
    if (!result.valid) return { valid: false, reason: result.reason };
    return { valid: true, code: doc.code, type: doc.type, value: doc.value, discount: toDinars(result.discountMinor) };
  }

  /**
   * Redeem a coupon inside the checkout transaction: re-validates against
   * the authoritative subtotal, atomically guards the global usage limit,
   * and records the redemption. Throws BadRequestException when the coupon
   * is no longer valid (race with another concurrent order, expiry, etc).
   */
  async applyWithinTxn(
    code: string,
    eligibleSubtotalMinor: number,
    phone: string,
    orderId: string,
    session: ClientSession,
  ): Promise<CouponApplyResult> {
    const doc = await this.model.findOne({ code: code.trim().toUpperCase() }).session(session);
    if (!doc) throw new BadRequestException('Code promo introuvable');

    const normalizedPhone = normalizePhone(phone);
    const phoneCount = await this.redemptions
      .countDocuments({ couponId: doc.id, phone: normalizedPhone })
      .session(session);

    const result: CouponEvalResult = evaluateCoupon(this.toSnapshot(doc), {
      eligibleSubtotalMinor,
      now: new Date(),
      phoneRedemptionCount: phoneCount,
    });
    if (!result.valid) throw new BadRequestException(result.reason);

    const updated = await this.model.findOneAndUpdate(
      {
        _id: doc._id,
        $or: [{ usageLimit: null }, { $expr: { $lt: ['$usageCount', '$usageLimit'] } }],
      },
      { $inc: { usageCount: 1 } },
      { new: true, session },
    );
    if (!updated) throw new BadRequestException('Ce code promo a atteint sa limite d\'utilisation');

    await this.redemptions.create(
      [{ couponId: doc.id, orderId, phone: normalizedPhone, amountMinor: result.discountMinor }],
      { session },
    );

    return { couponId: doc.id, code: doc.code, type: doc.type, value: doc.value, discountMinor: result.discountMinor };
  }

  /** Release a redemption when an order carrying a coupon is cancelled. */
  async releaseRedemption(couponId: string, orderId: string, session?: ClientSession): Promise<void> {
    const redemption = await this.redemptions.findOneAndDelete({ couponId, orderId }, { session });
    if (redemption) {
      await this.model.updateOne({ _id: couponId }, { $inc: { usageCount: -1 } }, { session });
    }
  }

  private async findDoc(id: string): Promise<CouponDocument> {
    const doc = await this.model.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Code promo introuvable');
    return doc;
  }

  private toSnapshot(doc: CouponDocument) {
    return {
      code: doc.code,
      type: doc.type,
      value: doc.value,
      minSubtotalMinor: doc.minSubtotalMinor,
      startsAt: doc.startsAt,
      endsAt: doc.endsAt,
      usageLimit: doc.usageLimit,
      usageCount: doc.usageCount,
      perPhoneLimit: doc.perPhoneLimit,
      active: doc.active,
    };
  }

  private toContract(doc: CouponDocument): CouponContract {
    return {
      id: doc.id,
      code: doc.code,
      type: doc.type,
      value: doc.type === 'fixed' ? toDinars(doc.value) : doc.value,
      minSubtotal: doc.minSubtotalMinor != null ? toDinars(doc.minSubtotalMinor) : null,
      startsAt: doc.startsAt?.toISOString() ?? null,
      endsAt: doc.endsAt?.toISOString() ?? null,
      usageLimit: doc.usageLimit,
      usageCount: doc.usageCount,
      perPhoneLimit: doc.perPhoneLimit,
      active: doc.active,
      appliesTo: doc.appliesTo,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    };
  }
}
