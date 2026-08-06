'use client';

import { sessionFetch } from './session-client';

const FINGERPRINT_KEY = 'pos_device_fingerprint';
const TERMINAL_KEY = 'pos_terminal_code';

/** Persistent, random per-device identifier — not real hardware
 *  fingerprinting, just a stable id so the backend can recognize "this
 *  browser/device" across requests (see docs/pos-platform/security-model.md
 *  §"POS terminal binding"). */
export function getDeviceFingerprint(): string {
  let value = localStorage.getItem(FINGERPRINT_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(FINGERPRINT_KEY, value);
  }
  return value;
}

/** Persistent, random per-device terminal id — no pairing code, no admin
 *  approval step. The backend (PosTerminalsService.validate) silently
 *  provisions a terminal record for whatever code it first sees, so this
 *  only needs to be stable per browser/device, not coordinated with
 *  anyone. Randomly generated so two devices never collide the way a
 *  shared hardcoded default would. */
export function getTerminalCode(): string {
  let value = localStorage.getItem(TERMINAL_KEY);
  if (!value) {
    value = `TERM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    localStorage.setItem(TERMINAL_KEY, value);
  }
  return value;
}

export function setTerminalCode(code: string): void {
  localStorage.setItem(TERMINAL_KEY, code);
}

export function clearTerminalCode(): void {
  localStorage.removeItem(TERMINAL_KEY);
}

/** fetch() wrapper for the POS app's own /api/* routes — attaches the
 *  device fingerprint (always) and terminal code (once paired) as headers
 *  so each Route Handler can forward them to the backend. */
export async function posFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('x-device-fingerprint', getDeviceFingerprint());
  const terminalCode = getTerminalCode();
  if (terminalCode) headers.set('x-terminal-code', terminalCode);
  return sessionFetch(input, { ...init, headers });
}
