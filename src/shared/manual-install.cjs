'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertPrivatePath, assertPrivateTree, parseArguments, assertWithin, overlaps } = require('./target-policy.cjs');

const TOOL_FILES = ['extract-natives.mjs', 'post-process.mjs', 'patch.mjs',
  'ast-patches.mjs', 'acorn.mjs', 'acorn.LICENSE'];
const RUNTIME_FILES = ['cli.cjs', 'target-policy.cjs', 'feature-gates.cjs',
  'runtime-helpers.cjs', 'bun-ant-shim.cjs', 'features.json'];

function main(argv, payloads) {
  const options = parseArguments(argv, { flags: ['--uninstall'] });
  const target = assertPrivatePath(options['--target'], 'target copy', { kind: 'file', mustExist: true });
  const output = assertPrivatePath(options['--output-dir'], 'output directory', { kind: 'directory' });
  if (overlaps(target, output)) {
    throw new Error('The input copy must be outside the independent output directory');
  }
  if (options['--uninstall']) {
    assertPrivateTree(output);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'copy-manifest.json'), 'utf8'));
    if (manifest.format !== 1 || manifest.target !== target || manifest.output !== output) {
      throw new Error('Explicit target/output do not match this copy installation');
    }
    // Only the declared output is removed; no original launcher is restored.
    fs.rmSync(output, { recursive: true });
    console.log('Removed the explicitly declared copy output. Input/configuration were not changed.');
    return;
  }
  if (fs.existsSync(output)) throw new Error('Output must not exist; no overwrite, recovery or upgrade is supported');
  const stagedNames = [...TOOL_FILES, ...RUNTIME_FILES];
  for (const name of stagedNames) {
    if (typeof payloads[name] !== 'string') throw new Error(`Missing embedded source: ${name}`);
  }
  fs.mkdirSync(output, { recursive: true });
  const run = (name, extra = [], nativeTarget = false) => {
    const result = spawnSync(process.execPath, [path.join(output, name),
      '--target', nativeTarget ? target : path.join(output, name === 'post-process.mjs' ? 'cli.original.js' : 'cli.original.cjs'),
      '--output-dir', output, ...extra], { stdio: 'inherit', timeout: 120000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${name} failed (${result.status}); no CLI was launched`);
  };
  try {
    for (const name of stagedNames) fs.writeFileSync(assertWithin(output, path.join(output, name), 'payload'), payloads[name], { flag: 'wx' });
    // This only reads the declared copy. No native binary is ever executed.
    run('extract-natives.mjs', [], true);
    run('post-process.mjs');
    run('patch.mjs', ['--capture-clean-source']);
    run('patch.mjs');
    fs.copyFileSync(target, path.join(output, 'native-copy'), fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(path.join(output, 'copy-manifest.json'), JSON.stringify({ format: 1, target, output }, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    assertPrivateTree(output);
    fs.rmSync(output, { recursive: true });
    throw error;
  }
  // A completed output contains runtime support, not an installed patch tool.
  for (const name of TOOL_FILES) fs.unlinkSync(path.join(output, name));
  console.log('Patched the explicitly declared copy offline; patch tools removed from output. No launchers/configuration changed and no CLI started.');
}

module.exports = { main };
