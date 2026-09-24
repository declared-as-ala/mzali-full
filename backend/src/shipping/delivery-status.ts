/**
 * Centralized carrier-status normalization — the single place that
 * decides whether a raw response from Navex/First Delivery/Axess means
 * "the parcel was delivered."
 *
 * Why keyword-scanning instead of parsing a known field: none of the
 * three carriers' `getState()` methods (navex.service.ts,
 * first-delivery.service.ts, axess.service.ts) have ever been called in
 * production (confirmed by a full grep of the codebase before building
 * this) — there is no captured sample, no API doc, and no test fixture
 * anywhere showing what a real "Delivered" response looks like from any
 * of them. Guessing a specific field name (`etat`, `status`, `libelle`...)
 * risks silently missing real deliveries forever if the guess is wrong.
 *
 * Instead this recursively scans every string value in the raw payload
 * for delivery-confirmation keywords (diacritic/case-insensitive, so
 * "Livré", "livree", "LIVRÉ" all match). This fails SAFE: an
 * unrecognized shape just never reports delivered — it can undercount
 * (a real delivery goes unnoticed until the wording is recognized) but
 * can never overcount (falsely mark something delivered). The raw text
 * that matched is captured on `OrderDelivery.rawStatus` for every sync,
 * so once real carrier data starts flowing, any keyword gaps are visible
 * and fixable from the data itself rather than more guessing.
 */

const COMBINING_MARKS = /[̀-ͯ]/g;
function foldDiacritics(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/** French and English phrasing Tunisian carriers commonly use for a
 *  completed delivery. Deliberately specific — "livr" alone would also
 *  match "livraison" (the generic word for "delivery" used throughout
 *  in-transit statuses too), so every entry here is a phrase that only
 *  makes sense once the parcel has actually reached the customer. */
const DELIVERED_KEYWORDS = [
  'livre avec succes',
  'livraison effectuee',
  'livraison reussie',
  'colis livre',
  'commande livree',
  'delivered successfully',
  'successfully delivered',
  'delivery completed',
  // Bare "livre"/"delivered" last, as the broadest (still safe) match —
  // ordered after the more specific phrases only for readability.
  'livre',
  'livree',
  'delivered',
];

function isDeliveredText(s: string): boolean {
  const norm = foldDiacritics(s);
  return DELIVERED_KEYWORDS.some((k) => norm.includes(k));
}

function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || out.length > 200) return;
  if (typeof value === 'string') {
    if (value.trim()) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectStrings(v, out, depth + 1);
  }
}

/** Field names likely to hold a human-readable status across the 3
 *  carriers' plausible response shapes — best-effort only, used purely
 *  to pick a nicer `rawStatus` for display; delivery DETECTION never
 *  depends on this matching (see collectStrings above for that). */
const STATUS_KEY_HINTS = ['etat', 'status', 'statut', 'state', 'libelle', 'label', 'message'];

/**
 * Confirmed live against First Delivery's real `/etat` response (see
 * commit history — no field name here was guessed): it wraps its actual
 * status in `result.state`, alongside a generic top-level `message` like
 * "État du produit récupéré avec succès" ("product status retrieved
 * successfully") that ALSO matches the hints above but says nothing
 * about the parcel itself. Any key in this list is deprioritized to a
 * last-resort fallback so a real nested status field always wins.
 */
const GENERIC_ENVELOPE_KEYS = new Set(['message', 'status', 'iserror', 'ok', 'success', 'error']);

function collectKeyValueStrings(value: unknown, out: { key: string; value: string }[], depth = 0): void {
  if (depth > 6 || out.length > 200) return;
  if (Array.isArray(value)) {
    for (const v of value) collectKeyValueStrings(v, out, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out.push({ key, value: v });
      else collectKeyValueStrings(v, out, depth + 1);
    }
  }
}

function findStatusLikeString(raw: unknown): string | null {
  const pairs: { key: string; value: string }[] = [];
  collectKeyValueStrings(raw, pairs);
  const isHint = (key: string) => STATUS_KEY_HINTS.some((hint) => key.toLowerCase().includes(hint));
  // A specific, non-generic status field (e.g. `result.state`) always wins...
  const specific = pairs.find((p) => isHint(p.key) && !GENERIC_ENVELOPE_KEYS.has(p.key.toLowerCase()));
  if (specific) return specific.value;
  // ...only falling back to a generic envelope field (`message`, `status`)
  // when nothing more specific exists anywhere in the payload.
  const generic = pairs.find((p) => isHint(p.key));
  return generic ? generic.value : null;
}

export type DeliveryStatusCheck = {
  delivered: boolean;
  /** Best-effort raw text for the admin UI/audit trail — never used for
   *  the delivered decision itself. */
  rawText: string | null;
};

/** Checks one carrier `getState()` raw payload for a delivered signal. */
export function checkDeliveredStatus(raw: unknown): DeliveryStatusCheck {
  const strings: string[] = [];
  collectStrings(raw, strings);
  const deliveredMatch = strings.find(isDeliveredText);
  return {
    delivered: deliveredMatch !== undefined,
    rawText: findStatusLikeString(raw) ?? deliveredMatch ?? strings[0] ?? null,
  };
}
