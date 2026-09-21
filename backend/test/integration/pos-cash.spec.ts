import { Variant, VariantSchema } from '@/catalog/variant.schema';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Connection, createConnection, Types } from 'mongoose';
import { PosCashierSession, PosCashierSessionSchema } from '@/pos/pos-cashier-session.schema';
import { PosCashMovement, PosCashMovementSchema } from '@/pos/pos-cash-movement.schema';
import { PosDailyZ, PosDailyZSchema } from '@/pos/pos-daily-z.schema';
import { PosSale, PosSaleSchema } from '@/pos/pos-sale.schema';
import { PosPayment, PosPaymentSchema } from '@/pos/pos-payment.schema';
import { PosTerminal, PosTerminalSchema } from '@/pos/pos-terminal.schema';
import { Employee, EmployeeSchema } from '@/users/employee.schema';
import { StockItem, StockItemSchema } from '@/inventory/stock-item.schema';
import { StockMovement, StockMovementSchema } from '@/inventory/stock-movement.schema';
import { Counter, CounterSchema } from '@/database/counter.schema';
import { CountersService } from '@/database/counters.service';
import { StockLedgerService } from '@/inventory/stock-ledger.service';
import { PosSessionsService } from '@/pos/pos-sessions.service';
import { PosSalesService, PosSaleContext } from '@/pos/pos-sales.service';
import { PosDailyZService } from '@/pos/pos-daily-z.service';
import { PosHardwareController } from '@/pos/pos-hardware.controller';
import { expectedCash, cashBusinessDate } from '@/pos/cash-accounting';
import { renderTicketZPdf } from '@/pos/ticket-z-pdf';

