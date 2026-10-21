import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, readFileSync, mkdirSync, rmSync, symlinkSync, linkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateFixture } from './fixture-helpers.mjs';
import { runtimeFixture } from './runtime-test-fixture.mjs';

test('all low-level tools refuse implicit targets and leave the synthetic working directory untouched', () => {
  const root = privateFixture('implicit-target-');
  try {
    const target = join(root, 'cli.original.cjs');
    writeFileSync(target, 'function userType(){return"external"}');
    for (const tool of ['patch.mjs', 'post-process.mjs', 'extract-natives.mjs']) {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL(tool, import.meta.url))], { cwd: root, encoding: 'utf8', timeout: 5000 });
      assert.equal(result.status, 1, tool);
      assert.match(result.stderr, /explicit absolute path is required/);
      assert.equal(readFileSync(target, 'utf8'), 'function userType(){return"external"}');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('graph, backup and snapshot link escapes fail before any source write', () => {
  const root = privateFixture('source-link-');
  try {
    const output = join(root, 'output'); mkdirSync(output);
    const canary = join(root, 'canary'); writeFileSync(canary, 'synthetic protected canary');
    const target = join(output, 'cli.original.cjs');
    writeFileSync(target, 'function userType(){return"external"}');
    const run = () => spawnSync(process.execPath, [fileURLToPath(new URL('patch.mjs', import.meta.url)),
      '--target', target, '--output-dir', output], { encoding: 'utf8', timeout: 5000 });
    for (const name of ['cli.original.cjs.bak', 'source-backup.json']) {
      const file = join(output, name); linkSync(canary, file);
      assert.equal(run().status, 1);
      rmSync(file);
      assert.equal(readFileSync(target, 'utf8'), 'function userType(){return"external"}');
    }
    const graph = join(output, 'bunfs'); mkdirSync(graph);
    symlinkSync(canary, join(graph, 'escape.js'));
    assert.equal(run().status, 1);
    assert.equal(readFileSync(canary, 'utf8'), 'synthetic protected canary');
    assert.equal(readFileSync(target, 'utf8'), 'function userType(){return"external"}');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runtime rejects linked configuration/native copy before loading synthetic source', () => {
  const fixture = runtimeFixture();
  try {
    const native = readFileSync(fixture.nativeCopy);
    rmSync(fixture.nativeCopy);
    const other = join(fixture.root, 'outside-native'); writeFileSync(other, native);
    symlinkSync(other, fixture.nativeCopy);
    assert.throws(() => fixture.launch(), /links\/junctions/);
    rmSync(fixture.nativeCopy); writeFileSync(fixture.nativeCopy, native);
    const config = join(fixture.root, 'config-alias');
    symlinkSync(fixture.configDir, config, process.platform === 'win32' ? 'junction' : 'dir');
    const declared = fixture.explicit.map(value => value === fixture.configDir ? config : value);
    assert.throws(() => fixture.launch({}, {}, [], declared), /links\/junctions/);
    symlinkSync(other, join(fixture.configDir, 'settings.json'));
    assert.throws(() => fixture.launch(), /links\/junctions/);
  } finally { fixture.cleanup(); }
});

test('a stale update matcher is never tolerated into a native updater fallback', () => {
  const root = privateFixture('update-drift-');
  try {
    const target = join(root, 'cli.original.cjs');
    const source = 'const command={name:"x"};const drift=\'.command("update").alias("upgrade")\';function userType(){return"external"}';
    writeFileSync(target, source);
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('patch.mjs', import.meta.url)),
      '--target', target, '--output-dir', root, '--tolerate-stale'], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Refuse update\/upgrade.*regex stale/);
    assert.equal(readFileSync(target, 'utf8'), source);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('post-processing rejects a mapped path outside the declared output without partial writes', () => {
  const root = privateFixture('post-process-map-');
  try {
    const output = join(root, 'output'); mkdirSync(output);
    const source = 'export const value = 1;';
    const target = join(output, 'cli.original.js'); writeFileSync(target, source);
    const canary = join(root, 'canary'); writeFileSync(canary, 'synthetic protected canary');
    writeFileSync(join(output, 'pathmap.json'), JSON.stringify({ '/$bunfs/root/asset.js': '../canary' }));
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('post-process.mjs', import.meta.url)),
      '--target', target, '--output-dir', output], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /strictly inside/);
    assert.equal(readFileSync(target, 'utf8'), source);
    assert.equal(readFileSync(canary, 'utf8'), 'synthetic protected canary');
    assert.equal(existsSync(join(output, 'cli.original.cjs')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
