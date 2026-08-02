import 'server-only';

/** Reads the device fingerprint / terminal code the client attached via
 *  posFetch() (lib/device.ts) so a Route Handler can forward them to the
 *  backend as X-POS-Fingerprint / X-POS-Terminal. */
export function readPosHeaders(req: Request): { deviceFingerprint: string | null; terminalCode: string | null } {
  return {
    deviceFingerprint: req.headers.get('x-device-fingerprint'),
    terminalCode: req.headers.get('x-terminal-code'),
  };
}
