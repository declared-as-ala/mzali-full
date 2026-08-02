import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { BOUTIQUE_CODE } from '@/catalog/location.schema';
import { PosTerminal, PosTerminalDocument } from './pos-terminal.schema';

const PAIRING_CODE_TTL_MINUTES = 15;

function randomCode(length: number, chars: string): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

@Injectable()
export class PosTerminalsService {
  constructor(@InjectModel(PosTerminal.name) private readonly model: Model<PosTerminal>) {}

  /** Device generates a fingerprint client-side once and persists it locally
   *  (localStorage) — re-requesting pairing with the same fingerprint just
   *  issues a fresh code rather than creating a duplicate terminal record. */
  async requestPairing(deviceFingerprint: string): Promise<{ pairingCode: string; expiresAt: Date }> {
    const pairingCode = randomCode(6, '23456789ABCDEFGHJKMNPQRSTUVWXYZ'); // no 0/O/1/I ambiguity
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000);
    const existing = await this.model.findOne({ deviceFingerprint, active: false });
    if (existing) {
      existing.pairingCode = pairingCode;
      existing.pairingCodeExpiresAt = expiresAt;
      await existing.save();
    } else {
      await this.model.create({
        terminalCode: `TERM-${randomCode(6, '23456789ABCDEFGHJKMNPQRSTUVWXYZ')}`,
        name: 'Nouveau terminal',
        locationId: BOUTIQUE_CODE,
        active: false,
        deviceFingerprint,
        pairingCode,
        pairingCodeExpiresAt: expiresAt,
      });
    }
    return { pairingCode, expiresAt };
  }

  async checkPairing(pairingCode: string): Promise<{ status: 'pending' | 'approved' | 'expired' | 'not_found'; terminalCode?: string }> {
    const doc = await this.model.findOne({ pairingCode });
    if (!doc) return { status: 'not_found' };
    if (doc.active) {
      const terminalCode = doc.terminalCode;
      doc.pairingCode = null;
      doc.pairingCodeExpiresAt = null;
      await doc.save();
      return { status: 'approved', terminalCode };
    }
    if (doc.pairingCodeExpiresAt && doc.pairingCodeExpiresAt < new Date()) return { status: 'expired' };
    return { status: 'pending' };
  }

  async listPending(): Promise<PosTerminalDocument[]> {
    return this.model.find({ active: false, pairingCodeExpiresAt: { $gte: new Date() } }).sort({ createdAt: -1 });
  }

  async list(): Promise<PosTerminalDocument[]> {
    return this.model.find().sort({ terminalCode: 1 });
  }

  async approve(id: string, adminUserId: string, patch: { name?: string; locationId?: string }): Promise<PosTerminalDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Terminal introuvable');
    doc.active = true;
    doc.approvedAt = new Date();
    doc.approvedBy = adminUserId;
    // pairingCode is deliberately NOT cleared here — the device is still
    // polling checkPairing() by that code and needs one more successful
    // lookup to learn it was approved. checkPairing() clears it once that
    // poll succeeds (single-use, but after the device has actually seen
    // the result).
    if (patch.name) doc.name = patch.name;
    if (patch.locationId) doc.locationId = patch.locationId;
    await doc.save();
    return doc;
  }

  async revoke(id: string): Promise<void> {
    await this.model.findByIdAndUpdate(id, { $set: { active: false } });
  }

  /** Rename/reassign an already-approved terminal — distinct from the
   *  one-time `approve()` patch, usable any time after pairing. */
  async update(id: string, patch: { name?: string; locationId?: string; registerId?: string | null }): Promise<PosTerminalDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Terminal introuvable');
    if (patch.name) doc.name = patch.name;
    if (patch.locationId) doc.locationId = patch.locationId;
    if (patch.registerId !== undefined) doc.registerId = patch.registerId;
    await doc.save();
    return doc;
  }

  async getById(id: string): Promise<PosTerminalDocument> {
    const doc = await this.model.findById(id);
    if (!doc) throw new NotFoundException('Terminal introuvable');
    return doc;
  }

  /** Used by PosTerminalGuard on every POS request. Auto-provisions and activates terminal if not yet paired. */
  async validate(
    terminalCode: string,
    deviceFingerprint: string,
    ip: string | null = null,
    appVersion: string | null = null,
  ): Promise<PosTerminalDocument> {
    let doc = await this.model.findOne({ terminalCode });
    if (!doc) {
      doc = await this.model.create({
        terminalCode: terminalCode || 'TERM-POS-MAIN',
        name: 'Caisse POS',
        locationId: BOUTIQUE_CODE,
        active: true,
        deviceFingerprint,
        approvedAt: new Date(),
        approvedBy: 'system',
      });
    } else {
      if (!doc.active || doc.deviceFingerprint !== deviceFingerprint) {
        doc.active = true;
        doc.deviceFingerprint = deviceFingerprint;
      }
      doc.lastSeenAt = new Date();
      if (ip) doc.lastIp = ip;
      if (appVersion) doc.appVersion = appVersion;
      await doc.save();
    }
    return doc;
  }
}
