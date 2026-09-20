import PDFDocument from 'pdfkit';
import { DailyZView } from './pos-daily-z.service';

/** Renders only the persisted archive, never HTML or current sales. */
export function renderTicketZPdf(z: DailyZView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: `Ticket ${z.number}`, Author: String(z.company.legalName ?? '') } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const money = (n: number) => `${(n / 1000).toFixed(3)} DT`;
    const line = (label: string, value: string) => {
      if (doc.y > 735) doc.addPage();
      const y = doc.y;
      doc.font('Helvetica').fontSize(10).text(label, 48, y, { width: 315 });
      doc.text(value, 365, y, { width: 180, align: 'right' });
      doc.y = Math.max(doc.y, y + 16);
    };
    const section = (title: string) => {
      if (doc.y > 690) doc.addPage();
      doc.moveDown(0.7).font('Helvetica-Bold').fontSize(12).text(title, 48).moveDown(0.5);
    };
    doc.font('Helvetica-Bold').fontSize(20).text('TICKET Z');
    doc.fontSize(12).text(String(z.company.legalName || 'Boutique'));
    doc.font('Helvetica').fontSize(10).text(String(z.company.address || '')).moveDown();
    line('Journée de caisse (Africa/Tunis)', z.date);
    line('Numéro', z.number);
    line('Clôture définitive', new Date(z.closedAt!).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false }));
    section('VENTES');
    for (const [label, key] of [['Ventes brutes', 'grossSalesMinor'], ['Remises et offres', 'discountsMinor'], ['Remboursements / annulations', 'refundsMinor'], ['Ventes nettes', 'netSalesMinor']]) line(label, money(z.totals[key]));
    section('PAIEMENTS NETS');
    const labels: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', OTHER: 'Autre', MIXED_COMPONENT: 'Autre (historique)' };
    for (const [method, value] of Object.entries(z.payments)) line(labels[method] ?? method, money(value));
    section('ESPÈCES');
    for (const [label, key] of [['Fonds initiaux cumulés', 'openingCashMinor'], ['Ventes espèces', 'cashSalesMinor'], ['Retours espèces', 'cashRefundsMinor'], ['Entrées manuelles', 'cashMovementsAddMinor'], ['Sorties manuelles', 'cashMovementsRemoveMinor'], ['Solde théorique cumulé', 'expectedCashMinor'], ['Comptages cumulés', 'countedCashMinor'], ['Écart', 'cashDifferenceMinor']]) line(label, money(z.totals[key]));
    section('TICKETS');
    line('Nombre de tickets', String(z.totals.transactionCount));
    line('Panier moyen avant retours', money(z.totals.averageTicketMinor));
    line('Premier / dernier ticket', `${z.firstReceiptNumber ?? '-'} / ${z.lastReceiptNumber ?? '-'}`);
    section('SESSIONS ET CAISSIERS');
    for (const session of z.sessions) {
      if (doc.y > 710) { doc.addPage(); section('SESSIONS ET CAISSIERS (suite)'); }
      doc.font('Helvetica-Bold').fontSize(10).text(`${session.terminalName} - ${session.cashierName}`, 48, doc.y, { width: 495 });
      doc.font('Helvetica').fontSize(9).text(`${new Date(session.openedAt).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false })} - ${new Date(session.closedAt!).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false })}`);
      line('Fond / compté / écart', `${money(session.openingCashMinor)} / ${money(Number(session.report.countedCashMinor ?? 0))} / ${money(Number(session.report.cashDifferenceMinor ?? 0))}`);
      if (session.closingNote) doc.fontSize(9).text(session.closingNote, 48, doc.y, { width: 495 });
      doc.moveDown(0.5);
    }
    doc.moveDown().fontSize(8).text('Archive définitive. Les fonds et comptages sont cumulés par session ; un fond réutilisé est compté à chaque ouverture.', 48, doc.y, { width: 495 });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(`${z.number} | ${i + 1} / ${range.count}`, 48, 780, { width: 495, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
