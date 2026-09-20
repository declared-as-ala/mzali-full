import PDFDocument from 'pdfkit';
import { DailyZView } from './pos-daily-z.service';

/** Final reports use the saved archive; open days are explicitly provisional. */
export function renderTicketZPdf(z: DailyZView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, left: 48, right: 48, bottom: 82 }, bufferPages: true, info: { Title: `Ticket ${z.number}`, Author: String(z.company.legalName ?? '') } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const ink = '#172554', accent = '#4f46e5', muted = '#64748b';
    const provisional = z.status !== 'CLOSED';
    const stamp = (value: string | null) => value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false }) : 'En cours';
    const money = (n: number) => `${((n ?? 0) / 1000).toFixed(3)} DT`;
    doc.on('pageAdded', () => { doc.rect(48, 32, 499, 3).fill(accent); doc.fillColor(ink); });
    const line = (label: string, value: string) => {
      if (doc.y > 735) doc.addPage();
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica').fontSize(10).text(label, 48, y, { width: 280 });
      doc.fillColor(ink).font('Helvetica-Bold').text(value, 330, y, { width: 215, align: 'right' });
      doc.y = Math.max(doc.y, y + 16);
    };
    const section = (title: string) => {
      if (doc.y > 690) doc.addPage();
      const y = doc.y + 5;
      doc.roundedRect(48, y, 499, 22, 4).fill('#eef2ff');
      doc.rect(48, y + 5, 3, 14).fill(accent);
      doc.fillColor(accent).font('Helvetica-Bold').fontSize(10).text(title, 59, y + 7, { width: 475 });
      doc.y = y + 26;
    };
    doc.roundedRect(48, 40, 499, 82, 8).fill(ink);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(25).text('TICKET Z', 64, 55);
    doc.fontSize(10).fillColor('#c7d2fe').text('RAPPORT QUOTIDIEN DE CAISSE', 64, 89);
    doc.roundedRect(390, 58, 140, 25, 12).fill(provisional ? '#fef3c7' : '#d1fae5');
    doc.fillColor(provisional ? '#92400e' : '#065f46').fontSize(9).text(provisional ? 'PROVISOIRE' : 'ARCHIVE DÉFINITIVE', 395, 66, { width: 130, align: 'center' });
    doc.y = 137;
    doc.fillColor(ink).fontSize(12).text(String(z.company.legalName || 'Boutique'), 48);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(String(z.company.address || '')).moveDown(0.5);
    line('Journée de caisse (Africa/Tunis)', z.date);
    line('Numéro', z.number);
    line(provisional ? 'État de la journée' : 'Clôture définitive', provisional ? `${z.openSessionCount} session(s) ouverte(s)` : stamp(z.closedAt));
    section('VENTES');
    for (const [label, key] of [['Ventes brutes', 'grossSalesMinor'], ['Remises et offres', 'discountsMinor'], ['Remboursements / annulations', 'refundsMinor'], ['Ventes nettes', 'netSalesMinor']]) line(label, money(z.totals[key]));
    section('PAIEMENTS NETS');
    const labels: Record<string, string> = { CASH: 'Espèces', CARD: 'Carte', BANK_TRANSFER: 'Virement', OTHER: 'Autre', MIXED_COMPONENT: 'Autre (historique)' };
    for (const [method, value] of Object.entries(z.payments)) line(labels[method] ?? method, money(value));
    section('ESPÈCES');
    for (const [label, key] of [['Fonds initiaux cumulés', 'openingCashMinor'], ['Ventes espèces', 'cashSalesMinor'], ['Retours espèces', 'cashRefundsMinor'], ['Entrées manuelles', 'cashMovementsAddMinor'], ['Sorties manuelles', 'cashMovementsRemoveMinor'], ['Solde théorique cumulé', 'expectedCashMinor'], ['Comptages cumulés', 'countedCashMinor'], ['Écart', 'cashDifferenceMinor']]) line(label, z.openSessionCount && ['countedCashMinor', 'cashDifferenceMinor'].includes(key) ? 'En cours' : money(z.totals[key]));
    section('TICKETS');
    line('Nombre de tickets', String(z.totals.transactionCount));
    line('Panier moyen avant retours', money(z.totals.averageTicketMinor));
    line('Premier / dernier ticket', `${z.firstReceiptNumber ?? '-'} / ${z.lastReceiptNumber ?? '-'}`);
    section('SESSIONS ET CAISSIERS');
    for (const session of z.sessions) {
      if (doc.y > 710) { doc.addPage(); section('SESSIONS ET CAISSIERS (suite)'); }
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(10).text(`${session.terminalName} - ${session.cashierName}`, 48, doc.y, { width: 495 });
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(`${stamp(session.openedAt)} - ${stamp(session.closedAt)}`);
      line('Fond / compté / écart', session.closedAt ? `${money(session.openingCashMinor)} / ${money(Number(session.report.countedCashMinor ?? 0))} / ${money(Number(session.report.cashDifferenceMinor ?? 0))}` : `${money(session.openingCashMinor)} / En cours`);
      if (session.closingNote) doc.fillColor(muted).font('Helvetica').fontSize(9).text(session.closingNote, 48, doc.y, { width: 495 });
      doc.moveDown(0.5);
    }
    doc.moveDown().fillColor(muted).font('Helvetica').fontSize(8).text(`${provisional ? 'PROVISOIRE - Chiffres susceptibles de changer. Ne vaut pas clôture définitive.' : 'Archive définitive.'} Les fonds et comptages sont cumulés par session ; un fond réutilisé est compté à chaque ouverture.`, 48, doc.y, { width: 495 });
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.moveTo(48, 771).lineTo(547, 771).strokeColor('#c7d2fe').stroke();
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(`${z.number}${provisional ? ' - PROVISOIRE' : ''} | ${i + 1} / ${range.count}`, 48, 780, { width: 495, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
