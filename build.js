#!/usr/bin/env node

const {
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = __dirname;
const SOURCE_ROOT = join(ROOT, 'src');
const PLACEHOLDER_RE = /{{CLAWGOD:[^}]+}}/g;

const escapeNonAscii = (content) => content.replace(
  /[^\x00-\x7F]/g,
  (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
);

// Feature registry compiled into the wrappers. `patch.mjs --dump-features`
// is the single source of truth (FEATURES in patch.mjs); the wrapper gets a
// machine-generated META constant (patch id → owning feature ids) that its
// startup block uses to compute per-patch gates from patches.json +
// CLAWGOD_FEATURE_* env overrides. Marker line marks the weave point.
const FEATURES_META_MARKER = '// {{CLAWGOD:FEATURES_META}}';

function featuresMeta() {
  const result = spawnSync(process.execPath, [join(SOURCE_ROOT, 'shared/patch.mjs'), '--dump-features'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`patch.mjs --dump-features failed: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function weaveFeaturesMeta(content) {
  if (!content.includes(FEATURES_META_MARKER)) {
    throw new Error(`wrapper source missing ${FEATURES_META_MARKER} marker`);
  }
  const meta = featuresMeta();
  const rendered = `const CLAWGOD_FEATURES_META = ${JSON.stringify(meta, null, 2)};`;
  return content.replace(FEATURES_META_MARKER, () => rendered);
}

const PAYLOADS = [
  'manual-install.cjs', 'target-policy.cjs', 'extract-natives.mjs',
  'post-process.mjs', 'patch.mjs', 'ast-patches.mjs', 'acorn.mjs',
  'acorn.LICENSE', 'cli.cjs', 'feature-gates.cjs', 'runtime-helpers.cjs',
  'bun-ant-shim.cjs', 'features.json',
];
const TARGETS = [
  { name: 'install.sh', template: 'templates/install.sh', mode: 0o755 },
  { name: 'install.ps1', template: 'templates/install.ps1', asciiOnly: true },
];

function installerBundle() {
  const payloads = Object.fromEntries(PAYLOADS.map(name => {
    const source = readSource(`shared/${name}`);
    return [name, name === 'feature-gates.cjs' ? weaveFeaturesMeta(source) : source];
  }));
  return `'use strict';\nconst payloads = ${JSON.stringify(payloads)};\n` +
    `const cache = new Map();\n` +
    `function load(name) {\n` +
    `  if (!name.startsWith('./')) return require(name);\n` +
    `  const key = name.slice(2);\n` +
    `  if (cache.has(key)) return cache.get(key).exports;\n` +
    `  if (!Object.hasOwn(payloads, key)) throw new Error('Unknown embedded module: ' + key);\n` +
    `  const module = { exports: {} }; cache.set(key, module);\n` +
    `  new Function('require', 'module', 'exports', payloads[key])(load, module, module.exports);\n` +
    `  return module.exports;\n}\n` +
    `try { load('./manual-install.cjs').main(process.argv.slice(2), payloads); }\n` +
    `catch (error) { process.stderr.write('[clawgod fork] ' + error.message + '\\n'); process.exitCode = 1; }`;
}

function readSource(relativePath) {
  const path = join(SOURCE_ROOT, relativePath);
  if (!existsSync(path)) throw new Error(`Missing build source: ${relativePath}`);
  const content = readFileSync(path, 'utf8');
  if (!content.endsWith('\n')) {
    throw new Error(`Build source must end with a newline: ${relativePath}`);
  }
  return content.slice(0, -1);
}

function render(target) {
  const templatePath = join(SOURCE_ROOT, target.template);
  if (!existsSync(templatePath)) throw new Error(`Missing template: ${target.template}`);
  let output = readFileSync(templatePath, 'utf8').replace(/^\uFEFF/, '');

  const placeholder = '{{CLAWGOD:INSTALLER}}';
  if (output.split(placeholder).length !== 2) throw new Error('Installer placeholder must occur once');
  const source = installerBundle();
  output = output.replace(placeholder, () => target.asciiOnly ? escapeNonAscii(source) : source);

  const unresolved = output.match(PLACEHOLDER_RE);
  if (unresolved) {
    throw new Error(`${target.template}: unresolved placeholders: ${[...new Set(unresolved)].join(', ')}`);
  }
  if (target.asciiOnly) {
    const nonAsciiIndex = output.search(/[^\x00-\x7F]/);
    if (nonAsciiIndex !== -1) {
      const codePoint = output.codePointAt(nonAsciiIndex).toString(16).toUpperCase();
      throw new Error(`${target.template}: non-ASCII U+${codePoint} at character ${nonAsciiIndex}`);
    }
  }
  return output;
}

function firstDifference(actual, expected) {
  const length = Math.min(actual.length, expected.length);
  for (let index = 0; index < length; index++) {
    if (actual[index] !== expected[index]) return index;
  }
  return actual.length === expected.length ? -1 : length;
}

function checkTarget(target, expected) {
  const outputPath = join(ROOT, target.name);
  if (!existsSync(outputPath)) {
    console.error(`out of date: ${target.name} is missing`);
    return false;
  }
  const actual = readFileSync(outputPath, 'utf8');
  if (actual === expected) {
    console.log(`ok: ${target.name}`);
    return true;
  }
  const offset = firstDifference(actual, expected);
  console.error(`out of date: ${target.name} (first difference at character ${offset})`);
  return false;
}

function main() {
  const check = process.argv.includes('--check');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--check');
  if (unknown.length > 0) {
    console.error(`Unknown argument(s): ${unknown.join(' ')}`);
    process.exit(2);
  }

  let success = true;
  for (const target of TARGETS) {
    const content = render(target);
    if (check) {
      success = checkTarget(target, content) && success;
      continue;
    }
    const outputPath = join(ROOT, target.name);
    writeFileSync(outputPath, content, 'utf8');
    if (target.mode) chmodSync(outputPath, target.mode);
    console.log(`built: ${target.name} (${Buffer.byteLength(content)} bytes)`);
  }
  if (!success) process.exit(1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
