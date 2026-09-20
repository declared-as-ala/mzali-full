import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PosCashierSession } from './pos-cashier-session.schema';
import { PosDailyZ } from './pos-daily-z.schema';
import { PosSessionsService } from './pos-sessions.service';
import { cashBusinessDate } from './cash-accounting';
import { SettingsService } from '@/settings/settings.service';

export type ArchivedSession = {
  id: string; terminalId: string; cashierId: string; terminalName: string; cashierName: string;
  openedAt: string; closedAt: string | null; openingCashMinor: number; closingNote: string | null;
  report: Record<string, unknown>;
};
export type DailyZView = {
  date: string; number: string; status: 'OPEN' | 'CLOSED'; closedAt: string | null;
  company: Record<string, unknown>; totals: Record<string, number>; payments: Record<string, number>;
  sessions: ArchivedSession[]; openSessionCount: number; firstReceiptNumber: number | null; lastReceiptNumber: number | null;
};

export function consolidateDay(date: string, sessions: ArchivedSession[]): DailyZView {
  const totals: Record<string, number> = {};
  const payments: Record<string, number> = {};
  const fields = ['grossSalesMinor', 'discountsMinor', 'refundsMinor', 'netSalesMinor', 'cashSalesMinor', 'cardSalesMinor', 'otherSalesMinor', 'cashRefundsMinor', 'cashMovementsAddMinor', 'cashMovementsRemoveMinor', 'expectedCashMinor', 'countedCashMinor', 'cashDifferenceMinor', 'transactionCount'];
  const receiptNumbers: number[] = [];
  for (const s of sessions) {
    for (const key of fields) totals[key] = (totals[key] ?? 0) + Number(s.report[key] ?? 0);
    totals.openingCashMinor = (totals.openingCashMinor ?? 0) + s.openingCashMinor;
    const details = (s.report.details ?? {}) as Record<string, unknown>;
    const archivedPayments = details.payments ?? { CASH: Number(s.report.cashSalesMinor ?? 0) - Number(s.report.cashRefundsMinor ?? 0), CARD: Number(s.report.cardSalesMinor ?? 0), OTHER: Number(s.report.otherSalesMinor ?? 0) };
    for (const [key, value] of Object.entries(archivedPayments as Record<string, number>)) payments[key] = (payments[key] ?? 0) + value;
    for (const key of ['firstReceiptNumber', 'lastReceiptNumber']) if (typeof details[key] === 'number') receiptNumbers.push(details[key] as number);
  }
  for (const key of fields) totals[key] ??= 0;
  totals.openingCashMinor ??= 0;
  totals.averageTicketMinor = totals.transactionCount ? Math.round((totals.netSalesMinor + totals.refundsMinor) / totals.transactionCount) : 0;
  return {
    date, number: `Z-${date.replaceAll('-', '')}`, status: 'OPEN', closedAt: null,
    company: ((sessions[0]?.report.details as Record<string, unknown> | undefined)?.company ?? {}) as Record<string, unknown>,
    totals, payments, sessions, openSessionCount: sessions.filter((s) => !s.closedAt).length,
    firstReceiptNumber: receiptNumbers.length ? Math.min(...receiptNumbers) : null,
    lastReceiptNumber: receiptNumbers.length ? Math.max(...receiptNumbers) : null,
  };
}

@Injectable()
export class PosDailyZService {
  constructor(
    @InjectModel(PosDailyZ.name) private readonly days: Model<PosDailyZ>,
    @InjectModel(PosCashierSession.name) private readonly sessions: Model<PosCashierSession>,
    private readonly cashSessions: PosSessionsService,
    private readonly settings: SettingsService,
  ) {}

  private validateDate(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new BadRequestException('Date invalide');
  }

  private dateQuery(date: string) {
    this.validateDate(date);
    const start = new Date(`${date}T00:00:00+01:00`);
    const end = new Date(start.getTime() + 86400000);
    return { $or: [{ businessDate: date }, { businessDate: { $exists: false }, openedAt: { $gte: start, $lt: end } }] };
  }

  async get(date: string): Promise<DailyZView> {
    const query = this.dateQuery(date);
    const stored = await this.days.findOne({ date, status: 'CLOSED' });
    if (stored?.snapshot) return stored.snapshot as unknown as DailyZView;
    const docs = await this.sessions.find(query).sort({ openedAt: 1 });
    if (!docs.length) throw new NotFoundException('Aucune session pour cette journée');
    const sessions: ArchivedSession[] = [];
    for (const doc of docs) {
      const report = await this.cashSessions.report(doc.id, doc.status === 'CLOSED' ? 'Z' : 'X');
      const details = report.details ?? {};
      sessions.push({
        id: doc.id, terminalId: doc.terminalId, cashierId: doc.cashierId,
        terminalName: String(details.terminalName ?? doc.terminalId), cashierName: String(details.cashierName ?? doc.cashierId),
        openedAt: doc.openedAt.toISOString(), closedAt: doc.closedAt?.toISOString() ?? null,
        openingCashMinor: doc.openingCashMinor, closingNote: doc.closingNote ?? null, report,
      });
    }
    const result = consolidateDay(date, sessions);
    if (!Object.keys(result.company).length) result.company = { ...await this.settings.getCompany() };
    return result;
  }

  async list(from?: string, to?: string, terminalId?: string, cashierId?: string) {
    if (from) this.validateDate(from);
    if (to) this.validateDate(to);
    if (from && to && from > to) throw new BadRequestException('Période invalide');
    const dateExpr = { $ifNull: ['$businessDate', { $dateToString: { date: '$openedAt', format: '%Y-%m-%d', timezone: 'Africa/Tunis' } }] };
    const rows = await this.sessions.aggregate<{ _id: string }>([
      { $addFields: { day: dateExpr } },
      { $match: { ...(from || to ? { day: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } } : {}), ...(terminalId ? { terminalId } : {}), ...(cashierId ? { cashierId } : {}) } },
      { $group: { _id: '$day' } }, { $sort: { _id: -1 } }, { $limit: 366 },
    ]);
    // Filters select days; totals always remain the complete consolidated day.
    const result: DailyZView[] = [];
    for (const row of rows) result.push(await this.get(row._id));
    return result;
  }

  async finalize(date: string, actorId: string): Promise<DailyZView> {
    const snapshot = await this.get(date);
    if (snapshot.status === 'CLOSED') return snapshot;
    if (snapshot.openSessionCount) throw new ConflictException('Fermez toutes les sessions de cette journée avant de clôturer le Ticket Z');
    if (date > cashBusinessDate(new Date())) throw new BadRequestException('Journée future');
    return this.cashSessions.transaction(async (txn) => {
      const existing = await this.days.findOne({ date }).session(txn);
      if (existing?.status === 'CLOSED') return existing.snapshot as unknown as DailyZView;
      await this.cashSessions.touchDay(date, txn); // Serializes finalization against new openings/closures.
      const docs = await this.sessions.find(this.dateQuery(date)).session(txn);
      if (docs.some((s) => s.status !== 'CLOSED') || docs.length !== snapshot.sessions.length || docs.some((s) => !snapshot.sessions.some((item) => item.id === s.id))) {
        throw new ConflictException('La journée a changé, actualisez avant de clôturer');
      }
      const now = new Date();
      const final: DailyZView = { ...snapshot, status: 'CLOSED', closedAt: now.toISOString() };
      await this.days.updateOne({ date, status: 'OPEN' }, { $set: { status: 'CLOSED', closedAt: now, closedBy: actorId, snapshot: final } }, { session: txn });
      return final;
    });
  }
}
