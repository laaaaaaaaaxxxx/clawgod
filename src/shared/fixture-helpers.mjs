import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function privateFixture(prefix) {
  const directory = join(realpathSync(tmpdir()), 'claude-bridge-tests');
  mkdirSync(directory, { recursive: true });
  return mkdtempSync(join(directory, prefix));
}
