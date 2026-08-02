import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const REPORTS_DIR = join(process.cwd(), 'reports');

/** Writes a JSON report to backend/reports/<name>-<timestamp>.json (gitignored). */
export async function writeReport(name: string, data: unknown): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = join(REPORTS_DIR, `${name}-${timestamp}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  return filePath;
}
