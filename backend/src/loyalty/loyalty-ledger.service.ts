import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { LoyaltyAccount, LoyaltyAccountDocument } from './loyalty-account.schema';
import { LoyaltyTransaction, LoyaltyTransactionSourceType, LoyaltyTransactionType } from './loyalty-transaction.schema';

export type ApplyLoyaltyInput = {
  accountId: string;
  type: LoyaltyTransactionType;
  pointsDelta: number;
  sourceType: LoyaltyTransactionSourceType;
  sourceId?: string | null;
  reason?: string | null;
  performedBy?: string | null;
  session?: ClientSession;
};

/**
 * Single write path for `loyalty_accounts.pointsBalance`, mirroring
 * StockLedgerService's discipline exactly — every balance change is one
 * call, writing both the `loyalty_transactions` row and the account update
 * inside the same transaction. No other code path touches `pointsBalance`.
 */
@Injectable()
export class LoyaltyLedgerService {
  constructor(
    @InjectModel(LoyaltyAccount.name) private readonly accounts: Model<LoyaltyAccount>,
    @InjectModel(LoyaltyTransaction.name) private readonly transactions: Model<LoyaltyTransaction>,
  ) {}

  async apply(input: ApplyLoyaltyInput): Promise<LoyaltyAccountDocument> {
    if (!Number.isInteger(input.pointsDelta) || input.pointsDelta === 0) {
      throw new BadRequestException('pointsDelta doit être un entier non nul');
    }
    if (input.type === 'MANUAL_ADJUSTMENT' && !input.reason) {
      throw new BadRequestException('Un motif est requis pour un ajustement manuel');
    }

    const account = await this.accounts.findById(input.accountId).session(input.session ?? null);
    if (!account) throw new NotFoundException('Compte de fidélité introuvable');

    const balanceBefore = account.pointsBalance;
    const balanceAfter = balanceBefore + input.pointsDelta;
    if (balanceAfter < 0) {
      throw new BadRequestException('Solde de points insuffisant');
    }

    account.pointsBalance = balanceAfter;
    if (input.pointsDelta > 0 && (input.type === 'EARN' || input.type === 'BONUS' || input.type === 'MIGRATION')) {
      account.lifetimePointsEarned += input.pointsDelta;
    }
    if (input.type === 'REDEEM') {
      account.lifetimePointsRedeemed += Math.abs(input.pointsDelta);
    }
    account.lastActivityAt = new Date();
    await account.save({ session: input.session });

    await this.transactions.create(
      [
        {
          customerId: account.customerId,
          loyaltyAccountId: account.id,
          type: input.type,
          pointsDelta: input.pointsDelta,
          balanceBefore,
          balanceAfter,
          sourceType: input.sourceType,
          sourceId: input.sourceId ?? null,
          reason: input.reason ?? null,
          performedBy: input.performedBy ?? null,
          createdAt: new Date(),
        },
      ],
      { session: input.session },
    );

    return account;
  }

  /**
   * Reverses the proportional points earned by a since-refunded sale/order.
   * Standalone and ready to be called once a refund flow exists — no POS
   * refund flow is built yet (Sprint 3 flagged refunds as a possible later
   * addition), so nothing currently calls this. See progress.md SPRINT-08.
   */
  async reverseEarnedPoints(
    accountId: string,
    proportionalPoints: number,
    sourceId: string,
    session?: ClientSession,
  ): Promise<LoyaltyAccountDocument | null> {
    if (proportionalPoints <= 0) return null;
    const account = await this.accounts.findById(accountId).session(session ?? null);
    if (!account) return null;
    const reversal = -Math.min(proportionalPoints, account.pointsBalance);
    if (reversal === 0) return account;
    return this.apply({
      accountId,
      type: 'REFUND_REVERSAL',
      pointsDelta: reversal,
      sourceType: 'REFUND',
      sourceId,
      session,
    });
  }
}
