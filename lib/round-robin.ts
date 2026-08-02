import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const POINTER_FILE = path.join(DATA_DIR, 'round-robin-pointer.json');
const LOCK_FILE = path.join(DATA_DIR, 'round-robin.lock');

export type RoundRobinState = {
  version: number;
  nextIndex: number;
};

async function readState(): Promise<RoundRobinState> {
  try {
    const raw = await fs.readFile(POINTER_FILE, 'utf8');
    return JSON.parse(raw) as RoundRobinState;
  } catch {
    return { version: 0, nextIndex: 0 };
  }
}

async function writeState(state: RoundRobinState): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = POINTER_FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmp, POINTER_FILE);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Acquire an exclusive file lock.
 * Uses O_EXCL to create a lock file atomically.
 * Retries with backoff up to `timeout` ms.
 */
async function acquireLock(timeout = 2000): Promise<void> {
  const start = Date.now();
  for (let i = 0; Date.now() - start < timeout; i++) {
    try {
      const fd = await fs.open(LOCK_FILE, 'wx');
      await fd.close();
      return;
    } catch (err: unknown) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== 'EEXIST' && e.code !== 'EBUSY') throw err;
      await sleep(Math.min(30 * (i + 1), 200));
    }
  }
  throw new Error('Timeout: could not acquire round-robin lock');
}

async function releaseLock(): Promise<void> {
  try {
    await fs.unlink(LOCK_FILE);
  } catch {
    // best-effort
  }
}

/**
 * Pick the next active employee using round-robin.
 *
 * Algorithm:
 *  1. Acquire exclusive file lock (prevents concurrent modifications).
 *  2. Read the current round-robin pointer.
 *  3. Select employee at `nextIndex % activeIds.length`.
 *  4. Increment pointer and write back atomically (temp + rename).
 *  5. Release lock and return the selected employee ID.
 *
 * This gives us safe sequential turn order: emp1, emp2, emp1, emp2, ...
 */
export async function pickNextInRoundRobin(
  activeIds: string[],
): Promise<string | null> {
  if (activeIds.length === 0) return null;

  await acquireLock();
  try {
    const state = await readState();
    const idx = state.nextIndex % activeIds.length;
    const selected = activeIds[idx] ?? null;
    const next: RoundRobinState = {
      version: state.version + 1,
      nextIndex: (state.nextIndex + 1) % activeIds.length,
    };
    await writeState(next);
    return selected;
  } finally {
    await releaseLock();
  }
}
