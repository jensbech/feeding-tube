import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TEST_DIR = join(tmpdir(), `youtube-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

async function freshDbImport() {
  const cacheBuster = `?t=${Date.now()}-${Math.random()}`;
  const mod = await import(`../src/lib/db.js${cacheBuster}`);
  await mod.getDb();
  return mod;
}

describe('database module', () => {
  beforeEach(() => setupTestEnv());
  afterEach(async () => {
    try {
      const { closeDb } = await import('../src/lib/db.js');
      closeDb();
    } catch {}
    cleanupTestEnv();
  });

  test('getSubscriptions returns empty array initially', async () => {
    const { getSubscriptions } = await freshDbImport();
    const subs = getSubscriptions();
    assert.ok(Array.isArray(subs));
    assert.strictEqual(subs.length, 0);
  });

  test('addSubscription adds new subscription', async () => {
    const { addSubscription, getSubscriptions } = await freshDbImport();
    const result = addSubscription({
      id: 'test-channel',
      name: 'Test Channel',
      url: 'https://youtube.com/channel/test',
    });
    assert.ok(result.success);
    const subs = getSubscriptions();
    assert.strictEqual(subs.length, 1);
    assert.strictEqual(subs[0].name, 'Test Channel');
    assert.strictEqual(subs[0].id, 'test-channel');
  });

  test('addSubscription rejects duplicates by id', async () => {
    const { addSubscription } = await freshDbImport();
    const channel = { id: 'test', name: 'Test', url: 'https://youtube.com/test' };
    addSubscription(channel);
    const result = addSubscription({ ...channel, name: 'Different Name' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('already exists'));
  });

  test('addSubscription rejects duplicates by url', async () => {
    const { addSubscription } = await freshDbImport();
    addSubscription({ id: 'test1', name: 'Test 1', url: 'https://youtube.com/test' });
    const result = addSubscription({ id: 'test2', name: 'Test 2', url: 'https://youtube.com/test' });
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('already exists'));
  });

  test('removeSubscription removes by id', async () => {
    const { addSubscription, removeSubscription, getSubscriptions } = await freshDbImport();
    addSubscription({ id: 'test1', name: 'Test 1', url: 'https://youtube.com/1' });
    addSubscription({ id: 'test2', name: 'Test 2', url: 'https://youtube.com/2' });

    const result = removeSubscription('test1');
    assert.ok(result.success);
    const subs = getSubscriptions();
    assert.strictEqual(subs.length, 1);
    assert.strictEqual(subs[0].id, 'test2');
  });

  test('removeSubscription returns error for non-existent', async () => {
    const { removeSubscription } = await freshDbImport();
    const result = removeSubscription('non-existent');
    assert.strictEqual(result.success, false);
    assert.ok(result.error.includes('not found'));
  });

  test('getSettings returns defaults initially', async () => {
    const { getSettings } = await freshDbImport();
    const settings = getSettings();
    assert.strictEqual(settings.player, 'mpv');
    assert.strictEqual(settings.hideShorts, true);
    assert.strictEqual(settings.videosPerChannel, 15);
  });

  test('updateSettings merges settings', async () => {
    const { updateSettings, getSettings } = await freshDbImport();
    updateSettings({ player: 'vlc' });
    const settings = getSettings();
    assert.strictEqual(settings.player, 'vlc');
    assert.strictEqual(settings.hideShorts, true);
  });

  test('updateSettings handles complex values', async () => {
    const { updateSettings, getSettings } = await freshDbImport();
    updateSettings({ customList: [1, 2, 3], nested: { a: 1 } });
    const settings = getSettings();
    assert.deepStrictEqual(settings.customList, [1, 2, 3]);
    assert.deepStrictEqual(settings.nested, { a: 1 });
  });

  test('markAsWatched and isWatched work correctly', async () => {
    const { markAsWatched, isWatched } = await freshDbImport();
    assert.strictEqual(isWatched('video1'), false);
    markAsWatched('video1');
    assert.strictEqual(isWatched('video1'), true);
  });

  test('getWatchedIds returns set of watched video ids', async () => {
    const { markAsWatched, getWatchedIds } = await freshDbImport();
    markAsWatched('video1');
    markAsWatched('video2');
    const ids = getWatchedIds();
    assert.ok(ids instanceof Set);
    assert.ok(ids.has('video1'));
    assert.ok(ids.has('video2'));
    assert.strictEqual(ids.size, 2);
  });

  test('toggleWatched toggles watched state', async () => {
    const { toggleWatched, isWatched } = await freshDbImport();
    assert.strictEqual(toggleWatched('video1'), true);
    assert.strictEqual(isWatched('video1'), true);
    assert.strictEqual(toggleWatched('video1'), false);
    assert.strictEqual(isWatched('video1'), false);
  });

  test('markChannelAllWatched marks multiple videos', async () => {
    const { markChannelAllWatched, isWatched } = await freshDbImport();
    const count = markChannelAllWatched(['v1', 'v2', 'v3']);
    assert.strictEqual(count, 3);
    assert.strictEqual(isWatched('v1'), true);
    assert.strictEqual(isWatched('v2'), true);
    assert.strictEqual(isWatched('v3'), true);
  });

  test('markChannelAllWatched skips already watched', async () => {
    const { markAsWatched, markChannelAllWatched } = await freshDbImport();
    markAsWatched('v1');
    const count = markChannelAllWatched(['v1', 'v2']);
    assert.strictEqual(count, 1);
  });

  test('storeVideos stores new videos', async () => {
    const { storeVideos, getStoredVideos } = await freshDbImport();
    const count = storeVideos([
      { id: 'v1', title: 'Video 1', url: 'url1', channelId: 'ch1', channelName: 'Channel 1' },
      { id: 'v2', title: 'Video 2', url: 'url2', channelId: 'ch1', channelName: 'Channel 1' },
    ]);
    assert.strictEqual(count, 2);

    const videos = getStoredVideos('ch1');
    assert.strictEqual(videos.length, 2);
  });

  test('storeVideos skips existing videos', async () => {
    const { storeVideos } = await freshDbImport();
    storeVideos([{ id: 'v1', title: 'Video 1', url: 'url1', channelId: 'ch1' }]);
    const count = storeVideos([
      { id: 'v1', title: 'Video 1 Updated', url: 'url1', channelId: 'ch1' },
      { id: 'v2', title: 'Video 2', url: 'url2', channelId: 'ch1' },
    ]);
    assert.strictEqual(count, 1);
  });

  test('storeVideos handles publishedDate correctly', async () => {
    const { storeVideos, getStoredVideos } = await freshDbImport();
    const date = new Date('2024-06-15T12:00:00Z');
    storeVideos([{ id: 'v1', title: 'Video 1', url: 'url1', channelId: 'ch1', publishedDate: date }]);

    const videos = getStoredVideos('ch1');
    assert.ok(videos[0].publishedDate instanceof Date);
    assert.strictEqual(videos[0].publishedDate.toISOString(), date.toISOString());
  });

  test('storeVideos handles isShort flag', async () => {
    const { storeVideos, getStoredVideos } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Video', url: 'url1', channelId: 'ch1', isShort: false },
      { id: 'v2', title: 'Short', url: 'url2', channelId: 'ch1', isShort: true },
    ]);

    const videos = getStoredVideos('ch1');
    const video = videos.find(v => v.id === 'v1');
    const short = videos.find(v => v.id === 'v2');
    assert.strictEqual(video.isShort, false);
    assert.strictEqual(short.isShort, true);
  });

  test('getAllStoredVideos returns all videos', async () => {
    const { storeVideos, getAllStoredVideos } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Video 1', url: 'url1', channelId: 'ch1' },
      { id: 'v2', title: 'Video 2', url: 'url2', channelId: 'ch2' },
    ]);

    const videos = getAllStoredVideos();
    assert.strictEqual(videos.length, 2);
  });

  test('getStoredVideosPaginated returns paginated results', async () => {
    const { storeVideos, getStoredVideosPaginated } = await freshDbImport();
    const videos = [];
    for (let i = 0; i < 25; i++) {
      videos.push({
        id: `v${i}`,
        title: `Video ${i}`,
        url: `url${i}`,
        channelId: 'ch1',
        publishedDate: new Date(2024, 0, 25 - i)
      });
    }
    storeVideos(videos);

    const page1 = getStoredVideosPaginated(['ch1'], 0, 10);
    assert.strictEqual(page1.videos.length, 10);
    assert.strictEqual(page1.total, 25);
    assert.strictEqual(page1.page, 0);
    assert.strictEqual(page1.pageSize, 10);

    const page3 = getStoredVideosPaginated(['ch1'], 2, 10);
    assert.strictEqual(page3.videos.length, 5);
  });

  test('getStoredVideosPaginated returns videos sorted by date descending', async () => {
    const { storeVideos, getStoredVideosPaginated } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Old', url: 'url1', channelId: 'ch1', publishedDate: new Date('2024-01-01') },
      { id: 'v2', title: 'New', url: 'url2', channelId: 'ch1', publishedDate: new Date('2024-06-01') },
      { id: 'v3', title: 'Mid', url: 'url3', channelId: 'ch1', publishedDate: new Date('2024-03-01') },
    ]);

    const result = getStoredVideosPaginated(['ch1'], 0, 10);
    assert.strictEqual(result.videos[0].id, 'v2');
    assert.strictEqual(result.videos[1].id, 'v3');
    assert.strictEqual(result.videos[2].id, 'v1');
  });

  test('getChannelLastViewed returns null initially', async () => {
    const { getChannelLastViewed } = await freshDbImport();
    assert.strictEqual(getChannelLastViewed('ch1'), null);
  });

  test('updateChannelLastViewed sets timestamp', async () => {
    const { updateChannelLastViewed, getChannelLastViewed } = await freshDbImport();
    updateChannelLastViewed('ch1');
    const timestamp = getChannelLastViewed('ch1');
    assert.ok(timestamp instanceof Date);
    assert.ok(Date.now() - timestamp.getTime() < 5000);
  });

  test('markAllChannelsViewed updates multiple channels', async () => {
    const { markAllChannelsViewed, getChannelLastViewed } = await freshDbImport();
    markAllChannelsViewed(['ch1', 'ch2', 'ch3']);
    assert.ok(getChannelLastViewed('ch1') instanceof Date);
    assert.ok(getChannelLastViewed('ch2') instanceof Date);
    assert.ok(getChannelLastViewed('ch3') instanceof Date);
  });

  test('getNewVideoCounts returns counts of new videos', async () => {
    const { storeVideos, getNewVideoCounts, updateChannelLastViewed } = await freshDbImport();
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);
    const future = new Date(now.getTime() + 86400000);

    storeVideos([
      { id: 'v1', title: 'Old', url: 'url1', channelId: 'ch1', publishedDate: past },
      { id: 'v2', title: 'New', url: 'url2', channelId: 'ch1', publishedDate: future },
    ]);

    updateChannelLastViewed('ch1');
    const counts = getNewVideoCounts();
    assert.strictEqual(counts.get('ch1'), 1);
  });

  test('getNewVideoCounts respects hideShorts', async () => {
    const { storeVideos, getNewVideoCounts } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Video', url: 'url1', channelId: 'ch1', publishedDate: new Date(), isShort: false },
      { id: 'v2', title: 'Short', url: 'url2', channelId: 'ch1', publishedDate: new Date(), isShort: true },
    ]);

    const withShorts = getNewVideoCounts(false);
    const withoutShorts = getNewVideoCounts(true);

    assert.strictEqual(withShorts.get('ch1'), 2);
    assert.strictEqual(withoutShorts.get('ch1'), 1);
  });

  test('getFullyWatchedChannels returns set of fully watched channels', async () => {
    const { storeVideos, markAsWatched, getFullyWatchedChannels } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Video 1', url: 'url1', channelId: 'ch1' },
      { id: 'v2', title: 'Video 2', url: 'url2', channelId: 'ch1' },
      { id: 'v3', title: 'Video 3', url: 'url3', channelId: 'ch2' },
    ]);

    markAsWatched('v1');
    markAsWatched('v2');

    const fullyWatched = getFullyWatchedChannels();
    assert.ok(fullyWatched.has('ch1'));
    assert.ok(!fullyWatched.has('ch2'));
  });

  test('getFullyWatchedChannels respects hideShorts', async () => {
    const { storeVideos, markAsWatched, getFullyWatchedChannels } = await freshDbImport();
    storeVideos([
      { id: 'v1', title: 'Video', url: 'url1', channelId: 'ch1', isShort: false },
      { id: 'v2', title: 'Short', url: 'url2', channelId: 'ch1', isShort: true },
    ]);

    markAsWatched('v1');

    const withShorts = getFullyWatchedChannels(false);
    const withoutShorts = getFullyWatchedChannels(true);

    assert.ok(!withShorts.has('ch1'));
    assert.ok(withoutShorts.has('ch1'));
  });

  test('subscriptions are sorted case-insensitively', async () => {
    const { addSubscription, getSubscriptions } = await freshDbImport();
    addSubscription({ id: 'c', name: 'Charlie', url: 'url3' });
    addSubscription({ id: 'a', name: 'alice', url: 'url1' });
    addSubscription({ id: 'b', name: 'Bob', url: 'url2' });

    const subs = getSubscriptions();
    assert.strictEqual(subs[0].name, 'alice');
    assert.strictEqual(subs[1].name, 'Bob');
    assert.strictEqual(subs[2].name, 'Charlie');
  });

  test('database persists across sessions', async () => {
    const mod1 = await freshDbImport();
    mod1.addSubscription({ id: 'test', name: 'Test', url: 'url' });
    mod1.storeVideos([{ id: 'v1', title: 'Video', url: 'url', channelId: 'test' }]);
    mod1.markAsWatched('v1');
    mod1.closeDb();

    const mod2 = await freshDbImport();
    const subs = mod2.getSubscriptions();
    const videos = mod2.getStoredVideos('test');
    const isWatched = mod2.isWatched('v1');

    assert.strictEqual(subs.length, 1);
    assert.strictEqual(videos.length, 1);
    assert.strictEqual(isWatched, true);
  });
});
