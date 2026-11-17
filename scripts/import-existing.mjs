import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeDomain } from './update.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-existing.mjs /path/to/blocked-domains.js');
  process.exit(1);
}
const source = await readFile(resolve(file), 'utf8');
const match = source.match(/\bBLOCKED_DOMAINS\s*=\s*(?:new\s+Set\s*\(\s*)?\[([\s\S]*?)\]/);
if (!match) throw new Error('Cannot find a BLOCKED_DOMAINS array/set literal; copy domains manually into data/local-domains.txt');
const matches = [...match[1].matchAll(/['"`]([^'"`]+)['"`]/g)];
const domains = [...new Set(matches.map(m => normalizeDomain(m[1])).filter(Boolean))].sort();
if (domains.length < 50) throw new Error(`Parsed only ${domains.length} domains; refusing partial import`);
const destination = fileURLToPath(new URL('../data/local-domains.txt', import.meta.url));
await writeFile(destination, '# Curated local Bet Stop domains. One domain per line.\n' + domains.join('\n') + '\n');
console.log(`Imported ${domains.length} unique domains to data/local-domains.txt`);
