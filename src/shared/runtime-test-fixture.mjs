import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { privateFixture } from './fixture-helpers.mjs';

const require = createRequire(import.meta.url);
const wrapper = readFileSync(new URL('./cli.cjs', import.meta.url), 'utf8');

export function runtimeFixture() {
  const root = privateFixture('runtime-');
  const output = join(root, 'output');
  const configDir = join(root, 'config');
  mkdirSync(output); mkdirSync(configDir);
  const target = join(output, 'cli.original.cjs');
  const nativeCopy = join(output, 'native-copy');
  writeFileSync(target, '// synthetic source, never a Claude bundle');
  writeFileSync(nativeCopy, 'synthetic native file, never executed');
  const explicit = ['--target', target, '--output-dir', output,
    '--native-copy', nativeCopy, '--config-dir', configDir];
  return {
    root, output, configDir, target, nativeCopy, explicit,
    launch(config = {}, env = {}, args = [], declared = explicit) {
      writeFileSync(join(configDir, 'provider.json'), JSON.stringify(config));
      let loaded = false, exitCode;
      const exit = Symbol('synthetic exit');
      const proc = {
        argv: ['node', join(output, 'cli.cjs'), ...declared, '--', ...args],
        env: { ...env }, execPath: '/synthetic/runtime',
        stderr: { write() {} }, exit(code) { exitCode = code; throw exit; },
      };
      try {
        runInNewContext(wrapper, {
          process: proc, __dirname: output,
          fetch() { throw new Error('Unexpected background network request'); },
          require(name) {
            if (name === target) {
              assert.equal(proc.env.DISABLE_AUTOUPDATER, '1', 'must be set before source loads');
              loaded = true; return {};
            }
            if (['./feature-gates.cjs', './runtime-helpers.cjs', './bun-ant-shim.cjs'].includes(name)) return {};
            if (name.startsWith('node:') || name === './target-policy.cjs') return require(name);
            throw new Error(`Unexpected runtime dependency: ${name}`);
          },
        });
      } catch (error) { if (error !== exit) throw error; }
      return { loaded, exitCode, env: proc.env, execPath: proc.execPath, argv: Array.from(proc.argv) };
    },
    cleanup() { rmSync(root, { recursive: true, force: true }); },
  };
}
