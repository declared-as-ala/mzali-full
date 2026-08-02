'use client';
import { useEffect, useRef } from 'react';
import { posFetch } from '@/lib/device';

export type InventoryUpdatedEvent = { variantId: string; locationId: string; quantityAvailable: number };

const RECONNECT_DELAY_MS = 3000;

/** Live stock-badge updates for the POS product grid — consumed via
 *  fetch()+ReadableStream (not the browser's EventSource, which can't
 *  send the terminal/auth headers every POS request needs). Silently
 *  reconnects on drop; never blocks the till if the stream is down. */
export function usePosEvents(onEvent: (event: InventoryUpdatedEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    async function connect() {
      while (!cancelled) {
        try {
          const res = await posFetch('/api/events', { cache: 'no-store' });
          if (!res.ok || !res.body) throw new Error(`SSE connect failed (${res.status})`);
          reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const chunks = buffer.split('\n\n');
            buffer = chunks.pop() ?? '';
            for (const chunk of chunks) {
              const line = chunk.split('\n').find((l) => l.startsWith('data:'));
              if (!line) continue;
              try {
                handlerRef.current(JSON.parse(line.slice(5).trim()));
              } catch {
                // ignore malformed event
              }
            }
          }
        } catch {
          // fall through to reconnect
        }
        if (!cancelled) await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
      }
    }

    connect();
    return () => {
      cancelled = true;
      reader?.cancel().catch(() => {});
    };
  }, []);
}
