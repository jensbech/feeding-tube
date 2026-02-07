import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isValidYouTubeUrl,
  isValidVideoId,
  isValidChannelId,
  sanitizeSearchQuery,
  validateUrl,
} from '../src/lib/validation.js';

describe('isValidYouTubeUrl', () => {
  test('accepts valid YouTube URLs', () => {
    assert.ok(isValidYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    assert.ok(isValidYouTubeUrl('https://youtube.com/watch?v=dQw4w9WgXcQ'));
    assert.ok(isValidYouTubeUrl('https://youtu.be/dQw4w9WgXcQ'));
    assert.ok(isValidYouTubeUrl('https://www.youtube.com/@Fireship'));
  });

  test('rejects invalid URLs', () => {
    assert.ok(!isValidYouTubeUrl(null));
    assert.ok(!isValidYouTubeUrl(undefined));
    assert.ok(!isValidYouTubeUrl(''));
    assert.ok(!isValidYouTubeUrl('https://example.com/video'));
    assert.ok(!isValidYouTubeUrl('not a url'));
  });
});

describe('isValidVideoId', () => {
  test('accepts valid video IDs', () => {
    assert.ok(isValidVideoId('dQw4w9WgXcQ'));
    assert.ok(isValidVideoId('abc123-_ABC'));
  });

  test('rejects invalid video IDs', () => {
    assert.ok(!isValidVideoId(null));
    assert.ok(!isValidVideoId(''));
    assert.ok(!isValidVideoId('short'));
    assert.ok(!isValidVideoId('toolongvideoidshouldnotwork'));
    assert.ok(!isValidVideoId('has spaces!'));
  });
});

describe('isValidChannelId', () => {
  test('accepts valid channel IDs', () => {
    assert.ok(isValidChannelId('UCabcdefghij1234567890ab'));
  });

  test('rejects invalid channel IDs', () => {
    assert.ok(!isValidChannelId(null));
    assert.ok(!isValidChannelId(''));
    assert.ok(!isValidChannelId('UCshort'));
    assert.ok(!isValidChannelId('notUC1234567890123456789012'));
  });
});

describe('sanitizeSearchQuery', () => {
  test('trims whitespace', () => {
    assert.strictEqual(sanitizeSearchQuery('  hello  '), 'hello');
  });

  test('truncates long queries', () => {
    const longQuery = 'a'.repeat(1000);
    assert.strictEqual(sanitizeSearchQuery(longQuery).length, 500);
  });

  test('returns empty string for null/undefined', () => {
    assert.strictEqual(sanitizeSearchQuery(null), '');
    assert.strictEqual(sanitizeSearchQuery(undefined), '');
  });
});

describe('validateUrl', () => {
  test('accepts valid HTTP/HTTPS URLs', () => {
    assert.ok(validateUrl('https://example.com'));
    assert.ok(validateUrl('http://example.com/path'));
  });

  test('rejects invalid URLs', () => {
    assert.ok(!validateUrl('not a url'));
    assert.ok(!validateUrl('ftp://example.com'));
    assert.ok(!validateUrl('javascript:alert(1)'));
  });
});
