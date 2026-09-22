/**
 * Resolves the Admin → Commandes date-preset selector into an
 * `{after, before}` ISO range, shared by every place that needs it
 * (the infinite-scroll chunk loader and the variant-filter options
 * fetch in components/admin/CommandesView.tsx) so they can never drift
 * apart from each other.
 */
export function computeDateRange(
  datePreset: string,
  startDate: string,
  endDate: string,
): { after?: string; before?: string } {
  if (!datePreset) return {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (datePreset === 'today') {
    return { after: today.toISOString() };
  }
  if (datePreset === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return { after: yesterday.toISOString(), before: today.toISOString() };
  }
  if (datePreset === '7days') {
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return { after: sevenDaysAgo.toISOString() };
  }
  if (datePreset === 'month') {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    return { after: firstOfMonth.toISOString() };
  }
  if (datePreset === 'custom') {
    const range: { after?: string; before?: string } = {};
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      range.after = start.toISOString();
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      range.before = end.toISOString();
    }
    return range;
  }
  return {};
}
