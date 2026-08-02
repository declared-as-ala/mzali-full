import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LegacyAdminFile, LegacyEmployeeRow } from './mappers/map-employee';

export type LegacySiteSettings = {
  photoUrl?: string;
  phones?: string[];
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
  facebook?: string;
};

/** Reads the legacy file-based stores (data/employees.json, admin.json, site-settings.json). */
@Injectable()
export class LegacyFilesReader {
  constructor(private readonly config: ConfigService) {}

  private dataDir(): string {
    return this.config.get<string>('LEGACY_DATA_DIR') ?? join(process.cwd(), '..', 'data');
  }

  async readEmployees(): Promise<LegacyEmployeeRow[]> {
    try {
      const raw = await readFile(join(this.dataDir(), 'employees.json'), 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as LegacyEmployeeRow[]) : [];
    } catch {
      return [];
    }
  }

  async readAdmin(): Promise<LegacyAdminFile | null> {
    try {
      const raw = await readFile(join(this.dataDir(), 'admin.json'), 'utf8');
      return JSON.parse(raw) as LegacyAdminFile;
    } catch {
      return null;
    }
  }

  async readSiteSettings(): Promise<LegacySiteSettings> {
    try {
      const raw = await readFile(join(this.dataDir(), 'site-settings.json'), 'utf8');
      return JSON.parse(raw) as LegacySiteSettings;
    } catch {
      return {};
    }
  }
}
