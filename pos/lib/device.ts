'use client';

import { sessionFetch } from './session-client';

const FINGERPRINT_KEY = 'pos_device_fingerprint';
const TERMINAL_KEY = 'pos_terminal_code';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^|;\\s*)(${name})=([^;]*)`));
  return match ? decodeURIComponent(match[3]) : null;
}

function setCookie(name: string, value: string, days = 3650) {
  if (typeof document === 'undefined') return;
  const maxAge = days * 86400;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; samesite=lax`;
}

/** Persistent, stable per-device identifier across localStorage and cookies */
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'server-device';
  let value = localStorage.getItem(FINGERPRINT_KEY) || getCookie(FINGERPRINT_KEY);
  if (!value) {
    value = crypto.randomUUID();
  }
  localStorage.setItem(FINGERPRINT_KEY, value);
  setCookie(FINGERPRINT_KEY, value);
  return value;
}

/** Persistent, stable per-device terminal code across localStorage and cookies */
export function getTerminalCode(): string {
  if (typeof window === 'undefined') return 'TERM-DEFAULT';
  let value = localStorage.getItem(TERMINAL_KEY) || getCookie(TERMINAL_KEY);
  if (!value) {
    value = `TERM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  }
  localStorage.setItem(TERMINAL_KEY, value);
  setCookie(TERMINAL_KEY, value);
  return value;
}

export function setTerminalCode(code: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TERMINAL_KEY, code);
  setCookie(TERMINAL_KEY, code);
}

export function clearTerminalCode(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TERMINAL_KEY);
  setCookie(TERMINAL_KEY, '', -1);
}

/** fetch() wrapper for the POS app's own /api/* routes */
export async function posFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-device-fingerprint', getDeviceFingerprint());
  const terminalCode = getTerminalCode();
  if (terminalCode) headers.set('x-terminal-code', terminalCode);
  return sessionFetch(input, { ...init, headers });
}
