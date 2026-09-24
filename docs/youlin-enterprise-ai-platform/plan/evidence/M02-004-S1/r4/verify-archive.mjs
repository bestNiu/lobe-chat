// One-off frozen evidence check, run inside the read-only Docker documentation mount.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = '/workspace';
const folder = 'docs/youlin-enterprise-ai-platform/plan/evidence/M02-004-S1';
const manifest = JSON.parse(await readFile(path.join(root, folder, 'r4-manifest.json'), 'utf8'));
for (const item of [...manifest.sources, ...manifest.artifacts]) {
  const bytes = await readFile(path.join(root, item.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256, item.path);
}
for (const deleted of manifest.deletedPaths) {
  await assert.rejects(access(path.join(root, deleted)), { code: 'ENOENT' });
}
const filesByShard = [];
let total = 0;
for (const file of ['identity-after-one.log', 'identity-after-two.log']) {
  const log = (await readFile(path.join(root, folder, 'r4', file), 'utf8')).replace(/\u001B\[[\d;]*m/g, '');
  const matches = [...log.matchAll(/^\s*✓ (src\/repositories\/youlinIdentity\/__tests__\/[^\s]+\.test\.ts) >/gm)];
  const files = new Set(matches.map((match) => match[1]));
  assert.ok(files.size > 0);
  const summary = log.match(/Tests\s+(\d+) passed \((\d+)\)/);
  assert.ok(summary);
  assert.equal(summary[1], summary[2]);
  assert.equal(matches.length, Number(summary[1]));
  total += Number(summary[1]);
  filesByShard.push(files);
}
assert.equal(total, 75);
assert.equal([...filesByShard[0]].filter((file) => filesByShard[1].has(file)).length, 0);
const testDirectory = 'src/repositories/youlinIdentity/__tests__';
const expected = (await readdir(path.join(root, 'packages/database', testDirectory)))
  .filter((file) => file.endsWith('.test.ts')).map((file) => `${testDirectory}/${file}`).sort();
assert.deepEqual([...new Set(filesByShard.flatMap((set) => [...set]))].sort(), expected);
console.log(`Verified ${manifest.sources.length} source hashes, ${manifest.artifacts.length} artifact hashes, deleted template absence, and disjoint complete ${expected.length}-file / ${total}-case shard union.`);
