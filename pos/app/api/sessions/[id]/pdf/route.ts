import { NextResponse } from 'next/server';
import { getValidAccessToken } from '@/lib/api-auth';
import { readPosHeaders } from '@/lib/pos-headers';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:4000';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bearer = await getValidAccessToken();
  if (!bearer) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { deviceFingerprint, terminalCode } = readPosHeaders(req);
  if (!deviceFingerprint || !terminalCode) {
    return NextResponse.json({ error: 'terminal non appairé' }, { status: 401 });
  }

  try {
    const res = await fetch(`${API_BASE_URL}/pos/sessions/${id}/pdf`, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'X-POS-Terminal': terminalCode,
        'X-POS-Fingerprint': deviceFingerprint,
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Rapport introuvable' }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="ticket-z-session-${id.slice(-6)}.pdf"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'failed' }, { status: 500 });
  }
}

