/** Single Redis pub/sub channel for stock-change notifications — see
 *  docs/pos-platform/_master-prompt.md §16. Consumers only, never a write
 *  decision: the database remains authoritative. */
export const INVENTORY_UPDATED_CHANNEL = 'inventory.updated';

export type InventoryUpdatedEvent = {
  variantId: string;
  locationId: string;
  quantityAvailable: number;
};
