import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFileSync, mkdirSync, rmSync, linkSync, symlinkSync, readFileSync } from 'node:fs';
import { join, win32, posix } from 'node:path';
import { privateFixture } from './fixture-helpers.mjs';
import policy from './target-policy.cjs';

test('explicit paths have no default, traversal, prefix or official-location escape', () => {
  for (const value of [undefined, '', 'claude', './claude', '/fixture/home/.local/bin/claude',
    '/fixture/claude-bridge-tests-shadow/cli.original.cjs',
    '/fixture/claude-bridge-tests/../official/claude',
    '/fixture/claude-bridge-tests/.claude/settings.json',
    '/fixture/claude-bridge-tests/.local/share/claude/versions/1',
    '/fixture/claude-bridge-tests/node_modules/@anthropic-ai/claude-code/cli.js']) {
    assert.throws(() => policy.assertDeclaredPath(value, 'fixture', posix), value);
  }
  for (const value of ['C:\\fixture\\home\\.local\\bin\\claude.exe',
    'C:\\fixture\\claude-bridge-tests\\..\\official\\claude.exe',
    'C:\\fixture\\claude-bridge-tests\\.claude\\settings.json',
    'C:\\fixture\\claude-bridge-tests\\cli.cjs:stream',
    '\\\\server\\claude-bridge-tests\\cli.cjs',
    'C:\\fixture\\claude-bridge-tests\\CON',
    'C:\\fixture\\claude-bridge-tests\\output.\\cli.cjs']) {
    assert.throws(() => policy.assertDeclaredPath(value, 'fixture', win32), value);
  }
  assert.equal(policy.assertDeclaredPath('/fixture/claude-bridge-tests/copy', 'fixture', posix), '/fixture/claude-bridge-tests/copy');
  assert.equal(policy.assertDeclaredPath('C:\\fixture\\claude-bridge-kiro\\copy.exe', 'fixture', win32), 'C:\\fixture\\claude-bridge-kiro\\copy.exe');
});

test('symlink parents, dangling links and hard links are refused without changing a canary', () => {
  const root = privateFixture('path-policy-');
  try {
    const file = join(root, 'canary');
    writeFileSync(file, 'synthetic canary');
    const linked = join(root, 'hard-link');
    linkSync(file, linked);
    assert.throws(() => policy.assertPrivatePath(linked, 'hard link'), /hard-linked/);
    rmSync(linked);
    const directory = join(root, 'directory');
    mkdirSync(directory);
    const alias = join(root, 'alias');
    symlinkSync(directory, alias, process.platform === 'win32' ? 'junction' : 'dir');
    assert.throws(() => policy.assertPrivatePath(join(alias, 'new-file'), 'parent link'), /links\/junctions/);
    symlinkSync(join(root, 'missing'), join(root, 'dangling'));
    assert.throws(() => policy.assertPrivatePath(join(root, 'dangling'), 'dangling'), /links\/junctions/);
    assert.throws(() => policy.assertPrivateTree(root), /links\/junctions/);
    assert.equal(readFileSync(file, 'utf8'), 'synthetic canary');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('low-level source entry requires both explicit paths and exact output membership', () => {
  const root = privateFixture('source-policy-');
  try {
    const target = join(root, 'cli.original.cjs');
    writeFileSync(target, '// synthetic');
    for (const args of [[], ['--target', target], ['--output-dir', root],
      ['--target', target, '--output-dir', root, '--force'],
      ['--target', target, '--target', target, '--output-dir', root]]) {
      assert.throws(() => policy.sourceOptions(args));
    }
    assert.equal(policy.sourceOptions(['--target', target, '--output-dir', root]).target, target);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
