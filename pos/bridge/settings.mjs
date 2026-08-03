import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DEFAULT_DRAWER_SETTINGS, normalizeDrawerSettings } from './drawer.mjs';

export const SETTINGS_PATH = resolve(process.env.POS_BRIDGE_SETTINGS_FILE || './data/pos-bridge-settings.json');

export async function readSettings(path = SETTINGS_PATH) {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8'));
    return normalizeDrawerSettings({ ...DEFAULT_DRAWER_SETTINGS, ...parsed });
  } catch (error) {
    if (error?.code !== 'ENOENT') console.error(`[settings] Lecture impossible: ${String(error)}`);
    return normalizeDrawerSettings(DEFAULT_DRAWER_SETTINGS);
  }
}

export async function saveSettings(value, path = SETTINGS_PATH) {
  const settings = normalizeDrawerSettings(value);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temporary, path);
  return settings;
}
