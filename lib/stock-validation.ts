/**
 * Centralized stock availability policy for all order channels:
 * - Storefront & Checkout (channel: 'ONLINE' -> location: 'DEPOT')
 * - Admin manual order & edits (channel: 'ADMIN' -> location: 'DEPOT')
 * - POS terminal sales (channel: 'POS' -> location: 'BOUTIQUE')
 */

export type StockChannel = 'ONLINE' | 'ADMIN' | 'POS';
export type StockLocation = 'DEPOT' | 'BOUTIQUE';
export type TrackingMode = 'SIMPLE' | 'VARIANT' | 'UNTRACKED';

export interface VariantStockData {
  id: string;
  sku?: string;
  size?: string;
  color?: string;
  active?: boolean;
  available: number;
}

export interface ProductStockData {
  id: string;
  name: string;
  manageStock?: boolean;
  inventoryEnabled?: boolean;
  inventoryModel?: 'LEGACY' | 'MATRIX';
  depotTrackingMode?: 'SIMPLE' | 'VARIANT';
  boutiqueTrackingMode?: 'SIMPLE' | 'VARIANT';
  stockQuantity?: number | null;
  boutiqueStockQuantity?: number | null;
  variants?: VariantStockData[];
}

export interface ValidateAvailabilityInput {
  channel: StockChannel;
  product: ProductStockData;
  variantId?: string | null;
  size?: string | null;
  color?: string | null;
  quantity: number;
  existingQuantity?: number;
}

export interface AvailabilityValidationResult {
  valid: boolean;
  channel: StockChannel;
  location: StockLocation;
  mode: TrackingMode;
  availableStock: number;
  maxAllowedQuantity: number;
  requiredDelta: number;
  variantId?: string;
  variantLabel?: string;
  error?: string;
}

export function resolveLocationForChannel(channel: StockChannel): StockLocation {
  return channel === 'POS' ? 'BOUTIQUE' : 'DEPOT';
}

export function resolveTrackingMode(product: ProductStockData, location: StockLocation): TrackingMode {
  if (product.inventoryEnabled === false || product.manageStock === false) {
    return 'UNTRACKED';
  }
  if (location === 'BOUTIQUE') {
    return product.boutiqueTrackingMode ?? 'SIMPLE';
  }
  return product.depotTrackingMode ?? (product.inventoryModel === 'MATRIX' ? 'VARIANT' : 'SIMPLE');
}

export function formatVariantLabel(size?: string | null, color?: string | null, fallback?: string): string {
  const parts = [size?.trim(), color?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : (fallback || 'Variante');
}

export function validateOrderAvailability(input: ValidateAvailabilityInput): AvailabilityValidationResult {
  const { channel, product, variantId, size, color, quantity, existingQuantity = 0 } = input;
  const location = resolveLocationForChannel(channel);
  const mode = resolveTrackingMode(product, location);
  const requiredDelta = Math.max(0, quantity - existingQuantity);

  if (quantity <= 0) {
    return {
      valid: false,
      channel,
      location,
      mode,
      availableStock: 0,
      maxAllowedQuantity: 0,
      requiredDelta,
      error: 'La quantité doit être supérieure à zéro.',
    };
  }

  // Untracked / Mode sans stock
  if (mode === 'UNTRACKED') {
    return {
      valid: true,
      channel,
      location,
      mode,
      availableStock: Infinity,
      maxAllowedQuantity: 99999,
      requiredDelta,
    };
  }

  // SIMPLE mode (global stock at location)
  if (mode === 'SIMPLE') {
    const rawStock = location === 'BOUTIQUE'
      ? (product.boutiqueStockQuantity ?? product.stockQuantity ?? 0)
      : (product.stockQuantity ?? 0);
    const available = Math.max(0, rawStock);
    const maxAllowed = available + existingQuantity;

    if (available <= 0 && requiredDelta > 0) {
      return {
        valid: false,
        channel,
        location,
        mode,
        availableStock: 0,
        maxAllowedQuantity: existingQuantity,
        requiredDelta,
        error: 'Ce produit est actuellement épuisé.',
      };
    }

    if (requiredDelta > available) {
      return {
        valid: false,
        channel,
        location,
        mode,
        availableStock: available,
        maxAllowedQuantity: maxAllowed,
        requiredDelta,
        error: `Stock insuffisant pour ${product.name} (disponible : ${available}).`,
      };
    }

    return {
      valid: true,
      channel,
      location,
      mode,
      availableStock: available,
      maxAllowedQuantity: maxAllowed,
      requiredDelta,
    };
  }

  // VARIANT mode (exact size/color stock)
  const variants = product.variants ?? [];
  let matchedVariant: VariantStockData | undefined;

  if (variantId) {
    matchedVariant = variants.find((v) => v.id === variantId);
  }

  if (!matchedVariant && size && color) {
    const norm = (s: string) => s.trim().toLowerCase();
    matchedVariant = variants.find(
      (v) => norm(v.size ?? '') === norm(size) && norm(v.color ?? '') === norm(color),
    );
  }

  if (!matchedVariant) {
    const label = formatVariantLabel(size, color, variantId ?? undefined);
    return {
      valid: false,
      channel,
      location,
      mode,
      availableStock: 0,
      maxAllowedQuantity: 0,
      requiredDelta,
      variantLabel: label,
      error: `Variante introuvable ou inactive (${label}).`,
    };
  }

  const variantLabel = formatVariantLabel(matchedVariant.size, matchedVariant.color, matchedVariant.sku || matchedVariant.id);

  if (matchedVariant.active === false) {
    return {
      valid: false,
      channel,
      location,
      mode,
      availableStock: 0,
      maxAllowedQuantity: 0,
      requiredDelta,
      variantId: matchedVariant.id,
      variantLabel,
      error: `${variantLabel} — INACTIVE`,
    };
  }

  const available = Math.max(0, matchedVariant.available ?? 0);
  const maxAllowed = available + existingQuantity;

  if (available <= 0 && requiredDelta > 0) {
    return {
      valid: false,
      channel,
      location,
      mode,
      availableStock: 0,
      maxAllowedQuantity: existingQuantity,
      requiredDelta,
      variantId: matchedVariant.id,
      variantLabel,
      error: `${variantLabel} — ÉPUISÉ`,
    };
  }

  if (requiredDelta > available) {
    return {
      valid: false,
      channel,
      location,
      mode,
      availableStock: available,
      maxAllowedQuantity: maxAllowed,
      requiredDelta,
      variantId: matchedVariant.id,
      variantLabel,
      error: `Stock insuffisant pour ${variantLabel}.`,
    };
  }

  return {
    valid: true,
    channel,
    location,
    mode,
    availableStock: available,
    maxAllowedQuantity: maxAllowed,
    requiredDelta,
    variantId: matchedVariant.id,
    variantLabel,
  };
}
