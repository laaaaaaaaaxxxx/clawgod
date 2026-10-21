import { privateFixture } from './fixture-helpers.mjs';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

const root = privateFixture('clawgod-source-backup-');
const command = '.command("update").alias("upgrade").description("Update").action(s(async(A)=>{original()}))';
const colors = 'const color="rgb(215,119,87)";';
try {
  for (const graph of [false, true]) {
    const dir = join(root, graph ? 'graph' : 'legacy');
    mkdirSync(dir);
    for (const name of ['patch.mjs', 'ast-patches.mjs', 'acorn.mjs', 'target-policy.cjs']) {
      copyFileSync(new URL(`./${name}`, import.meta.url), join(dir, name));
    }
    const entry = join(dir, 'cli.original.cjs');
    if (graph) mkdirSync(join(dir, 'bunfs'));
    const target = graph ? join(dir, 'bunfs/commands.js') : entry;
    const snapshot = join(dir, 'source-backup.json');
    const writeSource = (version, body = command) => {
      writeFileSync(entry, `// Version: ${version}\n${graph ? '// entry' : body + colors}`);
      if (graph) {
        writeFileSync(target, body);
        writeFileSync(join(dir, 'bunfs/colors.mjs'), colors);
        writeFileSync(join(dir, 'bunfs/asset.txt'), 'unchanged asset');
      }
    };
    const run = (...args) => spawnSync(process.execPath, [join(dir, 'patch.mjs'), '--target', entry, '--output-dir', dir, ...args], { encoding: 'utf8' });
    const succeeds = (...args) => {
      const result = run(...args);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      return result.stdout;
    };

    writeSource('2.1.283');
    const clean = readFileSync(target, 'utf8');
    succeeds('--capture-clean-source');
    const backup = readFileSync(snapshot, 'utf8');
    const first = succeeds();
    const patched = readFileSync(target, 'utf8');
    assert.match(patched, /Updates are disabled/);
    for (const platform of ['linux', 'win32']) {
      const proc = { argv: ['bun', 'copy', 'update'], platform, stderr: { write() {} } };
      const body = patched.replace(/^\/\/ Version:[^\n]*\n/, '').split('const color=')[0];
      let originalCalled = false;
      await runInNewContext(`const cmd={command(){return this},alias(){return this},description(){return this},action(fn){this.run=fn;return this}};cmd${body};cmd.run()`, {
        process: proc, s: fn => fn, original() { originalCalled = true; },
        require() { throw new Error('Updater must never start a subprocess'); },
      });
      assert.equal(originalCalled, false);
      assert.equal(proc.exitCode, 1);
    }
    assert.notEqual(patched, clean);
    for (let attempt = 0; attempt < 3; attempt++) {
      const output = succeeds();
      assert.equal(output.match(/Result: .*/)[0], first.match(/Result: .*/)[0]);
      assert.equal(readFileSync(target, 'utf8'), patched, 'no nested or duplicate patches');
      assert.equal(readFileSync(snapshot, 'utf8'), backup, 'clean backup stays clean');
    }
    succeeds('--revert');
    assert.equal(readFileSync(target, 'utf8'), clean);
    if (graph) assert.equal(readFileSync(join(dir, 'bunfs/colors.mjs'), 'utf8'), colors);
    succeeds();
    assert.equal(readFileSync(target, 'utf8'), patched);

    writeFileSync(snapshot, '{truncated');
    assert.equal(run().status, 1);
    assert.equal(readFileSync(target, 'utf8'), patched);
    writeFileSync(snapshot, backup);
    if (graph) {
      writeFileSync(join(dir, 'bunfs/extra.js'), '// mismatched graph');
      assert.equal(run().status, 1);
      assert.equal(readFileSync(target, 'utf8'), patched);
      rmSync(join(dir, 'bunfs/extra.js'));
    }
    // A fresh extraction changes the version and must replace the old backup.
    writeSource('2.1.284');
    assert.equal(run().status, 1, 'reject mismatched backup version');
    succeeds('--capture-clean-source');
    assert.equal(JSON.parse(readFileSync(snapshot)).version, '2.1.284');
    assert.match(readFileSync(entry + '.bak', 'utf8'), /Version: 2.1.284/);
    succeeds();

    // A valid patch alongside a stale one must not leave a partial installation.
    rmSync(snapshot);
    rmSync(entry + '.bak');
    writeSource('2.1.284', 'const unsupported=\'.command("update").alias("upgrade")\';');
    const before = readFileSync(target, 'utf8');
    for (const args of [[], ['--dry-run']]) {
      const failed = run(...args);
      assert.equal(failed.status, 1);
      assert.match(failed.stdout, /regex stale/);
      assert.equal(readFileSync(target, 'utf8'), before);
      assert.equal(existsSync(entry + '.bak'), false);
      if (graph) assert.equal(readFileSync(join(dir, 'bunfs/colors.mjs'), 'utf8'), colors);
    }
  }
  console.log('[source-backup.test] explicit clean snapshots, update refusal, idempotence and failure safety passed');
} finally {
  rmSync(root, { recursive: true, force: true });
}
