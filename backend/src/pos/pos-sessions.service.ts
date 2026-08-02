import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { SettingsService } from '@/settings/settings.service';
import { PosCashierSession, PosCashierSessionDocument } from './pos-cashier-session.schema';
import { PosCashMovement, PosCashMovementType } from './pos-cash-movement.schema';

const DEFAULT_TOLERANCE_MINOR = 1000; // 1 DT

export type SessionReportView = {
  type: 'X' | 'Z';
  generatedAt: string;
  expectedCashMinor: number;
  countedCashMinor: number | null;
  cashDifferenceMinor: number | null;
  flagged: boolean;
  grossSalesMinor: number;
  refundsMinor: number;
  discountsMinor: number;
  netSalesMinor: number;
  cashSalesMinor: number;
  cardSalesMinor: number;
  otherSalesMinor: number;
  cashMovementsAddMinor: number;
  cashMovementsRemoveMinor: number;
  transactionCount: number;
};

@Injectable()
export class PosSessionsService {
  constructor(
    @InjectModel(PosCashierSession.name) private readonly sessions: Model<PosCashierSession>,
    @InjectModel(PosCashMovement.name) private readonly movements: Model<PosCashMovement>,
    private readonly settings: SettingsService,
  ) {}

  async open(cashierId: string, terminalId: string, registerId: string | null, openingCashMinor: number): Promise<PosCashierSessionDocument> {
    const existing = await this.sessions.findOne({ terminalId, status: 'OPEN' });
    if (existing) throw new ConflictException('Une session est déjà ouverte sur ce terminal');
    return this.sessions.create({
      cashierId, terminalId, registerId, openingCashMinor, openedAt: new Date(), status: 'OPEN',
    });
  }

  async getOpenForTerminal(terminalId: string): Promise<PosCashierSessionDocument | null> {
    return this.sessions.findOne({ terminalId, status: 'OPEN' });
  }

  async getById(id: string): Promise<PosCashierSessionDocument> {
    const doc = await this.sessions.findById(id).catch(() => null);
    if (!doc) throw new NotFoundException('Session introuvable');
    return doc;
  }

