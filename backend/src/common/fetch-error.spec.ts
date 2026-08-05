import { describeFetchError } from './fetch-error';

describe('describeFetchError', () => {
  it('walks the cause chain to surface the real OS-level error', () => {
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND app.navex.tn'), { code: 'ENOTFOUND' });
    const fetchFailed = new Error('fetch failed', { cause: dns });
    expect(describeFetchError(fetchFailed)).toBe('fetch failed <- ENOTFOUND: getaddrinfo ENOTFOUND app.navex.tn');
  });

  it('falls back to the bare message when there is no cause', () => {
    expect(describeFetchError(new Error('timeout'))).toBe('timeout');
  });

  it('handles a non-Error thrown value', () => {
    expect(describeFetchError('some string')).toBe('network error');
    expect(describeFetchError(undefined)).toBe('network error');
  });

  it('stops walking once a non-Error cause is reached', () => {
    const outer = new Error('fetch failed', { cause: 'raw string cause' });
    expect(describeFetchError(outer)).toBe('fetch failed <- raw string cause');
  });
});
