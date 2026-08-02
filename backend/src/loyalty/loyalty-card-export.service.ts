import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { MediaService } from '@/media/media.service';
import { SettingsService } from '@/settings/settings.service';
import { buildCardContent, CardFaceContent } from './loyalty-card-design';
import { LoyaltyCardBatchDocument } from './loyalty-card-batch.schema';
import { LoyaltyCardsService } from './loyalty-cards.service';
import { LoyaltyCardPdfService } from './loyalty-card-pdf.service';
import { LoyaltyCardPngService } from './loyalty-card-png.service';

export type CardExportMode = 'pvc' | 'sheet' | 'zip';

@Injectable()
export class LoyaltyCardExportService {
  constructor(
    private readonly cardsService: LoyaltyCardsService,
    private readonly pdf: LoyaltyCardPdfService,
    private readonly png: LoyaltyCardPngService,
    private readonly settings: SettingsService,
    private readonly media: MediaService,
  ) {}

  private async contentForBatch(batch: LoyaltyCardBatchDocument): Promise<CardFaceContent[]> {
    const cards = await this.cardsService.cardsInBatch(batch.id);
    if (!cards.length) throw new BadRequestException('Ce lot ne contient aucune carte');
    const [company, site] = await Promise.all([this.settings.getCompany(), this.settings.getSite()]);
    return cards.map((c) => buildCardContent(c.templateCode, c.cardNumber, c.qrToken, company, site));
  }

  /** PVC printer mode: one front PDF + one back PDF, one CR80 page per card. */
  async exportPvc(batchId: string, createdBy: string | null): Promise<{ frontMediaId: string; backMediaId: string }> {
    const batch = await this.mustGetBatch(batchId);
    const content = await this.contentForBatch(batch);
    const [front, back] = await Promise.all([
      this.pdf.renderFrontBatch(content),
      this.pdf.renderBackBatch(content),
    ]);
    const [frontUpload, backUpload] = await Promise.all([
      this.media.uploadDocument(front, { mime: 'application/pdf', filename: `lot-${batch.batchNumber}-recto.pdf`, createdBy }),
      this.media.uploadDocument(back, { mime: 'application/pdf', filename: `lot-${batch.batchNumber}-verso.pdf`, createdBy }),
    ]);
    return { frontMediaId: frontUpload.id, backMediaId: backUpload.id };
  }

  /** Print-shop mode: multi-card A4 sheets with crop marks, front/back aligned. */
  async exportSheet(batchId: string, createdBy: string | null): Promise<{ frontMediaId: string; backMediaId: string }> {
    const batch = await this.mustGetBatch(batchId);
    const content = await this.contentForBatch(batch);
    const [front, back] = await Promise.all([
      this.pdf.renderSheet(content, 'front'),
      this.pdf.renderSheet(content, 'back'),
    ]);
    const [frontUpload, backUpload] = await Promise.all([
      this.media.uploadDocument(front, { mime: 'application/pdf', filename: `lot-${batch.batchNumber}-planche-recto.pdf`, createdBy }),
      this.media.uploadDocument(back, { mime: 'application/pdf', filename: `lot-${batch.batchNumber}-planche-verso.pdf`, createdBy }),
    ]);
    return { frontMediaId: frontUpload.id, backMediaId: backUpload.id };
  }

  /** ZIP package: individual front/back PNGs (300 DPI), the print-ready
   *  PVC PDFs, and a CSV manifest of card numbers/batch reference. */
  async exportZip(batchId: string, createdBy: string | null): Promise<{ mediaId: string }> {
    const batch = await this.mustGetBatch(batchId);
    const cards = await this.cardsService.cardsInBatch(batch.id);
    if (!cards.length) throw new BadRequestException('Ce lot ne contient aucune carte');
    const [company, site] = await Promise.all([this.settings.getCompany(), this.settings.getSite()]);
    const content = cards.map((c) => buildCardContent(c.templateCode, c.cardNumber, c.qrToken, company, site));

    const [frontPdf, backPdf] = await Promise.all([
      this.pdf.renderFrontBatch(content),
      this.pdf.renderBackBatch(content),
    ]);

    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      archive.on('end', () => resolve(Buffer.concat(chunks)));
      archive.on('error', reject);
    });

    archive.append(frontPdf, { name: `pdf/lot-${batch.batchNumber}-recto.pdf` });
    archive.append(backPdf, { name: `pdf/lot-${batch.batchNumber}-verso.pdf` });

    const manifestRows = ['card_number,qr_token,status,batch_number,batch_name'];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const [frontPng, backPng] = await Promise.all([this.png.renderFront(content[i]), this.png.renderBack(content[i])]);
      archive.append(frontPng, { name: `png/${card.cardNumber}-recto.png` });
      archive.append(backPng, { name: `png/${card.cardNumber}-verso.png` });
      manifestRows.push([card.cardNumber, card.qrToken, card.status, String(batch.batchNumber), csvEscape(batch.name)].join(','));
    }
    archive.append(manifestRows.join('\n'), { name: 'manifest.csv' });
    await archive.finalize();
    const zipBuffer = await done;

    const upload = await this.media.uploadDocument(zipBuffer, {
      mime: 'application/zip',
      filename: `lot-${batch.batchNumber}-export.zip`,
      createdBy,
    });
    return { mediaId: upload.id };
  }

  private async mustGetBatch(id: string): Promise<LoyaltyCardBatchDocument> {
    const batch = await this.cardsService.getBatchById(id);
    if (!batch) throw new NotFoundException('Lot introuvable');
    return batch;
  }

  private async contentForCard(cardId: string): Promise<CardFaceContent> {
    const card = await this.cardsService.getById(cardId);
    if (!card) throw new NotFoundException('Carte introuvable');
    const [company, site] = await Promise.all([this.settings.getCompany(), this.settings.getSite()]);
    return buildCardContent(card.templateCode, card.cardNumber, card.qrToken, company, site);
  }

  // ---- non-mutating admin previews ----------------------------------------------------
  // Deliberately separate from exportPvc/exportSheet/exportZip above: those
  // upload to MinIO and mark the batch as EXPORTED as a side effect. These
  // just render bytes on demand so the admin "toggle front/back/print"
  // preview never accidentally flips a batch's status.

  async previewFrontPng(cardId: string): Promise<Buffer> {
    return this.png.renderFront(await this.contentForCard(cardId));
  }

  async previewBackPng(cardId: string): Promise<Buffer> {
    return this.png.renderBack(await this.contentForCard(cardId));
  }

  /** Two-page PDF (front, back) at exact CR80 size, no bleed — for the
   *  admin's "print preview" toggle. */
  async previewPdf(cardId: string): Promise<Buffer> {
    return this.pdf.renderSingleCardPreview(await this.contentForCard(cardId));
  }

  /** Same multi-card sheet layout as exportSheet(), but read-only — for the
   *  admin's "sheet preview" toggle, before committing to a real export. */
  async previewSheet(batchId: string, side: 'front' | 'back'): Promise<Buffer> {
    const batch = await this.mustGetBatch(batchId);
    const content = await this.contentForBatch(batch);
    return this.pdf.renderSheet(content, side);
  }
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
