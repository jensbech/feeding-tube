import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  getOsloOffset,
  getRelativeDateFromDate,
  formatDateYYYYMMDD,
  parseDateYYYYMMDD,
  formatDuration,
  decodeXMLEntities,
} from '../src/lib/dateUtils.js';

describe('getOsloOffset', () => {
  test('returns winter offset for January', () => {
    const winterDate = new Date(Date.UTC(2024, 0, 15));
    const offset = getOsloOffset(winterDate);
    assert.strictEqual(offset, 1 * 60 * 60 * 1000);
  });

  test('returns summer offset for July', () => {
    const summerDate = new Date(Date.UTC(2024, 6, 15));
    const offset = getOsloOffset(summerDate);
    assert.strictEqual(offset, 2 * 60 * 60 * 1000);
  });
});

describe('getRelativeDateFromDate', () => {
  test('returns upcoming for future dates', () => {
    const now = new Date('2024-06-15T12:00:00Z');
    const future = new Date('2024-06-16T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(future, now), 'upcoming');
  });

  test('returns minutes ago', () => {
    const now = new Date('2024-06-15T12:30:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '30m ago');
  });

  test('returns hours ago', () => {
    const now = new Date('2024-06-15T15:00:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '3h ago');
  });

  test('returns days ago', () => {
    const now = new Date('2024-06-18T12:00:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '3d ago');
  });

  test('returns weeks ago', () => {
    const now = new Date('2024-06-29T12:00:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '2w ago');
  });

  test('returns months ago', () => {
    const now = new Date('2024-09-15T12:00:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '3mo ago');
  });

  test('returns years ago', () => {
    const now = new Date('2026-06-15T12:00:00Z');
    const past = new Date('2024-06-15T12:00:00Z');
    assert.strictEqual(getRelativeDateFromDate(past, now), '2y ago');
  });
});

describe('formatDateYYYYMMDD', () => {
  test('formats date correctly', () => {
    const date = new Date(2024, 5, 15);
    assert.strictEqual(formatDateYYYYMMDD(date), '20240615');
  });

  test('pads single-digit months', () => {
    const date = new Date(2024, 0, 5);
    assert.strictEqual(formatDateYYYYMMDD(date), '20240105');
  });
});

describe('parseDateYYYYMMDD', () => {
  test('parses valid date string', () => {
    const result = parseDateYYYYMMDD('20240615');
    assert.strictEqual(result.getFullYear(), 2024);
    assert.strictEqual(result.getMonth(), 5);
    assert.strictEqual(result.getDate(), 15);
  });

  test('returns null for null/empty', () => {
    assert.strictEqual(parseDateYYYYMMDD(null), null);
    assert.strictEqual(parseDateYYYYMMDD(''), null);
  });

  test('returns null for wrong length', () => {
    assert.strictEqual(parseDateYYYYMMDD('2024'), null);
    assert.strictEqual(parseDateYYYYMMDD('202406151'), null);
  });
});

describe('formatDuration', () => {
  test('returns --:-- for falsy values', () => {
    assert.strictEqual(formatDuration(0), '--:--');
    assert.strictEqual(formatDuration(null), '--:--');
    assert.strictEqual(formatDuration(undefined), '--:--');
  });

  test('formats seconds only', () => {
    assert.strictEqual(formatDuration(45), '0:45');
  });

  test('formats minutes and seconds', () => {
    assert.strictEqual(formatDuration(125), '2:05');
    assert.strictEqual(formatDuration(3599), '59:59');
  });

  test('formats hours, minutes, and seconds', () => {
    assert.strictEqual(formatDuration(3600), '1:00:00');
    assert.strictEqual(formatDuration(3661), '1:01:01');
    assert.strictEqual(formatDuration(7325), '2:02:05');
  });
});

describe('decodeXMLEntities', () => {
  test('decodes &amp;', () => {
    assert.strictEqual(decodeXMLEntities('A &amp; B'), 'A & B');
  });

  test('decodes &lt; and &gt;', () => {
    assert.strictEqual(decodeXMLEntities('&lt;tag&gt;'), '<tag>');
  });

  test('decodes &quot;', () => {
    assert.strictEqual(decodeXMLEntities('&quot;hello&quot;'), '"hello"');
  });

  test('decodes &#39; and &apos;', () => {
    assert.strictEqual(decodeXMLEntities("it&#39;s"), "it's");
    assert.strictEqual(decodeXMLEntities("it&apos;s"), "it's");
  });

  test('decodes multiple entities', () => {
    assert.strictEqual(
      decodeXMLEntities('&lt;a href=&quot;#&quot;&gt;link&lt;/a&gt;'),
      '<a href="#">link</a>'
    );
  });
});
