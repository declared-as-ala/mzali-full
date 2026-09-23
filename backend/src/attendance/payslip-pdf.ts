import PDFDocument from 'pdfkit';
import type { AttendanceEmployeeRecord, PayrollPaymentRecord } from '@contracts';

const METHOD_LABELS: Record<string, string> = { cash: 'Espèces', transfer: 'Virement', other: 'Autre' };

/** One payslip per `PayrollPayment` — a static rendering of already
 *  immutable data (see payroll-payment.schema.ts's doc), so this never
 *  needs a "provisional" state the way the POS ticket-Z PDF does. */
export function renderPayslipPdf(payment: PayrollPaymentRecord, employee: AttendanceEmployeeRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, left: 48, right: 48, bottom: 60 }, info: { Title: `Fiche de paie ${payment.payrollNumber}` } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ink = '#172554', accent = '#4f46e5', muted = '#64748b';
    const money = (minor: number) => `${(minor / 1000).toFixed(3)} DT`;
    const stamp = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Tunis', hour12: false });
    const hours = (minutes: number) => `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;

    const line = (label: string, value: string) => {
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica').fontSize(10).text(label, 48, y, { width: 280 });
      doc.fillColor(ink).font('Helvetica-Bold').text(value, 330, y, { width: 215, align: 'right' });
      doc.y = Math.max(doc.y, y + 16);
    };
    const section = (title: string) => {
      const y = doc.y + 5;
      doc.roundedRect(48, y, 499, 22, 4).fill('#eef2ff');
      doc.rect(48, y + 5, 3, 14).fill(accent);
      doc.fillColor(accent).font('Helvetica-Bold').fontSize(10).text(title, 59, y + 7, { width: 475 });
      doc.y = y + 26;
    };

    doc.roundedRect(48, 40, 499, 82, 8).fill(ink);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(23).text('FICHE DE PAIE', 64, 55);
    doc.fontSize(10).fillColor('#c7d2fe').text(payment.payrollNumber, 64, 89);
    doc.roundedRect(420, 58, 110, 25, 12).fill('#d1fae5');
    doc.fillColor('#065f46').fontSize(9).text(METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod, 420, 66, { width: 110, align: 'center' });
    doc.y = 137;

    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text(`${employee.firstName} ${employee.lastName}`, 48);
    doc.fillColor(muted).font('Helvetica').fontSize(9).text(employee.jobTitle || 'Employé').moveDown(0.5);

    section('PÉRIODE ET PAIEMENT');
    line('Période', `${stamp(payment.periodStart)} — ${stamp(payment.periodEnd)}`);
    line('Date de paiement', stamp(payment.paidAt));
    line('Payé par', payment.paidByName);
    line('Mode de paiement', METHOD_LABELS[payment.paymentMethod] ?? payment.paymentMethod);

    section('HEURES ET TAUX');
    line('Total des heures travaillées', hours(payment.totalMinutes));
    line('Taux horaire (au moment du paiement)', money(payment.hourlyRateMinorSnapshot));
    line('Nombre de sessions couvertes', String(payment.sessionIds.length));

    section('MONTANT');
    line('Montant de base', money(payment.baseAmountMinor));
    if (payment.bonusMinor) line('Prime', `+ ${money(payment.bonusMinor)}`);
    if (payment.deductionMinor) line('Retenue', `- ${money(payment.deductionMinor)}`);
    doc.moveDown(0.3);
    doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor('#c7d2fe').stroke();
    doc.moveDown(0.3);
    doc.fillColor(ink).font('Helvetica-Bold').fontSize(13).text('MONTANT NET PAYÉ', 48, doc.y, { width: 280 });
    doc.fontSize(15).text(money(payment.finalAmountMinor), 330, doc.y - 16, { width: 215, align: 'right' });
    doc.y += 8;

    if (payment.note) {
      doc.moveDown(0.8);
      section('NOTE');
      doc.fillColor(ink).font('Helvetica').fontSize(9).text(payment.note, 48, doc.y, { width: 499 });
    }

    doc.fontSize(8).fillColor(muted).font('Helvetica').text(
      'Document généré automatiquement à partir des heures de pointage enregistrées. Une fois émis, un paiement n\'est jamais recalculé rétroactivement.',
      48, 760, { width: 499 },
    );
    doc.end();
  });
}
