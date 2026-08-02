import type { CompanySettings, SiteSettings } from '@contracts';
import type { CardTemplateCode } from './loyalty-card-batch.schema';

/** CR80 bank-card size — see docs/pos-platform/loyalty-card-printing.md. */
export const MM_TO_PT = 72 / 25.4;
export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 53.98;
export const CARD_WIDTH_PT = CARD_WIDTH_MM * MM_TO_PT; // 242.65pt
export const CARD_HEIGHT_PT = CARD_HEIGHT_MM * MM_TO_PT; // 153.07pt
export const BLEED_MM = 3;
export const BLEED_PT = BLEED_MM * MM_TO_PT;
export const SAFE_MARGIN_PT = 6 * MM_TO_PT; // safe area inset from the trim edge

/** 300 DPI raster target for PNG export. */
export const PNG_DPI = 300;
export const CARD_WIDTH_PX = Math.round((CARD_WIDTH_MM / 25.4) * PNG_DPI);
export const CARD_HEIGHT_PX = Math.round((CARD_HEIGHT_MM / 25.4) * PNG_DPI);

export type TemplatePalette = {
  background: string;
  backgroundDark: string;
  ink: string;
  inkMuted: string;
  onDark: string;
  accent: string;
};

/** Shared metallic-gold framing color — the border and diagonal divider use
 *  this on every template, regardless of tier accent, for a consistent
 *  premium "house style" across the whole range (see the reference mockup:
 *  the gold border/divider don't change between variations, only the
 *  background tone and the accent used for text/badges do). */
export const GOLD_FRAME = '#c9a15b';
export const GOLD_FRAME_LIGHT = '#e8cd8a';

// Four deep-navy luxury variations — a print-design choice made when
// generating a card batch (see loyalty-cards.service.ts), not a customer
// "level"/tier (that concept doesn't exist here; every card behaves
// identically regardless of which design it uses — see loyalty-rules.md).
const PALETTES: Record<CardTemplateCode, TemplatePalette> = {
  STANDARD: { background: '#132559', backgroundDark: '#0a1436', ink: '#ffffff', inkMuted: '#aab4d6', onDark: '#ffffff', accent: '#c3cbe0' },
  SILVER: { background: '#11224f', backgroundDark: '#091230', ink: '#ffffff', inkMuted: '#d6dbe8', onDark: '#ffffff', accent: '#dfe4ef' },
  GOLD: { background: '#0e1c48', backgroundDark: '#070f2c', ink: '#ffffff', inkMuted: '#e3d3ae', onDark: '#ffffff', accent: GOLD_FRAME_LIGHT },
  VIP: { background: '#080d24', backgroundDark: '#020509', ink: '#ffffff', inkMuted: '#e6d5a8', onDark: '#ffffff', accent: '#d8b667' },
};

// Print-design label shown on the card face — distinct from the removed
// customer loyalty-tier concept, this is purely which of the 4 house
// designs a physical card batch was printed with.
const TEMPLATE_LABEL: Record<CardTemplateCode, string> = {
  STANDARD: '', SILVER: 'ARGENT', GOLD: 'OR', VIP: 'VIP',
};

export function paletteFor(templateCode: CardTemplateCode): TemplatePalette {
  return PALETTES[templateCode];
}

export function templateLabelFor(templateCode: CardTemplateCode): string {
  return TEMPLATE_LABEL[templateCode];
}

export type CardFaceContent = {
  templateCode: CardTemplateCode;
  cardNumber: string;
  qrToken: string;
  legalName: string;
  boutiqueLabel: string;
  website: string;
  phone: string;
  message: string;
  terms: string;
};

export function buildCardContent(
  templateCode: CardTemplateCode,
  cardNumber: string,
  qrToken: string,
  company: CompanySettings,
  site: SiteSettings,
): CardFaceContent {
  return {
    templateCode,
    cardNumber,
    qrToken,
    legalName: 'MZALI',
    boutiqueLabel: 'BOUTIQUE',
    website: 'ahmedmzaliboutique.com',
    phone: site.phones?.[0] || company.phone || '22 479 443',
    message: 'Cumulez des points à chaque achat et profitez de vos avantages exclusifs.',
    terms: 'Cette carte reste la propriété de Mzali Boutique.',
  };
}
