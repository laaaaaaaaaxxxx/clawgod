'use strict';

const fs = require('node:fs');
const path = require('node:path');

// This fork has no discovery or override: only explicitly named bridge copies
// are eligible. These are path boundaries, never directories to search.
const COPY_ROOTS = new Set(['claude-bridge-tests', 'claude-bridge-kiro']);
const PROTECTED_PARTS = new Set(['.claude', '.claude-code',
  '.clawgod', 'claude-code', '@anthropic-ai', 'anthropic', 'claude code.app',
  'claude code url handler.app']);

function assertDeclaredPath(value, label, flavor = path) {
  if (typeof value !== 'string' || !value || !flavor.isAbsolute(value)) {
    throw new Error(`${label}: an explicit absolute path is required`);
  }
  if (/[\x00-\x1f]/.test(value) || value.startsWith('\\\\') || value.startsWith('//')) {
    throw new Error(`${label}: device/network/control-character paths are forbidden`);
  }
  const normalized = flavor.normalize(value);
  if (normalized !== value || value.slice(flavor.parse(value).root.length).includes(':')) {
    throw new Error(`${label}: use a canonical path without traversal or alternate streams`);
  }
  const parts = value.slice(flavor.parse(value).root.length).split(flavor.sep).map(p => p.toLowerCase());
  if (!parts.some(p => COPY_ROOTS.has(p))) {
    throw new Error(`${label}: only an explicitly declared claude-bridge-tests or claude-bridge-kiro copy is allowed`);
  }
  if (parts.some(p => PROTECTED_PARTS.has(p)) ||
      parts.slice(0, -1).includes('claude') ||
      parts.some(p => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)) ||
      parts.some(p => /[. ]$/.test(p))) {
    throw new Error(`${label}: official Claude locations and reserved paths are forbidden`);
  }
  return value;
}

function assertPrivatePath(value, label, { kind, mustExist = false } = {}) {
  assertDeclaredPath(value, label);
  let current = path.parse(value).root;
  const parts = value.slice(current.length).split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    const info = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!info) {
      if (mustExist) throw new Error(`${label}: declared path does not exist`);
      return value;
    }
    if (info.isSymbolicLink()) throw new Error(`${label}: symbolic links/junctions are forbidden`);
    const canonical = fs.realpathSync.native(current);
    const same = process.platform === 'win32'
      ? canonical.toLowerCase() === current.toLowerCase() : canonical === current;
    if (!same) throw new Error(`${label}: redirected/aliased paths are forbidden`);
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error(`${label}: parent is not a directory`);
    if (info.isFile() && info.nlink !== 1) throw new Error(`${label}: hard-linked files are forbidden`);
    if (!info.isDirectory() && !info.isFile()) throw new Error(`${label}: only regular files/directories are allowed`);
    if (index === parts.length - 1 && kind &&
        !(kind === 'file' ? info.isFile() : info.isDirectory())) {
      throw new Error(`${label}: expected a ${kind}`);
    }
  }
  return value;
}

function assertWithin(directory, value, label) {
  const rel = path.relative(directory, value);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) {
    throw new Error(`${label}: must be strictly inside the explicitly declared output directory`);
  }
  return assertPrivatePath(value, label);
}

function overlaps(first, second) {
  const inside = (parent, child) => {
    const rel = path.relative(parent, child);
    return !rel || (rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel));
  };
  return inside(first, second) || inside(second, first);
}

function assertPrivateTree(directory) {
  assertPrivatePath(directory, 'output directory', { kind: 'directory', mustExist: true });
  for (const entry of fs.readdirSync(directory)) {
    const name = path.join(directory, entry);
    assertWithin(directory, name, 'output member');
    if (fs.lstatSync(name).isDirectory()) assertPrivateTree(name);
  }
}

function parseArguments(argv, { flags = [], values = ['--target', '--output-dir'] } = {}) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    const name = argv[index];
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate argument: ${name}`);
    if (flags.includes(name)) options[name] = true;
    else if (values.includes(name) && argv[index + 1] && !argv[index + 1].startsWith('--')) {
      options[name] = argv[++index];
    } else throw new Error(`Unknown argument or missing value: ${name}`);
  }
  return options;
}

function sourceOptions(argv, flags = [], entry = 'cli.original.cjs') {
  const options = parseArguments(argv, { flags });
  const output = assertPrivatePath(options['--output-dir'], 'output directory', { kind: 'directory', mustExist: true });
  const target = assertPrivatePath(options['--target'], 'target', { kind: 'file', mustExist: true });
  if (target !== path.join(output, entry)) throw new Error(`target must be explicitly declared as output/${entry}`);
  assertPrivateTree(output);
  return { options, output, target };
}

module.exports = { assertDeclaredPath, assertPrivatePath, assertWithin,
  assertPrivateTree, overlaps, parseArguments, sourceOptions };
