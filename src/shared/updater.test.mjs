import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runtimeFixture } from './runtime-test-fixture.mjs';

const fixture = runtimeFixture();
try {
  const settings = join(fixture.configDir, 'settings.json');
  writeFileSync(settings, '{"synthetic":"unchanged"}');
  const before = readFileSync(settings, 'utf8');
  for (const inherited of [undefined, '', '0', 'false', '1']) {
    const env = inherited === undefined ? {} : { DISABLE_AUTOUPDATER: inherited };
    const result = fixture.launch({}, env);
    assert.equal(result.loaded, true);
    assert.equal(result.env.DISABLE_AUTOUPDATER, '1');
    assert.equal(result.env.CLAUDE_CONFIG_DIR, fixture.configDir);
    assert.equal(result.env.CLAUDE_SECURESTORAGE_CONFIG_DIR, fixture.configDir);
    assert.equal(result.env.CLAUDE_CODE_EXECPATH, fixture.nativeCopy);
    assert.equal(result.execPath, fixture.nativeCopy);
  }
  for (const command of ['update', 'upgrade', 'install', 'uninstall', 'import', '--lean-on', '--lean-off', '--lean-max']) {
    for (const args of [[command], ['--debug', command]]) {
      const result = fixture.launch({}, {}, args);
      assert.equal(result.loaded, false, `${command}: no native/ClawGod fallback`);
      assert.equal(result.exitCode, 1);
    }
  }
  assert.throws(() => fixture.launch({}, {}, [], []), /absolute path is required/);
  assert.throws(() => fixture.launch({}, {}, [], [...fixture.explicit, '--force']), /Unknown argument/);
  for (const name of ['.update-check', '.clawgod-version', 'repatch.mjs', 'install.sh', 'install.ps1']) {
    assert.equal(existsSync(join(fixture.output, name)), false);
  }
  assert.equal(readFileSync(settings, 'utf8'), before);
  assert.deepEqual(readdirSync(fixture.configDir).sort(), ['provider.json', 'settings.json']);
  console.log('[updater.test] forced updater disable, explicit config/native copy, command refusal and zero background/config mutation passed');
} finally { fixture.cleanup(); }
