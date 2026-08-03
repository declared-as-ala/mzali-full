export function createRequestDeduplicator(ttlMs = 24 * 60 * 60 * 1000, { retainFailures = false } = {}) {
  const recentRequests = new Map();
  return async function once(requestId, action) {
    const now = Date.now();
    for (const [key, entry] of recentRequests) if (now - entry.at > ttlMs) recentRequests.delete(key);
    const existing = recentRequests.get(requestId);
    if (existing) return { ...(await existing.promise), duplicate: true };
    const promise = action();
    recentRequests.set(requestId, { at: now, promise });
    try {
      return { ...(await promise), duplicate: false };
    } catch (error) {
      if (!retainFailures) recentRequests.delete(requestId);
      throw error;
    }
  };
}
