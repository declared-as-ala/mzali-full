import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { SettingsService } from '@/settings/settings.service';
import { PosCashierSession, PosCashierSessionDocument } from './pos-cashier-session.schema';
import { PosCashMovement, PosCashMovementType } from './pos-cash-movement.schema';

import { cashBusinessDate, expectedCash, validateCash } from './cash-accounting';
import { PosDailyZ } from './pos-daily-z.schema';
import { PosSale } from './pos-sale.schema';
import { PosPayment } from './pos-payment.schema';
import { PosTerminal } from './pos-terminal.schema';
import { Employee } from '@/users/employee.schema';

const DEFAULT_TOLERANCE_MINOR = 1000; // 1 DT

export type SessionReportView = {
  details?: Record<string, unknown>;
  cashRefundsMinor?: number;
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
export class PosSessionsService implements OnModuleInit {
  constructor(
    @InjectModel(PosCashierSession.name) private readonly sessions: Model<PosCashierSession>,
    @InjectModel(PosCashMovement.name) private readonly movements: Model<PosCashMovement>,
    private readonly settings: SettingsService,
  ) {}

  async onModuleInit() {
    // Do not serve unsafe writes if legacy duplicate OPEN sessions prevent index creation.
    await this.sessions.init();
    await this.movements.init();
    await this.sessions.db.model(PosDailyZ.name).init();
  }

  async open(cashierId: string, terminalId: string, registerId: string | null, openingCashMinor: number): Promise<PosCashierSessionDocument> {
    if (!validateCash(openingCashMinor)) throw new BadRequestException('Montant invalide');
    const date = cashBusinessDate(new Date());
    // Create the shared day before competing transactions acquire its write lock.
    try {
      await this.sessions.db.model<PosDailyZ>(PosDailyZ.name).updateOne({ date }, { $setOnInsert: { date, status: 'OPEN' } }, { upsert: true });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }
    try {
      return await this.transaction(async (txn) => {
        await this.touchDay(date, txn);
        const existing = await this.sessions.findOne({ terminalId, status: 'OPEN' }).session(txn);
        if (existing) throw new ConflictException('Une session est déjà ouverte sur ce terminal');
        const [doc] = await this.sessions.create([{
          cashierId, terminalId, registerId, openingCashMinor, businessDate: date, openedAt: new Date(), status: 'OPEN',
        }], { session: txn });
        await this.recordMovement(doc, 'OPENING_FUND', openingCashMinor, cashierId, 'Fond initial', txn, undefined, `open:${doc.id}`);
        return doc;
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) throw new ConflictException('Une session est déjà ouverte sur ce terminal');
      throw error;
    }
  }

  async transaction<T>(fn: (txn: ClientSession) => Promise<T>): Promise<T> {
    const txn = await this.sessions.db.startSession();
    try {
      let result!: T;
      await txn.withTransaction(async () => { result = await fn(txn); });
      return result;
    } finally { await txn.endSession(); }
  }

  async touchDay(date: string, txn: ClientSession): Promise<void> {
    const days = this.sessions.db.model<PosDailyZ>(PosDailyZ.name);
    const day = await days.findOneAndUpdate({ date }, { $inc: { revision: 1 }, $setOnInsert: { status: 'OPEN' } }, { upsert: true, new: true, session: txn });
    if (day.status === 'CLOSED') throw new ConflictException('Cette journée est clôturée. Le Ticket Z est définitif.');
  }

  async assertAccess(id: string, terminalId: string, cashierId: string, manager = false) {
    const doc = await this.getById(id);
    if (doc.terminalId !== terminalId || (!manager && doc.cashierId !== cashierId)) throw new ForbiddenException('Cette caisse appartient à un autre caissier ou terminal');
    return doc;
  }

  async recordMovement(doc: PosCashierSessionDocument, type: PosCashMovementType, amountMinor: number, performedBy: string, reason: string, txn?: ClientSession, saleId?: string, operationKey?: string) {
    await this.movements.create([{ sessionId: doc.id, terminalId: doc.terminalId, cashierId: doc.cashierId, type, amountMinor, performedBy, reason, saleId, operationKey }], { session: txn });
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
    if (!validateCash(amountMinor) || !amountMinor || !reason.trim() || !['ADD', 'REMOVE', 'CASH_IN', 'CASH_OUT'].includes(type)) throw new BadRequestException('Montant ou motif invalide');
    await this.transaction(async (txn) => {
      const doc = await this.sessions.findOne({ _id: sessionId, status: 'OPEN' }).session(txn);
      if (!doc) throw new ConflictException('Cette session est fermée');
      const incoming = type === 'ADD' || type === 'CASH_IN';
      await this.sessions.updateOne({ _id: sessionId, status: 'OPEN' }, { $inc: { [incoming ? 'cashMovementsAddMinor' : 'cashMovementsRemoveMinor']: amountMinor } }, { session: txn });
      await this.recordMovement(doc, incoming ? 'CASH_IN' : 'CASH_OUT', amountMinor, performedBy, reason, txn);
    });
  }

  /**
   * Called by PosSalesService inside the sale transaction — the ONLY
   * place session running totals change from a sale. Uses $inc (not a
   * read-modify-write) so it's safe under a concurrent transaction.
   */
  async applySaleToSession(
    sessionId: string,
    input: { totalMinor: number; discountMinor: number; cashMinor: number; cardMinor: number; otherMinor: number; saleId?: string; actorId?: string; reason?: string },
    session?: ClientSession,
  ): Promise<void> {
    const result = await this.sessions.updateOne(
      { _id: sessionId, status: 'OPEN' },
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
    if (!result.matchedCount) throw new ConflictException('Cette session est fermée');
    if (input.cashMinor) {
      const doc = await this.sessions.findById(sessionId).session(session ?? null);
      await this.recordMovement(doc!, 'CASH_SALE', input.cashMinor, input.actorId ?? doc!.cashierId, 'Vente espèces', session, input.saleId, input.saleId ? `sale:${input.saleId}` : undefined);
    }
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
    delta: { totalMinor: number; discountMinor: number; cashMinor: number; cardMinor: number; otherMinor: number; saleId?: string; actorId?: string; reason?: string },
    session?: ClientSession,
  ): Promise<void> {
    const result = await this.sessions.updateOne(
      { _id: sessionId, status: 'OPEN' },
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
    if (!result.matchedCount) throw new ConflictException('Cette session est fermée');
    if (delta.cashMinor) {
      const doc = await this.sessions.findById(sessionId).session(session ?? null);
      await this.recordMovement(doc!, 'CORRECTION', delta.cashMinor, delta.actorId ?? doc!.cashierId, delta.reason ?? 'Modification vente', session, delta.saleId);
    }
  }

  private async computeExpectedCashMinor(doc: PosCashierSessionDocument): Promise<number> {
    return expectedCash(doc);
  }

  private async toleranceMinor(): Promise<number> {
    const raw = await this.settings.getRaw('pos');
    const value = raw?.cashToleranceMinor;
    return typeof value === 'number' && value >= 0 ? value : DEFAULT_TOLERANCE_MINOR;
  }

  async report(sessionId: string, type: 'X' | 'Z'): Promise<SessionReportView> {
    const doc = await this.getById(sessionId);
    if (type === 'Z') {
      const stored = doc.reports.find((r) => r.type === 'Z');
      if (doc.status !== 'CLOSED' || !stored) throw new BadRequestException('Rapport Z archivé indisponible');
      return this.toView(stored, await this.toleranceMinor());
    }
    return this.toView(await this.snapshot(doc, 'X'), await this.toleranceMinor());
  }

  private async snapshot(doc: PosCashierSessionDocument, type: 'X' | 'Z', txn?: ClientSession) {
    const expectedCashMinor = expectedCash(doc);
    const countedCashMinor = type === 'Z' ? doc.closingCountedCashMinor : null;
    const cashDifferenceMinor = countedCashMinor === null ? null : countedCashMinor - expectedCashMinor;
    const sales = await this.sessions.db.model<PosSale>(PosSale.name).find({ sessionId: doc.id, status: { $ne: 'SUSPENDED' } }).sort({ saleNumber: 1 }).session(txn ?? null);
    const payments = await this.sessions.db.model<PosPayment>(PosPayment.name).find({ sessionId: doc.id }).session(txn ?? null);
    const terminal = await this.sessions.db.model<PosTerminal>(PosTerminal.name).findById(doc.terminalId).session(txn ?? null);
    const cashier = await this.sessions.db.model<Employee>(Employee.name).findById(doc.cashierId).session(txn ?? null);
    const company = await this.settings.getCompany();
    // Derive gross/discounts from immutable price snapshots, including quantity offers.
    const gross = sales.reduce((sum, sale) => sum + sale.lines.reduce((n, l) => n + (l.regularUnitPriceMinor ?? l.unitPriceMinor) * l.qty, 0), 0);
    const charged = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const methods: Record<string, number> = {};
    for (const p of payments) if (p.status === 'PAID') methods[p.method] = (methods[p.method] ?? 0) + p.amountMinor;
    return {
      type, generatedAt: new Date(), expectedCashMinor, countedCashMinor, cashDifferenceMinor,
      flagged: cashDifferenceMinor !== null && Math.abs(cashDifferenceMinor) > await this.toleranceMinor(),
      grossSalesMinor: gross, refundsMinor: doc.refundsMinor, discountsMinor: gross - charged,
      netSalesMinor: charged - doc.refundsMinor,
      cashSalesMinor: doc.cashSalesMinor, cardSalesMinor: doc.cardSalesMinor, otherSalesMinor: doc.otherSalesMinor,
      cashRefundsMinor: doc.cashRefundsMinor ?? 0,
      cashMovementsAddMinor: doc.cashMovementsAddMinor, cashMovementsRemoveMinor: doc.cashMovementsRemoveMinor,
      transactionCount: sales.length,
      details: {
        sessionId: doc.id, number: `Z-${doc.id}`, businessDate: doc.businessDate ?? cashBusinessDate(doc.openedAt),
        company, terminalId: doc.terminalId, terminalName: terminal?.name ?? doc.terminalId,
        cashierId: doc.cashierId, cashierName: cashier?.name ?? doc.cashierId,
        openedAt: doc.openedAt.toISOString(), closedAt: doc.closedAt?.toISOString() ?? null,
        openingCashMinor: doc.openingCashMinor, closingNote: doc.closingNote,
        payments: methods, receiptCount: sales.length, averageTicketMinor: sales.length ? Math.round(charged / sales.length) : 0,
        firstReceiptNumber: sales[0]?.saleNumber ?? null, lastReceiptNumber: sales.at(-1)?.saleNumber ?? null,
        sales: sales.map((sale) => ({ id: sale.id, number: sale.saleNumber, totalMinor: sale.totalMinor, status: sale.status })),
      },
    };
  }

  async close(id: string, countedCashMinor: number, note?: string): Promise<PosCashierSessionDocument> {
    if (!validateCash(countedCashMinor)) throw new BadRequestException('Montant invalide');
    return this.transaction(async (txn) => {
      const doc = await this.sessions.findById(id).session(txn);
      if (!doc) throw new NotFoundException('Session introuvable');
      if (doc.status === 'CLOSED') return doc; // Response-loss retry returns the original closure.
      await this.touchDay(doc.businessDate ?? cashBusinessDate(doc.openedAt), txn);
      doc.status = 'CLOSED';
      doc.closedAt = new Date();
      doc.closingCountedCashMinor = countedCashMinor;
      doc.closingNote = note?.trim() || null;
      doc.reports.push(await this.snapshot(doc, 'Z', txn));
      await doc.save({ session: txn });
      await this.recordMovement(doc, 'CLOSING', countedCashMinor, doc.cashierId, note?.trim() || 'Comptage de clôture', txn, undefined, `close:${doc.id}`);
      return doc;
    });
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
      details?: Record<string, unknown>; cashRefundsMinor?: number; flagged?: boolean;
      type: 'X' | 'Z'; generatedAt: Date; expectedCashMinor: number; countedCashMinor: number | null;
      cashDifferenceMinor: number | null; grossSalesMinor: number; refundsMinor: number; discountsMinor: number;
      netSalesMinor: number; cashSalesMinor: number; cardSalesMinor: number; otherSalesMinor: number;
      cashMovementsAddMinor: number; cashMovementsRemoveMinor: number; transactionCount: number;
    },
    toleranceMinor: number,
  ): SessionReportView {
    return {
      details: snapshot.details,
      cashRefundsMinor: snapshot.cashRefundsMinor ?? 0,
      type: snapshot.type,
      generatedAt: snapshot.generatedAt.toISOString(),
      expectedCashMinor: snapshot.expectedCashMinor,
      countedCashMinor: snapshot.countedCashMinor,
      cashDifferenceMinor: snapshot.cashDifferenceMinor,
      flagged: snapshot.flagged ?? (snapshot.cashDifferenceMinor !== null && Math.abs(snapshot.cashDifferenceMinor) > toleranceMinor),
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
