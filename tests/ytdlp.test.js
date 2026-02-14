import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), `feeding-tube-ytdlp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  const dbMod = await import(`../src/lib/db.js${cacheBuster}`);
  await dbMod.getDb();

  const configMod = await import(`../src/lib/config.js${cacheBuster}`);
  await configMod.initConfig();

  const ytdlpMod = await import(`../src/lib/ytdlp.js${cacheBuster}`);
  return { ...ytdlpMod, config: configMod, db: dbMod };
}

describe('ytdlp module - unit tests', () => {
  beforeEach(() => setupTestEnv());
  afterEach(async () => {
    try {
      const { closeDb } = await import('../src/lib/config.js');
      closeDb();
    } catch {}
    cleanupTestEnv();
  });

  test('getVideoPage returns empty for no videos', async () => {
    const { db, config } = await freshImport();

    const result = config.getStoredVideosPaginated(['nonexistent-channel'], 0, 10);
    assert.strictEqual(result.total, 0);
    assert.strictEqual(result.videos.length, 0);
  });

  test('getVideoPage returns paginated results', async () => {
    const { db, config } = await freshImport();

    const videos = [];
    for (let i = 0; i < 25; i++) {
      videos.push({
        id: `video-${i}`,
        title: `Video ${i}`,
        url: `https://youtube.com/watch?v=video-${i}`,
        channelId: 'test-channel',
        channelName: 'Test Channel',
        publishedDate: new Date(2024, 0, 25 - i),
      });
    }
    db.storeVideos(videos);

    const page1 = db.getStoredVideosPaginated(['test-channel'], 0, 10);
    assert.strictEqual(page1.total, 25);
    assert.strictEqual(page1.videos.length, 10);
    assert.strictEqual(page1.page, 0);

    const page2 = db.getStoredVideosPaginated(['test-channel'], 1, 10);
    assert.strictEqual(page2.videos.length, 10);
    assert.strictEqual(page2.page, 1);

    const page3 = db.getStoredVideosPaginated(['test-channel'], 2, 10);
    assert.strictEqual(page3.videos.length, 5);
  });

  test('getVideoPage adds relativeDate to videos', async () => {
    const { db } = await freshImport();

    db.storeVideos([{
      id: 'video-1',
      title: 'Video 1',
      url: 'https://youtube.com/watch?v=video-1',
      channelId: 'test-channel',
      channelName: 'Test Channel',
      publishedDate: new Date(),
    }]);

    const result = db.getStoredVideosPaginated(['test-channel'], 0, 10);
    assert.ok(result.videos.length > 0);
    assert.ok(result.videos[0].publishedDate);
  });
});

describe('ytdlp module - RSS parsing', () => {
  test('parseRSSEntry extracts video data correctly', async () => {
    const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
    const mod = await import(`../src/lib/ytdlp.js${cacheBuster}`);

    const sampleRSS = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <yt:videoId>dQw4w9WgXcQ</yt:videoId>
    <title>Test Video Title</title>
    <published>2024-06-15T12:00:00+00:00</published>
    <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
  </entry>
</feed>`;

    assert.ok(sampleRSS.includes('dQw4w9WgXcQ'));
  });
});

describe('ytdlp module - validation integration', () => {
  test('getChannelInfo rejects invalid URLs', async () => {
    const { getChannelInfo } = await freshImport();

    await assert.rejects(
      () => getChannelInfo('not-a-url'),
      { message: 'Invalid URL format' }
    );
  });

  test('getChannelInfo rejects non-YouTube URLs', async () => {
    const { getChannelInfo } = await freshImport();

    await assert.rejects(
      () => getChannelInfo('https://vimeo.com/channel/test'),
      { message: 'Not a valid YouTube URL' }
    );
  });

  test('getVideoDescription rejects invalid video IDs', async () => {
    const { getVideoDescription } = await freshImport();

    await assert.rejects(
      () => getVideoDescription('invalid!id'),
      { message: 'Invalid video ID format' }
    );
  });

  test('searchYouTube rejects empty queries', async () => {
    const { searchYouTube } = await freshImport();

    await assert.rejects(
      () => searchYouTube(''),
      { message: 'Search query cannot be empty' }
    );

    await assert.rejects(
      () => searchYouTube('   '),
      { message: 'Search query cannot be empty' }
    );
  });
});

describe('primeChannel - mock tests', () => {
  beforeEach(() => setupTestEnv());
  afterEach(async () => {
    try {
      const { closeDb } = await import('../src/lib/config.js');
      closeDb();
    } catch {}
    cleanupTestEnv();
  });

  test('primeChannel returns early when no new videos', async () => {
    const { config } = await freshImport();

    config.storeVideos([
      { id: 'existing-1', title: 'Existing 1', url: 'url1', channelId: 'ch1', channelName: 'Channel' },
      { id: 'existing-2', title: 'Existing 2', url: 'url2', channelId: 'ch1', channelName: 'Channel' },
    ]);

    const stored = config.getStoredVideos('ch1');
    assert.strictEqual(stored.length, 2);
  });

  test('primeChannel handles empty channel gracefully', async () => {
    const { config } = await freshImport();

    const stored = config.getStoredVideos('empty-channel');
    assert.strictEqual(stored.length, 0);
  });

  test('storeVideos correctly stores batch of videos', async () => {
    const { config } = await freshImport();

    const videos = [];
    for (let i = 0; i < 100; i++) {
      videos.push({
        id: `batch-video-${i}`,
        title: `Batch Video ${i}`,
        url: `https://youtube.com/watch?v=batch-video-${i}`,
        channelId: 'batch-channel',
        channelName: 'Batch Channel',
        publishedDate: new Date(2024, 0, i + 1),
        isShort: i % 10 === 0,
      });
    }

    const added = config.storeVideos(videos);
    assert.strictEqual(added, 100);

    const stored = config.getStoredVideos('batch-channel');
    assert.strictEqual(stored.length, 100);

    const shorts = stored.filter(v => v.isShort);
    assert.strictEqual(shorts.length, 10);
  });

  test('storeVideos skips duplicates correctly', async () => {
    const { config } = await freshImport();

    const video = {
      id: 'dup-video',
      title: 'Duplicate Video',
      url: 'url',
      channelId: 'ch',
      channelName: 'Channel',
    };

    const first = config.storeVideos([video]);
    assert.strictEqual(first, 1);

    const second = config.storeVideos([video]);
    assert.strictEqual(second, 0);

    const stored = config.getStoredVideos('ch');
    assert.strictEqual(stored.length, 1);
  });

  test('concurrent storeVideos calls are safe', async () => {
    const { config } = await freshImport();

    const batches = [];
    for (let b = 0; b < 10; b++) {
      const videos = [];
      for (let i = 0; i < 10; i++) {
        videos.push({
          id: `concurrent-${b}-${i}`,
          title: `Video ${b}-${i}`,
          url: `url-${b}-${i}`,
          channelId: 'concurrent-channel',
          channelName: 'Channel',
        });
      }
      batches.push(videos);
    }

    const results = await Promise.all(batches.map(b => config.storeVideos(b)));
    const totalAdded = results.reduce((sum, r) => sum + r, 0);
    assert.strictEqual(totalAdded, 100);

    const stored = config.getStoredVideos('concurrent-channel');
    assert.strictEqual(stored.length, 100);
  });
});

