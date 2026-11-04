import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ClientSession, Model } from 'mongoose';
import { SettingsService } from '@/settings/settings.service';
import { PosCashierSession, PosCashierSessionDocument } from './pos-cashier-session.schema';
import { PosCashMovement, PosCashMovementDocument, PosCashMovementType } from './pos-cash-movement.schema';

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

export type AddMovementInput = {
  type: PosCashMovementType;
  amountMinor: number;
  reason: string;
  category?: string;
  categoryLabel?: string;
  beneficiary?: string;
  paymentMethod?: string;
  reference?: string;
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

  async resolveCashierName(cashierId: string): Promise<string> {
    try {
      const emp = await this.sessions.db.model<Employee>(Employee.name).findById(cashierId);
      return emp?.name || cashierId;
    } catch {
      return cashierId;
    }
  }

  async resolveTerminalName(terminalId: string): Promise<string> {
    try {
      const term = await this.sessions.db.model<PosTerminal>(PosTerminal.name).findById(terminalId);
      return term?.name || terminalId;
    } catch {
      return terminalId;
    }
  }

  async open(cashierId: string, terminalId: string, registerId: string | null, openingCashMinor: number, note?: string): Promise<PosCashierSessionDocument> {
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
          closingNote: note?.trim() || null,
        }], { session: txn });
        await this.recordMovement(doc, 'OPENING_FUND', openingCashMinor, cashierId, note?.trim() || 'Fond initial', txn, undefined, `open:${doc.id}`, {
          category: 'FLOAT_ADD',
          categoryLabel: 'Fond de caisse initial',
        });
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

  async recordMovement(
    doc: PosCashierSessionDocument,
    type: PosCashMovementType,
    amountMinor: number,
    performedBy: string,
    reason: string,
    txn?: ClientSession,
    saleId?: string,
    operationKey?: string,
    details?: {
      category?: string;
      categoryLabel?: string;
      beneficiary?: string;
      paymentMethod?: string;
      reference?: string;
      performedByName?: string;
    },
  ): Promise<PosCashMovementDocument> {
    const [movement] = await this.movements.create([{
      sessionId: doc.id,
      terminalId: doc.terminalId,
      cashierId: doc.cashierId,
      type,
      amountMinor,
      performedBy,
      performedByName: details?.performedByName ?? null,
      reason,
      saleId,
      operationKey,
      category: details?.category ?? null,
      categoryLabel: details?.categoryLabel ?? null,
      beneficiary: details?.beneficiary ?? null,
      paymentMethod: details?.paymentMethod ?? 'CASH',
      reference: details?.reference ?? null,
    }], { session: txn });
    return movement;
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

  async listMovements(sessionId: string): Promise<PosCashMovementDocument[]> {
    return this.movements.find({ sessionId }).sort({ createdAt: 1 });
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

  async takeover(sessionId: string, newCashierId: string, authorizedBy: string, note?: string): Promise<PosCashierSessionDocument> {
    return this.transaction(async (txn) => {
      const doc = await this.sessions.findOne({ _id: sessionId, status: 'OPEN' }).session(txn);
      if (!doc) throw new ConflictException('Cette session est déjà fermée');
      const prevCashierId = doc.cashierId;
      doc.cashierId = newCashierId;
      await doc.save({ session: txn });
      await this.recordMovement(
        doc,
        'CORRECTION',
        0,
        newCashierId,
        `Reprise de caisse autorisée par ${authorizedBy}: ${note || `Transfert de ${prevCashierId} à ${newCashierId}`}`,
        txn,
        undefined,
        `takeover:${sessionId}:${Date.now()}`,
        {
          category: 'ADJUSTMENT',
          categoryLabel: 'Reprise de caisse autorisée',
          performedByName: authorizedBy,
        },
      );
      return doc;
    });
  }

  async addCashMovement(
    sessionId: string,
    input: AddMovementInput,
    performedBy: string,
    performedByName?: string,
  ): Promise<PosCashMovementDocument> {
    const { type, amountMinor, reason, category, categoryLabel, beneficiary, paymentMethod = 'CASH', reference } = input;
    if (!validateCash(amountMinor) || !amountMinor || !reason.trim() || !['ADD', 'REMOVE', 'CASH_IN', 'CASH_OUT'].includes(type)) {
      throw new BadRequestException('Montant ou motif invalide');
    }

    return this.transaction(async (txn) => {
      const doc = await this.sessions.findOne({ _id: sessionId, status: 'OPEN' }).session(txn);
      if (!doc) throw new ConflictException('Cette session est fermée');

      const incoming = type === 'ADD' || type === 'CASH_IN';
      const isPhysicalCash = paymentMethod.toUpperCase() === 'CASH';

      // Only physical cash movements adjust the drawer expected cash
      if (isPhysicalCash) {
        await this.sessions.updateOne(
          { _id: sessionId, status: 'OPEN' },
          { $inc: { [incoming ? 'cashMovementsAddMinor' : 'cashMovementsRemoveMinor']: amountMinor } },
          { session: txn },
        );
      }

      return this.recordMovement(
        doc,
        incoming ? 'CASH_IN' : 'CASH_OUT',
        amountMinor,
        performedBy,
        reason.trim(),
        txn,
        undefined,
        undefined,
        {
          category,
          categoryLabel,
          beneficiary: beneficiary?.trim(),
          paymentMethod: isPhysicalCash ? 'CASH' : paymentMethod,
          reference: reference?.trim(),
          performedByName,
        },
      );
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
   * sale's old and new totals/payment split, never a full re-add.
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
    const movements = await this.movements.find({ sessionId: doc.id }).sort({ createdAt: 1 }).session(txn ?? null);
    const terminal = await this.sessions.db.model<PosTerminal>(PosTerminal.name).findById(doc.terminalId).session(txn ?? null);
    const cashier = await this.sessions.db.model<Employee>(Employee.name).findById(doc.cashierId).session(txn ?? null);
    const company = await this.settings.getCompany();

    // Derive gross/discounts from immutable price snapshots
    const gross = sales.reduce((sum, sale) => sum + sale.lines.reduce((n, l) => n + (l.regularUnitPriceMinor ?? l.unitPriceMinor) * l.qty, 0), 0);
    const charged = sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
    const methods: Record<string, number> = {};
    for (const p of payments) if (p.status === 'PAID') methods[p.method] = (methods[p.method] ?? 0) + p.amountMinor;

    // Movement categories breakdown
    let supplierExpensesMinor = 0;
    let employeeExpensesMinor = 0;
    let transportExpensesMinor = 0;
    let miscExpensesMinor = 0;
    let cashInflowsMinor = 0;

    for (const m of movements) {
      if (m.type === 'CASH_OUT' || m.type === 'REMOVE') {
        const cat = (m.category || '').toUpperCase();
        if (cat === 'FOURNISSEUR' || cat === 'SUPPLIER') {
          supplierExpensesMinor += m.amountMinor;
        } else if (cat === 'SALAIRE_AVANCE' || cat === 'PAYROLL_ADVANCE') {
          employeeExpensesMinor += m.amountMinor;
        } else if (cat === 'TRANSPORT') {
          transportExpensesMinor += m.amountMinor;
        } else {
          miscExpensesMinor += m.amountMinor;
        }
      } else if (m.type === 'CASH_IN' || m.type === 'ADD') {
        cashInflowsMinor += m.amountMinor;
      }
    }

    // Breakdown of articles / products sold during this session
    const itemQuantities = new Map<string, { description: string; qty: number; totalMinor: number }>();
    for (const sale of sales) {
      if (sale.status !== 'SUSPENDED' && sale.status !== 'CANCELLED') {
        for (const line of sale.lines) {
          const name = line.descriptionSnapshot || 'Article';
          const existing = itemQuantities.get(name);
          if (existing) {
            existing.qty += line.qty;
            existing.totalMinor += line.lineTotalMinor;
          } else {
            itemQuantities.set(name, {
              description: name,
              qty: line.qty,
              totalMinor: line.lineTotalMinor,
            });
          }
        }
      }
    }
    const articlesSold = Array.from(itemQuantities.values()).sort((a, b) => b.qty - a.qty);

    return {
      type,
      generatedAt: new Date(),
      expectedCashMinor,
      countedCashMinor,
      cashDifferenceMinor,
      flagged: cashDifferenceMinor !== null && Math.abs(cashDifferenceMinor) > await this.toleranceMinor(),
      grossSalesMinor: gross,
      refundsMinor: doc.refundsMinor,
      discountsMinor: gross - charged,
      netSalesMinor: charged - doc.refundsMinor,
      cashSalesMinor: doc.cashSalesMinor,
      cardSalesMinor: doc.cardSalesMinor,
      otherSalesMinor: doc.otherSalesMinor,
      cashRefundsMinor: doc.cashRefundsMinor ?? 0,
      cashMovementsAddMinor: doc.cashMovementsAddMinor,
      cashMovementsRemoveMinor: doc.cashMovementsRemoveMinor,
      transactionCount: sales.length,
      details: {
        sessionId: doc.id,
        number: `Z-${doc.id.slice(-6).toUpperCase()}`,
        businessDate: doc.businessDate ?? cashBusinessDate(doc.openedAt),
        company,
        terminalId: doc.terminalId,
        terminalName: terminal?.name ?? doc.terminalId,
        cashierId: doc.cashierId,
        cashierName: cashier?.name ?? doc.cashierId,
        openedAt: doc.openedAt.toISOString(),
        closedAt: doc.closedAt?.toISOString() ?? null,
        openingCashMinor: doc.openingCashMinor,
        closingNote: doc.closingNote,
        payments: methods,
        receiptCount: sales.length,
        averageTicketMinor: sales.length ? Math.round(charged / sales.length) : 0,
        firstReceiptNumber: sales[0]?.saleNumber ?? null,
        lastReceiptNumber: sales.at(-1)?.saleNumber ?? null,
        supplierExpensesMinor,
        employeeExpensesMinor,
        transportExpensesMinor,
        miscExpensesMinor,
        cashInflowsMinor,
        sales: sales.map((sale) => ({
          id: sale.id,
          number: sale.saleNumber,
          createdAt: sale.createdAt,
          cashierId: sale.cashierId,
          totalMinor: sale.totalMinor,
          subtotalMinor: sale.subtotalMinor,
          discountMinor: sale.discountMinor,
          paymentMethod: sale.paymentMethod,
          status: sale.status,
          lines: sale.lines.map((l) => ({
            description: l.descriptionSnapshot,
            qty: l.qty,
            unitPriceMinor: l.unitPriceMinor,
            lineTotalMinor: l.lineTotalMinor,
          })),
        })),
        movements: movements.map((m) => ({
          id: m.id,
          type: m.type,
          category: m.category,
          categoryLabel: m.categoryLabel,
          beneficiary: m.beneficiary,
          paymentMethod: m.paymentMethod,
          amountMinor: m.amountMinor,
          reason: m.reason,
          performedBy: m.performedBy,
          performedByName: m.performedByName,
          createdAt: m.createdAt,
        })),
        articlesSold,
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
      await this.recordMovement(doc, 'CLOSING', countedCashMinor, doc.cashierId, note?.trim() || 'Comptage de clôture', txn, undefined, `close:${doc.id}`, {
        category: 'ADJUSTMENT',
        categoryLabel: 'Comptage de clôture',
      });
      return doc;
    });
  }

  /**
   * Admin-triggered close for a terminal an admin can't physically reach
   * or during an administrative takeover.
   */
  async forceClose(id: string, actorName: string, countedCashMinor?: number, note?: string): Promise<PosCashierSessionDocument> {
    const doc = await this.requireOpen(id);
    const expected = await this.computeExpectedCashMinor(doc);
    const finalCounted = typeof countedCashMinor === 'number' && validateCash(countedCashMinor) ? countedCashMinor : expected;
    const closed = await this.close(id, finalCounted, note || `Fermeture administrative par ${actorName}`);
    closed.reviewNote = note || `Fermeture administrative par ${actorName} — comptage ${typeof countedCashMinor === 'number' ? 'enregistré' : 'théorique'}`;
    await closed.save();
    return closed;
  }

  private toView(
    snapshot: {
      details?: Record<string, unknown>; cashRefundsMinor?: number; flagged?: boolean;
      type: 'X' | 'Z'; generatedAt: Date | string; expectedCashMinor: number; countedCashMinor: number | null;
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
      generatedAt: typeof snapshot.generatedAt === 'string' ? snapshot.generatedAt : snapshot.generatedAt.toISOString(),
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
