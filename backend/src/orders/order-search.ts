/**
 * The order-list search clause, in ONE place (list, counts and the per-product breakdown all use it).
 *
 * It used to run an unanchored, case-insensitive regex over seven fields for every keystroke. Typing
 * "2", "23", "234" each made MongoDB fetch ~60,000 orders (~120MB) to filter them, and under memory
 * pressure each of those took over a minute. Now:
 *  - the typed text is regex-escaped (a "(" no longer breaks the query);
 *  - short numbers (<= 4 digits, the first keystrokes of a phone) match the order number exactly and
 *    phone/tracking numbers by PREFIX, which are tight index ranges (no document is fetched until a match);
 *  - from 5 digits on, phone/tracking numbers match by "contains" (index keys only, no document scan);
 *  - a customer name is only searched for text without digits, against its own index.
 */
export const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TRACKING = ['carrier.navex.tracking', 'carrier.firstdelivery.tracking', 'carrier.axess.tracking', 'returnInfo.trackingNumber'] as const;

export function orderSearchCondition(raw: string): Record<string, unknown> {
  const q = raw.trim();
  if (!q) return {};
  const e = escapeRegex(q);
  const digitsOnly = /^\d+$/.test(q);
  const hasDigit = /\d/.test(q);
  const or: Record<string, unknown>[] = [];

  if (digitsOnly) {
    const n = Number(q);
    if (Number.isSafeInteger(n)) or.push({ orderNumber: n });
    const pattern = q.length <= 4 ? `^${e}` : e; // prefix while the number is still short
    or.push({ 'customer.phone': { $regex: pattern } });
    for (const field of TRACKING) or.push({ [field]: { $regex: pattern, $options: 'i' } });
    return { $or: or };
  }

  if (!hasDigit) or.push({ 'customer.firstName': { $regex: e, $options: 'i' } });
  for (const field of TRACKING) or.push({ [field]: { $regex: hasDigit ? e : `^${e}`, $options: 'i' } });
  return { $or: or };
}
