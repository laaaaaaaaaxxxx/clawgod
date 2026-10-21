#!/usr/bin/env bun
'use strict';

const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const policy = require('./target-policy.cjs');

const args = process.argv.slice(2);
const boundary = args.indexOf('--');
if (boundary < 0) throw new Error('Explicit --target, --output-dir, --native-copy and --config-dir followed by -- are required');
const options = policy.parseArguments(args.slice(0, boundary), {
  values: ['--target', '--output-dir', '--native-copy', '--config-dir'],
});
const output = policy.assertPrivatePath(options['--output-dir'], 'output directory', { kind: 'directory', mustExist: true });
const target = policy.assertPrivatePath(options['--target'], 'runtime target', { kind: 'file', mustExist: true });
const nativeCopy = policy.assertPrivatePath(options['--native-copy'], 'native copy', { kind: 'file', mustExist: true });
const configDir = policy.assertPrivatePath(options['--config-dir'], 'configuration directory', { kind: 'directory', mustExist: true });
if (output !== __dirname || target !== join(output, 'cli.original.cjs') || nativeCopy !== join(output, 'native-copy')) {
  throw new Error('Runtime paths must match the explicitly declared independent output');
}
policy.assertPrivateTree(output);
if (policy.overlaps(output, configDir)) throw new Error('Configuration must be independent of the runtime output');
policy.assertPrivateTree(configDir);
const userArgs = args.slice(boundary + 1);
if (userArgs.some(arg => ['update', 'upgrade', 'install', 'uninstall', 'import', '--lean-on', '--lean-off', '--lean-max'].includes(arg))) {
  process.stderr.write('[clawgod fork] Installation/update/import/settings automation is disabled.\n');
  process.exit(1);
}

// These values are forced before loading any code from the copy.
process.env.DISABLE_AUTOUPDATER = '1';
process.env.DISABLE_INSTALLATION_CHECKS = '1';
process.env.CLAUDE_CONFIG_DIR = configDir;
process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR = configDir;
process.env.CLAUDE_CODE_EXECPATH = nativeCopy;
process.env.CLAWGOD_CONFIG_DIR = configDir;
Object.defineProperty(process, 'execPath', { value: nativeCopy });
globalThis.__clawgodNativePath = nativeCopy;
process.argv = [process.argv[0], target, ...userArgs];

const versionOnly = userArgs.length === 1 && ['--version', '-v'].includes(userArgs[0]);
const configFile = policy.assertPrivatePath(join(configDir, 'provider.json'), 'provider configuration', { kind: 'file' });
const config = !versionOnly && existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
if ((config.protocol && config.protocol !== 'anthropic') || ['grok', 'openai-compat'].includes(config.type)) {
  throw new Error('Embedded proxy startup is removed; use an explicitly managed external Anthropic-compatible endpoint');
}
if (config.apiKey) {
  if (config.baseURL) process.env.ANTHROPIC_BASE_URL = config.baseURL;
  if (config.model) process.env.ANTHROPIC_MODEL = config.model;
  if (config.smallModel) process.env.ANTHROPIC_SMALL_FAST_MODEL = config.smallModel;
  if (config.baseURL && !/anthropic\.com/i.test(config.baseURL)) {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_AUTH_TOKEN = (process.env.ANTHROPIC_AUTH_TOKEN || '').trim() || config.apiKey;
  } else {
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = config.apiKey;
  }
} else if (config.baseURL) process.env.ANTHROPIC_BASE_URL ??= config.baseURL;
if (config.effort) process.env.CLAUDE_CODE_EFFORT_LEVEL ??= config.effort;
if (config.timeoutMs) process.env.API_TIMEOUT_MS ??= String(config.timeoutMs);
if (config.baseURL && !/anthropic\.com/i.test(config.baseURL)) process.env.CLAUDE_CODE_ATTRIBUTION_HEADER ??= '0';
const featuresFile = policy.assertPrivatePath(join(configDir, 'features.json'), 'feature configuration', { kind: 'file' });
if (!process.env.CLAUDE_INTERNAL_FC_OVERRIDES && existsSync(featuresFile)) {
  const raw = readFileSync(featuresFile, 'utf8');
  JSON.parse(raw);
  process.env.CLAUDE_INTERNAL_FC_OVERRIDES = raw;
}
require('./feature-gates.cjs');
require('./runtime-helpers.cjs');
require('./bun-ant-shim.cjs');
require(target);
