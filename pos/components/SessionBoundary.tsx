'use client';

import { useEffect } from 'react';
import { refreshSession, sessionExpiredEventName } from '@/lib/session-client';

export default function SessionBoundary({ proactiveSeconds }: { proactiveSeconds: number }) {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const keepAlive = async () => {
      if (document.visibilityState === 'visible') await refreshSession();
      if (!stopped) timer = setTimeout(keepAlive, Math.max(15, proactiveSeconds) * 1000);
    };
    timer = setTimeout(keepAlive, Math.max(15, proactiveSeconds) * 1000);
    const expired = () => location.assign(`/login?from=${encodeURIComponent(location.pathname + location.search)}&sessionExpired=1`);
    window.addEventListener(sessionExpiredEventName(), expired);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(sessionExpiredEventName(), expired);
    };
  }, [proactiveSeconds]);
  return null;
}