// Opt-in isolated replica set only. Never use the application's configured database.
const uri = process.env.POS_CASH_TEST_URI;
const suite = uri ? describe : describe.skip;
suite('Cash sessions with real MongoDB transactions', () => {
  let db: Connection;
  let sessions: PosSessionsService;
  let sales: PosSalesService;
  let stock: StockLedgerService;
  let days: PosDailyZService;
  let ctx: PosSaleContext;
  const variantId = new Types.ObjectId().toString();
  const productId = new Types.ObjectId().toString();
  const settings = { getInventorySettings: jest.fn(async () => ({ enabled: true })), getRaw: jest.fn(async () => ({ cashToleranceMinor: 1000 })), getCompany: jest.fn(async () => ({ legalName: 'Ahmed Mzali Boutique', address: 'Tunis', phone: '', matriculeFiscal: '', rcNumber: '' })) };
  beforeAll(async () => {
    if (!uri?.includes('mzali_cash_test')) throw new Error('Use an isolated mzali_cash_test database');
    db = await createConnection(uri).asPromise();
    db.model<PosCashierSession>(PosCashierSession.name, PosCashierSessionSchema);
    db.model<PosCashMovement>(PosCashMovement.name, PosCashMovementSchema);
    db.model<PosDailyZ>(PosDailyZ.name, PosDailyZSchema);
    db.model<PosSale>(PosSale.name, PosSaleSchema);
    db.model<PosPayment>(PosPayment.name, PosPaymentSchema);
    db.model<PosTerminal>(PosTerminal.name, PosTerminalSchema);
    db.model<Employee>(Employee.name, EmployeeSchema);
    db.model(Variant.name, VariantSchema);
    db.model<StockItem>(StockItem.name, StockItemSchema);
    db.model<StockMovement>(StockMovement.name, StockMovementSchema);
    db.model<Counter>(Counter.name, CounterSchema);
    await Promise.all(Object.values(db.models).map((m) => m.init()));
    sessions = new PosSessionsService(db.model<PosCashierSession>(PosCashierSession.name), db.model<PosCashMovement>(PosCashMovement.name), settings as never);
    stock = new StockLedgerService(db.model<StockItem>(StockItem.name), db.model<StockMovement>(StockMovement.name), { publish: jest.fn(async () => 0) } as never);
    sales = new PosSalesService(
      db.model<PosSale>(PosSale.name), db.model<PosPayment>(PosPayment.name), db.model<Employee>(Employee.name), {} as never, {} as never,
      { getById: async () => ({ name: 'Chemise', price: 1, categoryIds: [] }) } as never,
      { findById: async (id: string) => db.model(Variant.name).findById(id) } as never,
      stock, new CountersService(db.model<Counter>(Counter.name)), sessions,
      {} as never, {} as never, {} as never, settings as never, db,
    );
    days = new PosDailyZService(db.model<PosDailyZ>(PosDailyZ.name), db.model<PosCashierSession>(PosCashierSession.name), sessions, settings as never);
  });
  afterAll(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    settings.getInventorySettings.mockResolvedValue({ enabled: true });
    await Promise.all(Object.values(db.models).map((m) => m.deleteMany({})));
    await db.model(Variant.name).create({ _id: variantId, productId, active: true, sku: 'TEST', attributes: {}, sellingPriceMinor: 1000 });
    const cashier = await db.model<Employee>(Employee.name).create({ email: 'cash@test.invalid', name: 'Caissier Test', role: 'cashier', passwordHash: { algo: 'argon2id', hash: 'unused-test' } });
    const terminal = await db.model<PosTerminal>(PosTerminal.name).create({ terminalCode: 'T1', name: 'Terminal 1', locationId: 'BOUTIQUE', deviceFingerprint: 'test' });
    ctx = { terminalId: terminal.id, cashierId: cashier.id, cashierName: cashier.name, cashierRole: 'cashier', locationId: 'BOUTIQUE' };
    await db.model<StockItem>(StockItem.name).create([{ variantId, locationId: 'BOUTIQUE', quantityOnHand: 10000 }, { variantId, locationId: 'DEPOT', quantityOnHand: 10000 }]);
  });
  it('sells the Boutique product identity without size or color while preserving Depot stock', async () => {
    await open();
    const pool = await stock.boutiqueVariant(productId);
    const result = await sales.create({ lines: [{ variantId: pool.id, qty: 1 }], payments: [{ method: 'CASH', amountMinor: 1000 }] }, ctx, randomUUID());
    expect(result.lines[0].variantId).toBe(pool.id);
    expect(result.lines[0].variantAttributesSnapshot).toEqual({});
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(9999);
    expect((await db.model(StockItem.name).findOne({ variantId, locationId: 'DEPOT' }))!.quantityOnHand).toBe(10000);
  });
  const open = (amount = 200000) => sessions.open(ctx.cashierId, ctx.terminalId, null, amount);
  const sale = (amount: number, method: 'CASH' | 'CARD' = 'CASH', key = randomUUID()) => sales.create({ lines: [{ variantId, qty: amount / 1000 }], payments: [{ method, amountMinor: amount }] }, ctx, key);

  it.each([0, 200000])('opens with %i and saves the immutable opening ledger', async (amount) => {
    const doc = await open(amount);
    expect(expectedCash(doc)).toBe(amount);
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments({ sessionId: doc.id, type: 'OPENING_FUND', amountMinor: amount })).toBe(1);
    await db.model<PosCashierSession>(PosCashierSession.name).updateOne({ _id: doc.id }, { $set: { openingCashMinor: 999 } });
    expect((await sessions.getById(doc.id)).openingCashMinor).toBe(amount);
  });

  it('allows exactly one concurrent opening on the same terminal', async () => {
    const result = await Promise.allSettled([open(), open()]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.model<PosCashierSession>(PosCashierSession.name).countDocuments({ status: 'OPEN' })).toBe(1);
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments({ type: 'OPENING_FUND' })).toBe(1);
  });

  it('keeps cash separate from cards, refunds, manual withdrawals and the closing count', async () => {
    const doc = await open();
    await sale(25000);
    expect(expectedCash(await sessions.getById(doc.id))).toBe(225000);
    await sale(33000);
    expect(expectedCash(await sessions.getById(doc.id))).toBe(258000);
    await sale(100000, 'CARD');
    expect(expectedCash(await sessions.getById(doc.id))).toBe(258000);
    // A 20 DT partial correction of the first receipt: stock and payments move together.
    const first = await db.model<PosSale>(PosSale.name).findOne({ totalMinor: 25000 });
    await sales.update(first!.id, { lines: [{ variantId, qty: 5 }], payments: [{ method: 'CASH', amountMinor: 5000 }], reason: 'Retour partiel 20 DT' }, { type: 'employee', id: ctx.cashierId, name: ctx.cashierName });
    expect(expectedCash(await sessions.getById(doc.id))).toBe(238000);
    await sessions.addCashMovement(doc.id, 'REMOVE', 30000, 'Dépôt au coffre', ctx.cashierId);
    expect(expectedCash(await sessions.getById(doc.id))).toBe(208000);
    await sessions.close(doc.id, 205000, 'Écart constaté');
    const report = await sessions.report(doc.id, 'Z');
    expect(report.cashDifferenceMinor).toBe(-3000);
    expect(report.details?.payments).toEqual({ CASH: 38000, CARD: 100000 });
    expect((await db.model<StockItem>(StockItem.name).findOne({ locationId: 'DEPOT' }))!.quantityOnHand).toBe(10000);
  });

  it('refunds/cancels exactly once with the original payment methods', async () => {
    const doc = await open();
    const cashSale = await sale(20000);
    const cardSale = await sale(100000, 'CARD');
    const actor = { type: 'employee' as const, id: ctx.cashierId, name: ctx.cashierName };
    await Promise.all([sales.cancel(cashSale.doc.id, actor), sales.cancel(cashSale.doc.id, actor)]);
    await sales.cancel(cardSale.doc.id, actor);
    const current = await sessions.getById(doc.id);
    expect(expectedCash(current)).toBe(200000);
    expect(current.cashRefundsMinor).toBe(20000);
    expect(current.refundsMinor).toBe(120000);
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments({ type: 'CASH_REFUND' })).toBe(1);
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(10000);
  });

  it('deduplicates concurrent sale retries across payments, cash and boutique stock', async () => {
    await open();
    const key = randomUUID();
    const result = await Promise.all([sale(25000, 'CASH', key), sale(25000, 'CASH', key)]);
    expect(result[0].doc.id).toBe(result[1].doc.id);
    expect(await db.model<PosSale>(PosSale.name).countDocuments()).toBe(1);
    expect(await db.model<PosPayment>(PosPayment.name).countDocuments()).toBe(1);
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments({ type: 'CASH_SALE' })).toBe(1);
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(9975);
  });

  it('records mixed cash/card/bank payments and gross discounts without inflating cash', async () => {
    const doc = await open();
    await sales.create({ lines: [{ variantId, qty: 120 }], discountMinor: 10000, payments: [{ method: 'CASH', amountMinor: 25000 }, { method: 'CARD', amountMinor: 75000 }, { method: 'BANK_TRANSFER', amountMinor: 10000 }], cashTenderedMinor: 50000 }, ctx, randomUUID());
    const x = await sessions.report(doc.id, 'X');
    expect(x.expectedCashMinor).toBe(225000);
    expect(x.grossSalesMinor).toBe(120000);
    expect(x.discountsMinor).toBe(10000);
    expect(x.netSalesMinor).toBe(110000);
    expect(x.details?.payments).toEqual({ CASH: 25000, CARD: 75000, BANK_TRANSFER: 10000 });
    expect(await db.model<PosPayment>(PosPayment.name).countDocuments()).toBe(3);
  });

  it('rolls back stock and every financial write when the cash tender is insufficient', async () => {
    const doc = await open();
    await expect(sales.create({ lines: [{ variantId, qty: 25 }], payments: [{ method: 'CASH', amountMinor: 25000 }], cashTenderedMinor: 10000 }, ctx, randomUUID())).rejects.toThrow();
    expect(expectedCash(await sessions.getById(doc.id))).toBe(200000);
    expect(await db.model<PosSale>(PosSale.name).countDocuments()).toBe(0);
    expect(await db.model<StockMovement>(StockMovement.name).countDocuments()).toBe(0);
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(10000);
  });

  it('rejects a stale day finalization racing a new session', async () => {
    const doc = await open();
    await sessions.close(doc.id, 200000);
    const date = cashBusinessDate(doc.openedAt);
    const result = await Promise.allSettled([days.finalize(date, ctx.cashierId), open()]);
    const day = await days.get(date);
    const count = await db.model<PosCashierSession>(PosCashierSession.name).countDocuments({ status: 'OPEN' });
    expect(day.status === 'CLOSED' && count > 0).toBe(false);
    expect(result.some((r) => r.status === 'fulfilled')).toBe(true);
  });

  it('can finalize and reprint a legacy session Z without recomputing its original totals', async () => {
    const doc = await open();
    await sale(25000);
    await sessions.close(doc.id, 225000);
    await db.model<PosCashierSession>(PosCashierSession.name).updateOne({ _id: doc.id }, { $unset: { 'reports.0.details': '', businessDate: '' } });
    const legacy = await sessions.report(doc.id, 'Z');
    const day = await days.finalize(cashBusinessDate(doc.openedAt), ctx.cashierId);
    expect(day.totals.netSalesMinor).toBe(legacy.netSalesMinor);
    expect(day.payments.CASH).toBe(25000);
    expect((await renderTicketZPdf(day)).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('serializes sale vs close and stores one consistent Z even on closure retries', async () => {
    const doc = await open();
    await Promise.allSettled([sale(25000), sessions.close(doc.id, 200000)]);
    await sessions.close(doc.id, 999000);
    const closed = await sessions.getById(doc.id);
    const report = await sessions.report(doc.id, 'Z');
    expect(closed.reports).toHaveLength(1);
    expect(closed.closingCountedCashMinor).toBe(200000);
    expect(report.expectedCashMinor).toBe(expectedCash(closed));
    expect(report.transactionCount).toBe(await db.model<PosSale>(PosSale.name).countDocuments());
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments({ type: 'CLOSING' })).toBe(1);
    await expect(sale(1000)).rejects.toThrow();
    await expect(sessions.addCashMovement(doc.id, 'ADD', 1000, 'Late', ctx.cashierId)).rejects.toThrow();
  });

  it('restores the same register after a fresh service instance and rejects other cashier/terminal access', async () => {
    const doc = await open();
    await sale(25000);
    const fresh = new PosSessionsService(db.model<PosCashierSession>(PosCashierSession.name), db.model<PosCashMovement>(PosCashMovement.name), settings as never);
    expect((await fresh.getOpenForTerminal(ctx.terminalId))!.id).toBe(doc.id);
    expect(expectedCash((await fresh.getOpenForTerminal(ctx.terminalId))!)).toBe(225000);
    await expect(sessions.assertAccess(doc.id, 'other-terminal', ctx.cashierId, true)).rejects.toThrow();
    await expect(sessions.assertAccess(doc.id, ctx.terminalId, 'other-cashier')).rejects.toThrow();
    await expect(sessions.assertAccess(doc.id, ctx.terminalId, ctx.cashierId)).resolves.toBeDefined();
  });

  it('manual drawer events never create financial movements', async () => {
    const doc = await open();
    const hardware = new PosHardwareController({ log: jest.fn() } as never, sales);
    await hardware.authorizeManual({ reason: 'manual' } as never, { userId: ctx.cashierId, name: ctx.cashierName } as never, { posTerminalId: ctx.terminalId } as never, 'T1');
    expect(expectedCash(await sessions.getById(doc.id))).toBe(200000);
    expect(await db.model<PosCashMovement>(PosCashMovement.name).countDocuments()).toBe(1);
  });

  it('consolidates multiple sessions and freezes historical data, names and PDF content', async () => {
    const first = await open();
    const sold = await sale(25000);
    const date = cashBusinessDate(first.openedAt);
    await expect(days.finalize(date, ctx.cashierId)).rejects.toThrow();
    await sessions.close(first.id, 225000);
    const secondCashier = await db.model<Employee>(Employee.name).create({ email: 'cash2@test.invalid', name: 'Deuxième caissier', role: 'cashier', passwordHash: { algo: 'argon2id', hash: 'unused-test' } });
    ctx = { ...ctx, cashierId: secondCashier.id, cashierName: secondCashier.name };
    const second = await open(100000);
    await sale(100000, 'CARD');
    await sessions.close(second.id, 100000);
    const final = await days.finalize(date, ctx.cashierId);
    expect(final.sessions).toHaveLength(2);
    expect(final.payments).toEqual({ CASH: 25000, CARD: 100000 });
    expect(final.totals.openingCashMinor).toBe(300000);
    expect(final.totals.expectedCashMinor).toBe(325000);
    const original = JSON.stringify(final);
    await expect(sales.update(sold.doc.id, { notes: 'after closure', reason: 'test' }, { type: 'employee', id: ctx.cashierId, name: ctx.cashierName })).rejects.toThrow();
    await expect(open()).rejects.toThrow();
    await db.model<Employee>(Employee.name).updateOne({ _id: ctx.cashierId }, { name: 'New name' });
    settings.getCompany.mockResolvedValueOnce({ legalName: 'Changed', address: '', phone: '', matriculeFiscal: '', rcNumber: '' });
    expect(JSON.stringify(await days.get(date))).toBe(original);
    expect(JSON.stringify(await days.finalize(date, ctx.cashierId))).toBe(original);
    const pdf = await renderTicketZPdf(await days.get(date));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
    if (process.env.POS_CASH_PDF_QA) { mkdirSync('../tmp/pdfs', { recursive: true }); writeFileSync('../tmp/pdfs/ticket-z-qa.pdf', pdf); }
  });
  it('deducts only Boutique and restores tracked POS cancellations after a mode switch', async () => {
    await open(); const sold = await sale(2000);
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(9998);
    expect((await db.model(StockItem.name).findOne({ variantId, locationId: 'DEPOT' }))!.quantityOnHand).toBe(10000);
    settings.getInventorySettings.mockResolvedValue({ enabled: false });
    await sales.cancel(sold.doc.id, { type: 'employee', id: ctx.cashierId, name: ctx.cashierName });
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(10000);
  });
  it('sells at zero stock in POS mode sans stock without later phantom returns', async () => {
    await open();
    await db.model(StockItem.name).updateOne({ variantId, locationId: 'BOUTIQUE' }, { $set: { quantityOnHand: 0 } });
    settings.getInventorySettings.mockResolvedValue({ enabled: false });
    const sold = await sale(2000);
    expect(sold.doc.stockTracked).toBe(false);
    settings.getInventorySettings.mockResolvedValue({ enabled: true });
    await sales.cancel(sold.doc.id, { type: 'employee', id: ctx.cashierId, name: ctx.cashierName });
    expect((await stock.boutiqueBalance(productId)).onHand).toBe(0);
    expect(await db.model(StockMovement.name).countDocuments()).toBe(0);
  });

});
