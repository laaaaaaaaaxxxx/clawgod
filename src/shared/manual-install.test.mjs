import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { privateFixture } from './fixture-helpers.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const shell = join(repository, 'install.sh');
const windows = readFileSync(join(repository, 'install.ps1'), 'utf8').split("$Installer = @'\n")[1].split("\n'@")[0];

// A fabricated ELF container with one text module, not a Claude executable.
function nativeFixture(source) {
  const name = Buffer.from('/$bunfs/root/cli.js');
  const text = Buffer.from(source);
  const record = Buffer.alloc(52);
  record.writeUInt32LE(0, 0); record.writeUInt32LE(name.length, 4);
  record.writeUInt32LE(name.length, 8); record.writeUInt32LE(text.length, 12); record[49] = 1;
  const offsets = Buffer.alloc(32);
  offsets.writeUInt32LE(name.length + text.length, 8); offsets.writeUInt32LE(52, 12);
  const payload = Buffer.concat([name, text, record, offsets, Buffer.from('\n---- Bun! ----\n')]);
  const length = Buffer.alloc(8); length.writeBigUInt64LE(BigInt(payload.length));
  const section = Buffer.concat([length, payload]);
  const strings = Buffer.from('\0.shstrtab\0.bun\0');
  const header = Buffer.alloc(64 + 3 * 64);
  header.writeUInt32LE(0x464c457f); header[4] = 2; header[5] = 1;
  header.writeUInt16LE(0x3e, 0x12); header.writeBigUInt64LE(64n, 0x28);
  header.writeUInt16LE(64, 0x3a); header.writeUInt16LE(3, 0x3c); header.writeUInt16LE(1, 0x3e);
  header.writeUInt32LE(1, 128); header.writeBigUInt64LE(BigInt(header.length), 128 + 0x18);
  header.writeBigUInt64LE(BigInt(strings.length), 128 + 0x20);
  header.writeUInt32LE(11, 192); header.writeBigUInt64LE(BigInt(header.length + strings.length), 192 + 0x18);
  header.writeBigUInt64LE(BigInt(section.length), 192 + 0x20);
  return Buffer.concat([header, strings, section]);
}

for (const transport of ['shell', 'windows-payload']) {
  test(`${transport}: explicit offline build never executes the input; tools removed; scoped uninstall`, () => {
    const root = privateFixture(`manual-${transport}-`);
    const target = join(root, 'input-copy');
    const output = join(root, 'output with spaces');
    const marker = join(root, 'MUST-NOT-RUN');
    const bytes = nativeFixture(`// Version: 0.0.1\nfunction userType(){return"external"}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected execution');`);
    writeFileSync(target, bytes);
    const bin = join(root, 'bin'); mkdirSync(bin);
    symlinkSync(process.execPath, join(bin, 'node'));
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\nprintf discovered > '${marker}'\nexit 91\n`, { mode: 0o755 });
    const env = { PATH: bin };
    const run = args => transport === 'shell'
      ? spawnSync('/bin/bash', [shell, ...args], { encoding: 'utf8', timeout: 20000, env })
      : spawnSync(process.execPath, ['-', ...args], { input: windows, encoding: 'utf8', timeout: 20000, env });
    try {
      for (const args of [[], ['--target', target], ['--output-dir', output],
        ['--target', target, '--output-dir', output, '--no-upgrade'],
        ['--target', target, '--output-dir', output, '--force']]) {
        const result = run(args);
        assert.equal(result.status, 1, result.stderr);
        assert.equal(existsSync(output), false);
      }
      const args = ['--target', target, '--output-dir', output];
      const result = run(args);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.equal(existsSync(marker), false, 'installation must not execute extracted source');
      assert.deepEqual(readFileSync(target), bytes, 'input copy is read-only');
      assert.deepEqual(readFileSync(join(output, 'native-copy')), bytes);
      assert.match(readFileSync(join(output, 'cli.original.cjs'), 'utf8'), /return\s*"ant"/);
      for (const name of ['patch.mjs', 'repatch.mjs', 'extract-natives.mjs', 'post-process.mjs', 'manual-install.cjs', 'install.sh', 'install.ps1', 'startup-check.cjs']) {
        assert.equal(existsSync(join(output, name)), false, `${name} must not be installed`);
      }
      const originalFiles = readdirSync(output).sort();
      assert.equal(run(args).status, 1, 'no implicit overwrite/repatch');
      assert.deepEqual(readdirSync(output).sort(), originalFiles);
      assert.equal(run(['--target', target, '--output-dir', root, '--uninstall']).status, 1, 'cannot remove a parent/unowned output');
      assert.equal(run([...args, '--uninstall']).status, 0);
      assert.equal(existsSync(output), false);
      assert.deepEqual(readFileSync(target), bytes);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test('installer rejects synthetic official paths, source/output links and malformed copies before target execution', () => {
  const root = privateFixture('manual-refusals-');
  try {
    const input = join(root, 'input');
    const output = join(root, 'output');
    writeFileSync(input, 'not a binary');
    const run = (target, destination = output) => spawnSync('bash', [shell, '--target', target, '--output-dir', destination], { encoding: 'utf8', timeout: 20000 });
    const syntheticOfficial = join(root, '.local/share/claude/versions');
    mkdirSync(syntheticOfficial, { recursive: true });
    const canary = join(syntheticOfficial, '1');
    writeFileSync(canary, 'synthetic official canary');
    assert.equal(run(canary).status, 1);
    symlinkSync(canary, join(root, 'linked-input'));
    assert.equal(run(join(root, 'linked-input')).status, 1);
    symlinkSync(syntheticOfficial, output, process.platform === 'win32' ? 'junction' : 'dir');
    assert.equal(run(input).status, 1);
    rmSync(output);
    assert.equal(run(input).status, 1);
    assert.equal(existsSync(output), false, 'failed extraction removes its newly owned output');
    assert.equal(readFileSync(canary, 'utf8'), 'synthetic official canary');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
