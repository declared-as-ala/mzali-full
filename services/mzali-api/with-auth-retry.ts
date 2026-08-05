import 'server-only';
import { getValidAccessToken } from '@/lib/api-auth';
import { ApiError } from './client';

/**
 * Runs an authenticated backend call. getValidAccessToken() already
 * proactively refreshes an expired access token before this ever runs, so
 * in the normal case there's nothing more to do here. This exists for the
 * remaining edge case: the backend rejects a token this process believed
 * was still valid (clock skew, or a request that read the access-token
 * cookie a moment before a concurrent request's refresh landed). On a 401
 * specifically, force one hard refresh and retry the call exactly once
 * before giving up — the caller never sees that first 401.
 */
export async function withAuthRetry<T>(fn: (bearer: string | undefined) => Promise<T>): Promise<T> {
  const bearer = await getValidAccessToken();
  try {
    return await fn(bearer ?? undefined);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 401) throw e;
    const refreshed = await getValidAccessToken({ forceRefresh: true });
    if (!refreshed) throw e;
    return fn(refreshed);
  }
}
