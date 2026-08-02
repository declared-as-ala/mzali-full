import type { PosTerminal as PosTerminalContract } from '@contracts';
import { PosTerminalDocument } from './pos-terminal.schema';

export function toPosTerminalContract(doc: PosTerminalDocument): PosTerminalContract {
  return {
    id: doc.id,
    terminalCode: doc.terminalCode,
    name: doc.name,
    locationId: doc.locationId,
    registerId: doc.registerId,
    active: doc.active,
    deviceFingerprint: doc.deviceFingerprint,
    pairingCode: doc.pairingCode,
    lastSeenAt: doc.lastSeenAt ? doc.lastSeenAt.toISOString() : null,
    lastIp: doc.lastIp,
    appVersion: doc.appVersion,
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    approvedBy: doc.approvedBy,
    createdAt: doc.createdAt.toISOString(),
  };
}
