#!/usr/bin/env node
/**
 * Contract drift guard.
 *
 * The storefront's `types/` directory is the canonical domain contract.
 * `backend/src/contracts/` mirrors four of those files byte-for-byte
 * (line endings normalized). CI fails when they drift so the two npm
 * projects can never silently disagree on the shared shapes.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontendTypes = resolve(here, '..', '..', 'types');
const backendContracts = resolve(here, '..', 'src', 'contracts');

const MIRRORED = ['product.ts', 'category.ts', 'cart.ts', 'order.ts'];

const normalize = (s) => s.replace(/\r\n/g, '\n').trimEnd();

let failed = false;
for (const file of MIRRORED) {
  const a = normalize(readFileSync(resolve(frontendTypes, file), 'utf8'));
  const b = normalize(readFileSync(resolve(backendContracts, file), 'utf8'));
  if (a !== b) {
    failed = true;
    console.error(`DRIFT: types/${file} != backend/src/contracts/${file}`);
    const aLines = a.split('\n');
    const bLines = b.split('\n');
    const max = Math.max(aLines.length, bLines.length);
    for (let i = 0; i < max; i++) {
      if (aLines[i] !== bLines[i]) {
        console.error(`  first difference at line ${i + 1}:`);
        console.error(`    frontend: ${aLines[i] ?? '<missing>'}`);
        console.error(`    backend : ${bLines[i] ?? '<missing>'}`);
        break;
      }
    }
  }
}

if (failed) {
  console.error('\nContract drift detected. Update both copies together.');
  process.exit(1);
}
console.log(`Contracts in sync (${MIRRORED.length} mirrored files).`);
