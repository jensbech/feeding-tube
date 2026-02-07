import { test, describe } from 'node:test';
import assert from 'node:assert';
import { truncate, pad, formatViews, calculateVisibleRows } from '../src/lib/ui.js';

describe('truncate', () => {
  test('returns empty string for null/undefined', () => {
    assert.strictEqual(truncate(null, 10), '');
    assert.strictEqual(truncate(undefined, 10), '');
  });

  test('returns original string if shorter than max', () => {
    assert.strictEqual(truncate('hello', 10), 'hello');
  });

  test('truncates with ellipsis when too long', () => {
    assert.strictEqual(truncate('hello world', 6), 'hello…');
  });

  test('returns original if exactly max length', () => {
    assert.strictEqual(truncate('hello', 5), 'hello');
  });
});

describe('pad', () => {
  test('returns spaces for null/undefined', () => {
    assert.strictEqual(pad(null, 5), '     ');
    assert.strictEqual(pad(undefined, 5), '     ');
  });

  test('pads shorter strings with spaces', () => {
    assert.strictEqual(pad('hi', 5), 'hi   ');
  });

  test('truncates longer strings', () => {
    assert.strictEqual(pad('hello world', 5), 'hello');
  });

  test('returns original if exact length', () => {
    assert.strictEqual(pad('hello', 5), 'hello');
  });
});

describe('formatViews', () => {
  test('returns empty string for null/undefined', () => {
    assert.strictEqual(formatViews(null), '');
    assert.strictEqual(formatViews(undefined), '');
  });

  test('returns 0 as string', () => {
    assert.strictEqual(formatViews(0), '0');
  });

  test('formats small numbers as-is', () => {
    assert.strictEqual(formatViews(500), '500');
  });

  test('formats thousands with K', () => {
    assert.strictEqual(formatViews(1500), '2K');
    assert.strictEqual(formatViews(15000), '15K');
  });

  test('formats millions with M', () => {
    assert.strictEqual(formatViews(1500000), '1.5M');
    assert.strictEqual(formatViews(15000000), '15.0M');
  });
});

describe('calculateVisibleRows', () => {
  test('returns minimum of 5 for small terminals', () => {
    assert.strictEqual(calculateVisibleRows(10), 5);
  });

  test('calculates correctly for normal terminals', () => {
    const result = calculateVisibleRows(24);
    assert.ok(result >= 5);
    assert.ok(result <= 24);
  });

  test('uses 95% of available space', () => {
    const result = calculateVisibleRows(100, 6);
    assert.ok(result > 80);
    assert.ok(result < 95);
  });
});
