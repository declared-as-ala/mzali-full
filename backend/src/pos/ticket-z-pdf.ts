import PDFDocument from 'pdfkit';
import { DailyZView } from './pos-daily-z.service';
import { SessionReportView } from './pos-sessions.service';

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
    doc.fontSize(10).fillColor('#c7d2fe').text('RAPPORT QUOTIDIEN DE CAISSE CONSOLIDÉ', 64, 89);
    doc.roundedRect(390, 58, 140, 25, 12).fill(provisional ? '#fef3c7' : '#d1fae5');
    doc.fillColor(provisional ? '#92400e' : '#065f46').fontSize(9).text(provisional ? 'PROVISOIRE' : 'ARCHIVE DÉFINITIVE', 395, 66, { width: 130, align: 'center' });
    doc.y = 137;
    doc.fillColor(ink).fontSize(12).text(String(z.company.legalName || 'Boutique Ahmed Mzali'), 48);
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

/** Individual Session Ticket Z PDF (Thermal/A4 Report) */
export function renderSessionTicketZPdf(report: SessionReportView): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 44, left: 44, right: 44, bottom: 60 }, bufferPages: true, info: { Title: `Ticket Z Session`, Author: 'Boutique Ahmed Mzali' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ink = '#0f172a', accent = '#2563eb', muted = '#64748b', lineBorder = '#e2e8f0';
    const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false }) : '—';
    const money = (n: number | null | undefined) => `${((n ?? 0) / 1000).toFixed(3)} DT`;

    const details = (report.details ?? {}) as Record<string, unknown>;
    const company = (details.company ?? {}) as Record<string, unknown>;
    const sales = (Array.isArray(details.sales) ? details.sales : []) as Array<{ id: string; number: number; totalMinor: number; status: string; paymentMethod?: string; createdAt?: string; cashierName?: string; lines?: Array<{ description: string; qty: number; lineTotalMinor: number }> }>;
    const movements = (Array.isArray(details.movements) ? details.movements : []) as Array<{ id: string; type: string; category?: string; categoryLabel?: string; beneficiary?: string; amountMinor: number; reason: string; createdAt?: string; performedByName?: string }>;

    const line = (label: string, value: string, bold = false) => {
      if (doc.y > 745) doc.addPage();
      const y = doc.y;
      doc.fillColor(bold ? ink : muted).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(label, 44, y, { width: 300 });
      doc.fillColor(ink).font('Helvetica-Bold').fontSize(9).text(value, 350, y, { width: 200, align: 'right' });
      doc.y = Math.max(doc.y, y + 14);
    };

    const section = (title: string) => {
      if (doc.y > 700) doc.addPage();
      const y = doc.y + 6;
      doc.roundedRect(44, y, 507, 20, 3).fill('#eff6ff');
      doc.rect(44, y + 4, 3, 12).fill(accent);
      doc.fillColor(accent).font('Helvetica-Bold').fontSize(9).text(title, 54, y + 5, { width: 490 });
      doc.y = y + 24;
    };

    // Header Card
    doc.roundedRect(44, 40, 507, 72, 6).fill(ink);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text('BOUTIQUE AHMED MZALI', 58, 52);
    doc.fontSize(10).fillColor('#93c5fd').text('TICKET Z — CLÔTURE DE CAISSE', 58, 76);
    doc.roundedRect(415, 52, 120, 24, 6).fill('#1e293b');
    doc.fillColor('#38bdf8').fontSize(9).font('Helvetica-Bold').text(`SESSION #${String(details.sessionId ?? '').slice(-6).toUpperCase()}`, 420, 60, { width: 110, align: 'center' });

    doc.y = 122;
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(11).text(String(company.legalName || 'Boutique Ahmed Mzali'), 44);
    doc.fillColor(muted).font('Helvetica').fontSize(8.5).text(`${String(company.address || 'Tunis, Tunisie')} · Tél: ${String(company.phone || '22479443')}`).moveDown(0.4);

    line('Terminal', String(details.terminalName || details.terminalId || 'Caisse principale'));
    line('Caissier', String(details.cashierName || details.cashierId || 'Caissier'));
    line('Ouverture', stamp(String(details.openedAt || report.generatedAt)));
    line('Clôture', stamp(String(details.closedAt || report.generatedAt)));

    section('1. RÉSUMÉ DES VENTES');
    line('Nombre de tickets encaissés', String(report.transactionCount));
    line('Ventes brutes', money(report.grossSalesMinor));
    line('Remises accordées', `-${money(report.discountsMinor)}`);
    line('Remboursements', `-${money(report.refundsMinor)}`);
    line('Ventes nettes (Chiffre d\'affaires)', money(report.netSalesMinor), true);

    section('2. MODES DE PAIEMENT');
    line('Paiements en espèces', money(report.cashSalesMinor));
    line('Paiements par carte bancaire', money(report.cardSalesMinor));
    line('Autres modes de paiement', money(report.otherSalesMinor));

    section('3. MOUVEMENTS D\'ESPÈCES & TIROIR-CAISSE');
    line('Fond de caisse initial', money(Number(details.openingCashMinor ?? 0)));
    line('Ventes espèces encaissées', `+${money(report.cashSalesMinor)}`);
    line('Entrées manuelles d\'espèces', `+${money(report.cashMovementsAddMinor)}`);
    line('Sorties d\'espèces (Fournisseurs / Dépenses)', `-${money(report.cashMovementsRemoveMinor)}`);
    line('Remboursements espèces', `-${money(report.cashRefundsMinor ?? 0)}`);

    section('4. BILAN DU COMPTAGE & ÉCART');
    line('Espèces attendues en caisse (Théorique)', money(report.expectedCashMinor), true);
    line('Espèces réelles comptées (Physique)', money(report.countedCashMinor), true);
    const diff = report.cashDifferenceMinor ?? 0;
    const diffLabel = diff === 0 ? 'Équilibrée (0.000 DT)' : diff > 0 ? `Excédent (+${money(diff)})` : `Manquant (${money(diff)})`;
    line('Écart de caisse', diffLabel, true);
    if (details.closingNote) {
      line('Note de clôture', String(details.closingNote));
    }

    // Articles sold section
    const rawArticles = (Array.isArray(details.articlesSold) ? details.articlesSold : []) as Array<{ description: string; qty: number; totalMinor: number }>;
    let articlesSold = rawArticles;
    if (articlesSold.length === 0 && sales.length > 0) {
      const map = new Map<string, { description: string; qty: number; totalMinor: number }>();
      for (const s of sales) {
        for (const l of (s.lines || [])) {
          const name = l.description || 'Article';
          const cur = map.get(name);
          if (cur) {
            cur.qty += l.qty;
            cur.totalMinor += l.lineTotalMinor;
          } else {
            map.set(name, { description: name, qty: l.qty, totalMinor: l.lineTotalMinor });
          }
        }
      }
      articlesSold = Array.from(map.values()).sort((a, b) => b.qty - a.qty);
    }

    if (articlesSold.length > 0) {
      const totalItems = articlesSold.reduce((acc, i) => acc + i.qty, 0);
      section(`5. ARTICLES VENDUS (${totalItems})`);
      for (const item of articlesSold) {
        if (doc.y > 730) doc.addPage();
        line(`${item.description} * ${item.qty}`, money(item.totalMinor));
      }
    }

    // Orders details section
    if (sales.length > 0) {
      section(`6. DÉTAILS DES COMMANDES (${sales.length})`);
      for (const s of sales) {
        if (doc.y > 730) doc.addPage();
        const header = `Ticket #${s.number} · ${stamp(s.createdAt)} · ${s.paymentMethod || 'Espèces'}`;
        line(header, money(s.totalMinor));
      }
    }

    // Cash movements section
    if (movements.length > 0) {
      section(`7. DÉTAILS DES MOUVEMENTS DE CAISSE (${movements.length})`);
      for (const m of movements) {
        if (doc.y > 730) doc.addPage();
        const label = `${m.type === 'CASH_OUT' || m.type === 'REMOVE' ? 'Sortie' : 'Entrée'} [${m.categoryLabel || m.category || 'Général'}] - ${m.reason} ${m.beneficiary ? `(${m.beneficiary})` : ''}`;
        line(label, `${m.type === 'CASH_OUT' || m.type === 'REMOVE' ? '-' : '+'}${money(m.amountMinor)}`);
      }
    }

    doc.moveDown(1);
    doc.fillColor(muted).font('Helvetica').fontSize(8).text('Rapport généré automatiquement par Mzali Store ERP · Document certifié conforme.', 44, doc.y, { align: 'center', width: 507 });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      doc.moveTo(44, 765).lineTo(551, 765).strokeColor(lineBorder).stroke();
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(`Ticket Z Session · Page ${i + 1} / ${range.count}`, 44, 772, { width: 507, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
