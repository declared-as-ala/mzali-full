/**
 * Node's fetch (undici) collapses every network-level failure — DNS lookup
 * failure, connection refused, TLS handshake error, timeout — into the same
 * unhelpful top-level message: "fetch failed". The actual reason lives on
 * `error.cause` (an OS-level error like ENOTFOUND/ECONNREFUSED, sometimes
 * itself wrapping another `.cause`). Carrier push integrations (Navex,
 * First Delivery, Axess) all call bare `fetch()` against a courier's own
 * API and previously only logged the outer message, making every real
 * outage/misconfiguration indistinguishable from every other one. This
 * walks the cause chain so the actual OS/TLS error ends up in the message.
 */
export function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return 'network error';
  const parts: string[] = [e.message];
  let cause: unknown = (e as { cause?: unknown }).cause;
  let depth = 0;
  while (cause && depth < 5) {
    if (cause instanceof Error) {
      const code = (cause as NodeJS.ErrnoException).code;
      parts.push(code ? `${code}: ${cause.message}` : cause.message);
      cause = (cause as { cause?: unknown }).cause;
    } else {
      parts.push(String(cause));
      break;
    }
    depth += 1;
  }
  return parts.join(' <- ');
}
