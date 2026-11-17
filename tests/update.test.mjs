import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { normalizeDomain, parseDomainLines, parseUpstreamHosts, buildHosts, updateBlocklist } from '../scripts/update.mjs';

function source(n = 2100, extra = '') {
  return [
    '# The unified hosts file was not used while generating this file.',
    '# Extensions used to generate this file: gambling',
    ...Array.from({length: n}, (_, i) => `0.0.0.0 site${i}.example.org`),
    extra,
  ].join('\n');
}

async function withRepo(fn) {
  const root = await mkdtemp(join(tmpdir(), 'betstop-update-'));
  await mkdir(resolve(root, 'data'));
  try { await fn(root); }
  finally { await rm(root, {recursive: true, force: true}); }
}

test('parses host file entries and normalizes domains', () => {
  assert.equal(normalizeDomain('WWW.BETFAIR.COM'), 'betfair.com');
  assert.equal(normalizeDomain('localhost'), '');
  assert.equal(parseDomainLines('0.0.0.0 alpha.com beta.org\n# comment\n').size, 2);
});

test('only accepts verified gambling-only upstream', () => {
  assert.equal(parseUpstreamHosts(source()).size, 2100);
  assert.throws(() => parseUpstreamHosts('0.0.0.0 fake.example'), /Unexpected source/);
});

test('merges your custom list and removes exact allowlisted domains', () => {
  const result = buildHosts(source(), 'superbet.ro', 'site1.example.org');
  assert.match(result, /0\.0\.0\.0 superbet\.ro/);
  assert.doesNotMatch(result, /0\.0\.0\.0 site1\.example\.org/);
  assert.equal(parseDomainLines(result).size, 2100);
});

test('preserves previously published entries even if upstream drops them', () => {
  const previous = buildHosts(source(2300, '0.0.0.0 disappearedcasino.example'), '', '');
  const result = buildHosts(source(2100), '', '', previous);
  assert.match(result, /0\.0\.0\.0 disappearedcasino\.example/);
  assert.equal(parseDomainLines(result).size, 2301);
});

test('rejects upstream losing more than 20% of its snapshot domains', () => {
  assert.throws(() => buildHosts(source(2100), '', '', '', source(2800)), /shrank suspiciously/);
});

test('failed validation leaves previously published files unchanged', async () => {
  await withRepo(async root => {
    const path = resolve(root, 'hosts');
    await writeFile(path, '0.0.0.0 keepthis.example\n');
    await assert.rejects(updateBlocklist({root, upstreamText: '<html>404 Not Found</html>'}), /Unexpected source/);
    assert.equal(await readFile(path, 'utf8'), '0.0.0.0 keepthis.example\n');
  });
});

test('successful update publishes both owned list and snapshot', async () => {
  await withRepo(async root => {
    await writeFile(resolve(root, 'data/local-domains.txt'), 'mycasino.ro\n');
    const result = await updateBlocklist({root, upstreamText: source()});
    assert.equal(result.count, 2101);
    assert.match(await readFile(resolve(root, 'hosts'), 'utf8'), /mycasino\.ro/);
    assert.equal(await readFile(resolve(root, 'data/upstream-snapshot.hosts'), 'utf8'), source());
  });
});

test('offline rebuild works from your own saved snapshot', async () => {
  await withRepo(async root => {
    await writeFile(resolve(root, 'data/upstream-snapshot.hosts'), source());
    await writeFile(resolve(root, 'data/local-domains.txt'), 'newcasino.ro\n');
    const result = await updateBlocklist({root, offline: true});
    assert.equal(result.offline, true);
    assert.match(await readFile(resolve(root, 'hosts'), 'utf8'), /0\.0\.0\.0 newcasino\.ro/);
  });
});

test('offline rebuild falls back to published hosts if snapshot is unavailable', async () => {
  await withRepo(async root => {
    await writeFile(resolve(root, 'hosts'), buildHosts(source(), '', ''));
    await writeFile(resolve(root, 'data/local-domains.txt'), 'addedoffline.ro\n');
    const result = await updateBlocklist({root, offline: true});
    assert.equal(result.count, 2101);
  });
});