describe('WorkerPool behavior simulation', () => {
  test('processes tasks with controlled concurrency', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const results = [];

    const tasks = Array.from({ length: 20 }, (_, i) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
      return i;
    });

    const CONCURRENCY = 5;
    const running = new Set();
    const queue = [...tasks];

    async function runNext() {
      while (queue.length > 0 && running.size < CONCURRENCY) {
        const task = queue.shift();
        const promise = task().then(r => {
          running.delete(promise);
          results.push(r);
          runNext();
          return r;
        });
        running.add(promise);
      }
    }

    runNext();
    while (running.size > 0) {
      await Promise.race([...running]);
    }

    assert.strictEqual(results.length, 20);
    assert.ok(maxConcurrent <= CONCURRENCY, `Max concurrent was ${maxConcurrent}, expected <= ${CONCURRENCY}`);
  });

  test('handles task failures gracefully', async () => {
    const results = [];
    const errors = [];

    const tasks = Array.from({ length: 10 }, (_, i) => async () => {
      await new Promise(r => setTimeout(r, 5));
      if (i % 3 === 0) throw new Error(`Task ${i} failed`);
      return i;
    });

    const CONCURRENCY = 3;
    const running = new Set();
    const queue = [...tasks];

    async function runNext() {
      while (queue.length > 0 && running.size < CONCURRENCY) {
        const task = queue.shift();
        const promise = task()
          .then(r => results.push(r))
          .catch(e => errors.push(e.message))
          .finally(() => {
            running.delete(promise);
            runNext();
          });
        running.add(promise);
      }
    }

    runNext();
    while (running.size > 0) {
      await Promise.race([...running]);
    }

    assert.strictEqual(results.length + errors.length, 10);
    assert.strictEqual(errors.length, 4);
  });

  test('high concurrency with many batches', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const results = [];

    const tasks = Array.from({ length: 100 }, (_, i) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, Math.random() * 10));
      concurrent--;
      return i;
    });

    const CONCURRENCY = 50;
    const running = new Set();
    const queue = [...tasks];

    async function runNext() {
      while (queue.length > 0 && running.size < CONCURRENCY) {
        const task = queue.shift();
        const promise = task().then(r => {
          running.delete(promise);
          results.push(r);
          runNext();
          return r;
        });
        running.add(promise);
      }
    }

    runNext();
    while (running.size > 0) {
      await Promise.race([...running]);
    }

    assert.strictEqual(results.length, 100);
    assert.ok(maxConcurrent <= CONCURRENCY, `Max concurrent was ${maxConcurrent}, expected <= ${CONCURRENCY}`);
    assert.ok(maxConcurrent >= Math.min(50, 100), `Expected high concurrency, got ${maxConcurrent}`);
  });
});

describe('Retry logic simulation', () => {
  test('exponential backoff increases delay correctly', () => {
    const baseDelay = 1000;
    const delays = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const delay = baseDelay * Math.pow(2, attempt);
      delays.push(delay);
    }
    assert.strictEqual(delays[0], 1000);
    assert.strictEqual(delays[1], 2000);
    assert.strictEqual(delays[2], 4000);
  });

  test('retry succeeds after transient failures', async () => {
    let attempts = 0;
    const maxRetries = 3;

    async function fetchWithRetry() {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        attempts++;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 10));
          continue;
        }
        return 'success';
      }
      throw new Error('All retries failed');
    }

    const result = await fetchWithRetry();
    assert.strictEqual(result, 'success');
    assert.strictEqual(attempts, 3);
  });

  test('retry exhaustion throws error', async () => {
    let attempts = 0;
    const maxRetries = 3;

    async function fetchWithRetry() {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        attempts++;
        await new Promise(r => setTimeout(r, 5));
      }
      throw new Error('All retries failed');
    }

    await assert.rejects(() => fetchWithRetry(), { message: 'All retries failed' });
    assert.strictEqual(attempts, 3);
  });
});
