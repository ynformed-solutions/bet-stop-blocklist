import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPSTREAM =
  'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MIN_DOMAINS = 2000;
const MAX_DOMAINS = 30000;
const MAX_UPSTREAM_BYTES = 3_000_000;
const SHRINK_RATIO = 0.8;

export function normalizeDomain(value) {
  if (typeof value !== 'string') return '';
  const domain = value.trim().toLowerCase().replace(/^www\./, '');
  if (domain.length > 253 || !domain.includes('.') || domain.endsWith('.')) return '';
  if (/^\d+(?:\.\d+){3}$/.test(domain)) return '';
  if (domain.split('.').some((label) =>
    !label || label.length > 63 ||
    !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return '';
  return domain;
}

export function parseDomainLines(text) {
  const domains = new Set();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0].trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const candidates = /^(?:0\.0\.0\.0|127\.0\.0\.1)$/.test(parts[0])
      ? parts.slice(1)
      : parts.length === 1 ? parts : [];
    for (const candidate of candidates) {
      const domain = normalizeDomain(candidate);
      if (domain) domains.add(domain);
    }
  }
  return domains;
}

export function parseUpstreamHosts(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_UPSTREAM_BYTES) {
    throw new Error('Upstream exceeds the maximum expected size');
  }
  // This metadata is important: alternates/gambling/hosts also includes ads/malware.
  if (!text.includes('# Extensions used to generate this file: gambling') ||
      !text.includes('# The unified hosts file was not used')) {
    throw new Error('Unexpected source: expected StevenBlack gambling-only hosts');
  }
  const domains = parseDomainLines(text);
  if (domains.size < MIN_DOMAINS || domains.size > MAX_DOMAINS) {
    throw new Error(`Unexpected upstream domain count: ${domains.size}`);
  }
  return domains;
}

function validateAgainstPreviousSnapshot(current, previousSnapshotText) {
  if (!previousSnapshotText) return;
  const previous = parseUpstreamHosts(previousSnapshotText);
  if (current.size < previous.size * SHRINK_RATIO) {
    throw new Error(`Upstream shrank suspiciously (${previous.size} to ${current.size}). Nothing published.`);
  }
}

export function buildHosts(upstreamText, localText, allowText, previousText = '', snapshotText = '') {
  const upstream = parseUpstreamHosts(upstreamText);
  validateAgainstPreviousSnapshot(upstream, snapshotText);

  // Append-only protection: losing a domain upstream does not delete it from Bet Stop.
  // Retire false positives explicitly with data/allowlist.txt.
  const domains = new Set([
    ...parseDomainLines(previousText),
    ...upstream,
    ...parseDomainLines(localText),
  ]);
  for (const domain of parseDomainLines(allowText)) domains.delete(domain);

  if (domains.size < MIN_DOMAINS || domains.size > MAX_DOMAINS) {
    throw new Error(`Unexpected published domain count: ${domains.size}`);
  }
  return [...domains].sort().join('\n') + '\n';
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function writeIfChanged(path, data) {
  const old = await readOptional(path);
  if (old === data) return false;
  const temp = `${path}.tmp`;
  try {
    await writeFile(temp, data, 'utf8');
    await rename(temp, path);
  } catch (error) {
    // Do not overwrite a previous published file on failure.
    throw error;
  }
  return true;
}

async function fetchUpstream() {
  const response = await fetch(UPSTREAM, {
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'BetStop-Blocklist-Updater/2.0' },
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status}. Owned files remain unchanged.`);
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_UPSTREAM_BYTES) {
    throw new Error('Upstream response too large');
  }
  return response.text();
}

export async function updateBlocklist({root = ROOT, offline = false, upstreamText} = {}) {
  const publishedPath = resolve(root, 'hosts');
  const snapshotPath = resolve(root, 'data/upstream-snapshot.hosts');
  const localPath = resolve(root, 'data/local-domains.txt');
  const allowPath = resolve(root, 'data/allowlist.txt');

  const [previous, snapshot, local, allow] = await Promise.all([
    readOptional(publishedPath),
    readOptional(snapshotPath),
    readOptional(localPath),
    readOptional(allowPath),
  ]);

  // Offline manual mode allows local corrections even if upstream disappears.
  let fetched;
  if (offline) {
    if (!snapshot && !previous) {
      throw new Error('No owned snapshot or published list exists. Run an online update once first.');
    }
    fetched = snapshot || '';
  } else {
    fetched = upstreamText === undefined ? await fetchUpstream() : upstreamText;
  }

  // Validate before changing any published files. An offline rebuild without
  // a snapshot can use the owned domain-only list instead of expecting hosts metadata.
  let published;
  if (offline && !snapshot) {
    const domains = parseDomainLines(previous);
    for (const domain of parseDomainLines(local)) domains.add(domain);
    for (const domain of parseDomainLines(allow)) domains.delete(domain);
    if (domains.size < MIN_DOMAINS || domains.size > MAX_DOMAINS) {
      throw new Error(`Unexpected published domain count: ${domains.size}`);
    }
    published = [...domains].sort().join('\n') + '\n';
  } else {
    published = buildHosts(fetched, local, allow, previous, offline ? '' : snapshot);
  }
  const count = parseDomainLines(published).size;
  const publishedChanged = await writeIfChanged(publishedPath, published);
  const snapshotChanged = !offline && await writeIfChanged(snapshotPath, fetched);
  return {count, publishedChanged, snapshotChanged, offline};
}

async function main() {
  const offline = process.argv.includes('--offline');
  const fixtureArg = process.argv.find((arg) => arg.startsWith('--upstream-file='));
  const upstreamText = fixtureArg
    ? await readFile(resolve(fixtureArg.substring('--upstream-file='.length)), 'utf8')
    : undefined;
  const result = await updateBlocklist({offline, upstreamText});
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Blocklist update refused: ${error.message}`);
    process.exitCode = 1;
  });
}