  async requireOpen(id: string): Promise<PosCashierSessionDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'OPEN') throw new BadRequestException('Cette session est fermée');
    return doc;
  }

  async list(filter: { cashierId?: string; terminalId?: string; status?: string } = {}): Promise<PosCashierSessionDocument[]> {
    const query: Record<string, unknown> = {};
    if (filter.cashierId) query.cashierId = filter.cashierId;
    if (filter.terminalId) query.terminalId = filter.terminalId;
    if (filter.status) query.status = filter.status;
    return this.sessions.find(query).sort({ openedAt: -1 }).limit(200);
  }

  /** Manager sign-off on a closed session — corrections to a session's
   *  own financial totals are never made silently; this only records that
   *  a human reviewed the numbers as-is, it changes nothing else. */
  async markReviewed(id: string, reviewedBy: string, note?: string): Promise<PosCashierSessionDocument> {
    const doc = await this.getById(id);
    if (doc.status !== 'CLOSED') throw new BadRequestException('Seule une session fermée peut être marquée comme vérifiée');
    doc.reviewedAt = new Date();
    doc.reviewedBy = reviewedBy;
    doc.reviewNote = note ?? null;
    await doc.save();
    return doc;
  }

  async addCashMovement(sessionId: string, type: PosCashMovementType, amountMinor: number, reason: string, performedBy: string): Promise<void> {
    if (amountMinor <= 0) throw new BadRequestException('Montant invalide');
    const session = await this.requireOpen(sessionId);
    await this.movements.create({ sessionId, type, amountMinor, reason, performedBy, createdAt: new Date() });
    if (type === 'ADD') session.cashMovementsAddMinor += amountMinor;
    else session.cashMovementsRemoveMinor += amountMinor;
    await session.save();
  }

  /**
   * Called by PosSalesService inside the sale transaction — the ONLY
   * place session running totals change from a sale. Uses $inc (not a
   * read-modify-write) so it's safe under a concurrent transaction.
   */
  async applySaleToSession(
    sessionId: string,
    input: { totalMinor: number; discountMinor: number; cashMinor: number; cardMinor: number; otherMinor: number },
    session?: ClientSession,
  ): Promise<void> {
    await this.sessions.updateOne(
      { _id: sessionId },
      {
        $inc: {
          grossSalesMinor: input.totalMinor,
          discountsMinor: input.discountMinor,
          cashSalesMinor: input.cashMinor,
          cardSalesMinor: input.cardMinor,
          otherSalesMinor: input.otherMinor,
          transactionCount: 1,
        },
      },
      { session },
    );
  }

  /**
   * Called by PosSalesService.update() when a completed sale is edited
   * while its session is still OPEN — applies the *delta* between the
   * sale's old and new totals/payment split, never a full re-add, so the
   * session's running totals stay correct without double-counting the
   * amount already recorded when the sale was first created. transactionCount
   * is untouched (editing a sale doesn't create or remove a ticket).
   */
  async applySaleEditToSession(
    sessionId: string,
    delta: { totalMinor: number; discountMinor: number; cashMinor: number; cardMinor: number; otherMinor: number },
    session?: ClientSession,
  ): Promise<void> {
    await this.sessions.updateOne(
      { _id: sessionId },
      {
        $inc: {
          grossSalesMinor: delta.totalMinor,
          discountsMinor: delta.discountMinor,
          cashSalesMinor: delta.cashMinor,
          cardSalesMinor: delta.cardMinor,
          otherSalesMinor: delta.otherMinor,
        },
      },
      { session },
    );
  }

  private async computeExpectedCashMinor(doc: PosCashierSessionDocument): Promise<number> {
    return (
      doc.openingCashMinor +
      doc.cashSalesMinor +
      doc.cashMovementsAddMinor -
      doc.cashMovementsRemoveMinor -
      doc.refundsMinor
    );
  }

  private async toleranceMinor(): Promise<number> {
    const raw = await this.settings.getRaw('pos');
    const value = raw?.cashToleranceMinor;
    return typeof value === 'number' && value >= 0 ? value : DEFAULT_TOLERANCE_MINOR;
  }

  async report(sessionId: string, type: 'X' | 'Z'): Promise<SessionReportView> {
    const doc = await this.getById(sessionId);
    if (type === 'Z') {
      if (doc.status !== 'CLOSED') throw new BadRequestException('Le rapport Z nécessite une session fermée');
      const existing = doc.reports.find((r) => r.type === 'Z');
      if (existing) return this.toView(existing, await this.toleranceMinor());
    }

    const expectedCashMinor = await this.computeExpectedCashMinor(doc);
    const countedCashMinor = type === 'Z' ? doc.closingCountedCashMinor : null;
    const snapshot = {
      type,
      generatedAt: new Date(),
      expectedCashMinor,
      countedCashMinor,
      cashDifferenceMinor: countedCashMinor !== null ? countedCashMinor - expectedCashMinor : null,
      grossSalesMinor: doc.grossSalesMinor,
      refundsMinor: doc.refundsMinor,
      discountsMinor: doc.discountsMinor,
      netSalesMinor: doc.grossSalesMinor - doc.refundsMinor,
      cashSalesMinor: doc.cashSalesMinor,
      cardSalesMinor: doc.cardSalesMinor,
      otherSalesMinor: doc.otherSalesMinor,
      cashMovementsAddMinor: doc.cashMovementsAddMinor,
      cashMovementsRemoveMinor: doc.cashMovementsRemoveMinor,
      transactionCount: doc.transactionCount,
    };

    if (type === 'Z') {
      doc.reports.push(snapshot);
      await doc.save();
    }
    return this.toView(snapshot, await this.toleranceMinor());
  }

  async close(id: string, countedCashMinor: number): Promise<PosCashierSessionDocument> {
    if (countedCashMinor < 0) throw new BadRequestException('Montant invalide');
    const doc = await this.requireOpen(id);
    doc.status = 'CLOSED';
    doc.closedAt = new Date();
    doc.closingCountedCashMinor = countedCashMinor;
    await doc.save();
    await this.report(id, 'Z'); // generates + persists the immutable Z snapshot
    return this.getById(id);
  }

  /**
   * Admin-triggered close for a terminal an admin can't physically reach
   * (device lost, cashier gone home with it open) — deliberately does NOT
   * fabricate a verified cash count: the expected amount is recorded as
   * counted (the only safe default without a real count) and the session
   * is left explicitly un-reviewed with a note, forcing a manager to
   * reconcile the drawer for real later. Never silently treated as
   * "correct".
   */
  async forceClose(id: string, actorName: string): Promise<PosCashierSessionDocument> {
    const doc = await this.requireOpen(id);
    const expected = await this.computeExpectedCashMinor(doc);
    const closed = await this.close(id, expected);
    closed.reviewNote = `Fermeture forcée par ${actorName} — comptage non vérifié physiquement`;
    await closed.save();
    return closed;
  }

  private toView(
    snapshot: {
      type: 'X' | 'Z'; generatedAt: Date; expectedCashMinor: number; countedCashMinor: number | null;
      cashDifferenceMinor: number | null; grossSalesMinor: number; refundsMinor: number; discountsMinor: number;
      netSalesMinor: number; cashSalesMinor: number; cardSalesMinor: number; otherSalesMinor: number;
      cashMovementsAddMinor: number; cashMovementsRemoveMinor: number; transactionCount: number;
    },
    toleranceMinor: number,
  ): SessionReportView {
    return {
      type: snapshot.type,
      generatedAt: snapshot.generatedAt.toISOString(),
      expectedCashMinor: snapshot.expectedCashMinor,
      countedCashMinor: snapshot.countedCashMinor,
      cashDifferenceMinor: snapshot.cashDifferenceMinor,
      flagged: snapshot.cashDifferenceMinor !== null && Math.abs(snapshot.cashDifferenceMinor) > toleranceMinor,
      grossSalesMinor: snapshot.grossSalesMinor,
      refundsMinor: snapshot.refundsMinor,
      discountsMinor: snapshot.discountsMinor,
      netSalesMinor: snapshot.netSalesMinor,
      cashSalesMinor: snapshot.cashSalesMinor,
      cardSalesMinor: snapshot.cardSalesMinor,
      otherSalesMinor: snapshot.otherSalesMinor,
      cashMovementsAddMinor: snapshot.cashMovementsAddMinor,
      cashMovementsRemoveMinor: snapshot.cashMovementsRemoveMinor,
      transactionCount: snapshot.transactionCount,
    };
  }
}
