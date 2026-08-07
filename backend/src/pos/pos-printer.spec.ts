import { NotFoundException } from '@nestjs/common';
import type { PosRequest } from './guards/pos-terminal.guard';
import { PosPrinterController } from './pos-printer.controller';
import { PosSalesService } from './pos-sales.service';
import { PosTerminalsService } from './pos-terminals.service';

function terminalDoc(overrides: Record<string, unknown> = {}) {
  return {
    printerName: 'EPSON TM-T20',
    paperWidthMm: 80 as const,
    printCopies: 1,
    autoPrint: true,
    autoOpenDrawer: true,
    printLogo: true,
    printQr: true,
    save: jest.fn(),
    ...overrides,
  };
}

describe('PosTerminalsService printer settings', () => {
  it('returns the terminal’s stored printer settings', async () => {
    const doc = terminalDoc();
    const model = { findById: jest.fn().mockResolvedValue(doc) };
    const service = new PosTerminalsService(model as never);

    await expect(service.getPrinterSettings('terminal-1')).resolves.toEqual({
      printerName: 'EPSON TM-T20',
      paperWidthMm: 80,
      printCopies: 1,
      autoPrint: true,
      autoOpenDrawer: true,
      printLogo: true,
      printQr: true,
    });
  });

  it('throws when the terminal doesn’t exist', async () => {
    const model = { findById: jest.fn().mockResolvedValue(null) };
    const service = new PosTerminalsService(model as never);

    await expect(service.getPrinterSettings('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only overwrites fields explicitly present in the patch', async () => {
    const doc = terminalDoc();
    const model = { findById: jest.fn().mockResolvedValue(doc) };
    const service = new PosTerminalsService(model as never);

    const result = await service.updatePrinterSettings('terminal-1', { autoPrint: false });

    expect(doc.autoPrint).toBe(false);
    expect(doc.printerName).toBe('EPSON TM-T20'); // untouched
    expect(doc.paperWidthMm).toBe(80); // untouched
    expect(doc.save).toHaveBeenCalled();
    expect(result.autoPrint).toBe(false);
    expect(result.printerName).toBe('EPSON TM-T20');
  });

  it('accepts an explicit null to clear the configured printer name', async () => {
    const doc = terminalDoc({ printerName: 'EPSON TM-T20' });
    const model = { findById: jest.fn().mockResolvedValue(doc) };
    const service = new PosTerminalsService(model as never);

    const result = await service.updatePrinterSettings('terminal-1', { printerName: null });

    expect(doc.printerName).toBeNull();
    expect(result.printerName).toBeNull();
  });
});

describe('PosSalesService.setPrintStatus', () => {
  // setPrintStatus never touches PosSale.status — a printer failure must
  // never cancel or duplicate a completed sale, only printStatus tracks it.
  function service(doc: unknown) {
    const salesModel = { findById: jest.fn().mockResolvedValue(doc) };
    return new PosSalesService(
      salesModel as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
    );
  }

  it('marks a sale printed and stamps printedAt', async () => {
    const doc = { printStatus: 'pending', printedAt: null as Date | null, save: jest.fn() };
    const result = await service(doc).setPrintStatus('sale-1', 'printed');

    expect(doc.printStatus).toBe('printed');
    expect(doc.printedAt).toBeInstanceOf(Date);
    expect(doc.save).toHaveBeenCalled();
    expect(result.printStatus).toBe('printed');
    expect(result.printedAt).not.toBeNull();
  });

  it('marks a sale failed without inventing a printedAt', async () => {
    const doc = { printStatus: 'pending', printedAt: null as Date | null, save: jest.fn() };
    const result = await service(doc).setPrintStatus('sale-1', 'failed');

    expect(doc.printStatus).toBe('failed');
    expect(doc.printedAt).toBeNull();
    expect(result.printedAt).toBeNull();
  });

  it('leaves a prior printedAt alone on a later failed retry', async () => {
    const printedAt = new Date('2026-01-01T00:00:00.000Z');
    const doc = { printStatus: 'printed', printedAt, save: jest.fn() };

    const result = await service(doc).setPrintStatus('sale-1', 'failed');

    expect(doc.printedAt).toBe(printedAt);
    expect(result.printedAt).toBe(printedAt.toISOString());
  });

  it('throws when the sale doesn’t exist', async () => {
    await expect(service(null).setPrintStatus('missing', 'printed')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('PosPrinterController', () => {
  function controller(terminals: Partial<PosTerminalsService>, sales: Partial<PosSalesService>) {
    return new PosPrinterController(terminals as PosTerminalsService, sales as PosSalesService);
  }
  const req = { posTerminalId: 'terminal-1' } as never as PosRequest;

  it('reads settings for the calling terminal', () => {
    const getPrinterSettings = jest.fn().mockReturnValue({ printerName: null });
    controller({ getPrinterSettings }, {}).getSettings(req);
    expect(getPrinterSettings).toHaveBeenCalledWith('terminal-1');
  });

  it('forwards a settings patch to the calling terminal', () => {
    const updatePrinterSettings = jest.fn().mockReturnValue({});
    const dto = { autoPrint: false };
    controller({ updatePrinterSettings }, {}).updateSettings(dto, req);
    expect(updatePrinterSettings).toHaveBeenCalledWith('terminal-1', dto);
  });

  it('rejects a print-status update for a sale that doesn’t exist', async () => {
    const setPrintStatus = jest.fn();
    const getById = jest.fn().mockResolvedValue(null);
    await expect(
      controller({}, { getById, setPrintStatus }).updatePrintStatus('sale-1', { status: 'printed' }, req),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(setPrintStatus).not.toHaveBeenCalled();
  });

  // One till must never be able to overwrite another till's sale — this
  // ownership check lives only in the controller (setPrintStatus itself is
  // terminal-agnostic), so it has to be exercised here, not at the service.
  it('rejects a print-status update for a sale that belongs to a different terminal', async () => {
    const setPrintStatus = jest.fn();
    const getById = jest.fn().mockResolvedValue({ id: 'sale-1', terminalId: 'terminal-2' });
    await expect(
      controller({}, { getById, setPrintStatus }).updatePrintStatus('sale-1', { status: 'printed' }, req),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(setPrintStatus).not.toHaveBeenCalled();
  });

  it('updates the print status once terminal ownership checks out', async () => {
    const setPrintStatus = jest.fn().mockResolvedValue({ printStatus: 'printed', printedAt: '2026-01-01T00:00:00.000Z' });
    const getById = jest.fn().mockResolvedValue({ id: 'sale-1', terminalId: 'terminal-1' });
    const result = await controller({}, { getById, setPrintStatus }).updatePrintStatus('sale-1', { status: 'printed' }, req);
    expect(setPrintStatus).toHaveBeenCalledWith('sale-1', 'printed');
    expect(result.printStatus).toBe('printed');
  });
});
