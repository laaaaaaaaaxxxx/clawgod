import assert from 'node:assert/strict';
import { runtimeFixture } from './runtime-test-fixture.mjs';

const fixture = runtimeFixture();
try {
  const custom = { apiKey: 'fixture-key', baseURL: 'https://gateway.invalid', effort: 'high' };
  for (const token of [undefined, '', '   ', '\t', 'fixture-env-token']) {
    const env = { ANTHROPIC_API_KEY: 'stale-key' };
    if (token !== undefined) env.ANTHROPIC_AUTH_TOKEN = token;
    const result = fixture.launch(custom, env);
    assert.ok(result.loaded);
    assert.equal(result.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(result.env.ANTHROPIC_AUTH_TOKEN, token?.trim() || custom.apiKey);
    assert.equal(result.env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  }
  const direct = fixture.launch({ apiKey: 'direct-key' }, { ANTHROPIC_AUTH_TOKEN: 'stale-token' }).env;
  assert.equal(direct.ANTHROPIC_API_KEY, 'direct-key');
  assert.equal(direct.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(fixture.launch({}, { ANTHROPIC_AUTH_TOKEN: 'external-token' }).env.ANTHROPIC_AUTH_TOKEN, 'external-token');
  assert.equal(fixture.launch(custom, { CLAUDE_CODE_EFFORT_LEVEL: 'low' }).env.CLAUDE_CODE_EFFORT_LEVEL, 'low');
  assert.equal(fixture.launch({ ...custom, timeoutMs: 1234 }, { API_TIMEOUT_MS: '9876' }).env.API_TIMEOUT_MS, '9876');
  for (const config of [{ protocol: 'openai-chat' }, { type: 'grok' }, { type: 'openai-compat' }, { protocol: 'auto' }]) {
    assert.throws(() => fixture.launch(config), /Embedded proxy startup is removed/);
  }
  assert.equal(fixture.launch({ protocol: 'anthropic', ...custom }).loaded, true);
  assert.equal(fixture.launch({ protocol: 'openai-chat' }, {}, ['--version']).loaded, true, 'version has no provider side effects');
  console.log('[provider.test] explicit-copy provider auth/precedence preserved; embedded proxy startup refused');
} finally { fixture.cleanup(); }
