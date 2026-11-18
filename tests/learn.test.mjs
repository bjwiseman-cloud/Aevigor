// Every "?" help id used in the app must have a Learn topic, and the Learn pages must build
// (the build script fails on unknown references).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const data = JSON.parse(readFileSync('web/src/content/learn.json', 'utf8'));
const ids = new Set(data.topics.map((t) => t.id));
assert.equal(ids.size, data.topics.length, 'duplicate topic id');

const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) && files.push(p); } })('web/src');
let used = 0;
for (const f of files) {
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:help|topic)="([a-z0-9-]+)"/g)) { used++; assert.ok(ids.has(m[1]), `${f}: no Learn topic "${m[1]}"`); }
}
assert.ok(used > 20, 'expected help buttons across the app');
execFileSync('node', ['scripts/build-learn.mjs', join(tmpdir(), 'learn-test')], { stdio: 'inherit' });
console.log(`learn: ${used} help links, ${ids.size} topics OK`);
