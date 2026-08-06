import { getValidAccessToken } from '@/lib/api-auth';
import { readPosHeaders } from '@/lib/pos-headers';

/**
 * Streams the backend's SSE endpoint through to the browser — a plain
 * fetch()-based passthrough, not next/server's NextResponse.json helpers,
 * since this response body must stay open and stream chunks as they
 * arrive rather than being buffered.
 */
export async function GET(req: Request) {
  const bearer = await getValidAccessToken();
  if (!bearer) return new Response('unauthorized', { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) return new Response('terminal non appairé', { status: 401 });

  const base = (process.env.MZALI_API_URL ?? '').replace(/\/+$/, '');
  const upstream = await fetch(`${base}/api/v1/pos/events`, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      'X-POS-Terminal': terminalCode,
      'X-POS-Fingerprint': deviceFingerprint,
      Accept: 'text/event-stream',
    },
    cache: 'no-store',
  });

  if (!upstream.ok || !upstream.body) {
    return new Response('upstream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
