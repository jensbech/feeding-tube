import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), `feeding-tube-player-test-${Date.now()}`);
const originalHome = process.env.HOME;

function setupTestEnv() {
  process.env.HOME = TEST_DIR;
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestEnv() {
  process.env.HOME = originalHome;
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function freshImport() {
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
  return import(`../src/lib/player.js${cacheBuster}`);
}

describe('player module', () => {
  beforeEach(() => setupTestEnv());
  afterEach(() => cleanupTestEnv());

  test('checkPlayer returns boolean', async () => {
    const { checkPlayer } = await freshImport();
    const result = await checkPlayer('nonexistent-player-xyz');
    assert.strictEqual(typeof result, 'boolean');
    assert.strictEqual(result, false);
  });

  test('getAvailablePlayers returns array', async () => {
    const { getAvailablePlayers } = await freshImport();
    const result = await getAvailablePlayers();
    assert.ok(Array.isArray(result));
  });
});
