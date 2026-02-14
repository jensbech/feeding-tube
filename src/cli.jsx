import React from 'react';
import { render } from 'ink';
import { MouseProvider } from '@ink-tools/ink-mouse';
import meow from 'meow';
import readline from 'readline';
import App from './App.jsx';
import { initConfig, addSubscription, getSubscriptions, closeDb } from './lib/config.js';
import { getChannelInfo, primeChannel } from './lib/ytdlp.js';

const cli = meow(`
  Usage
    $ feeding-tube                    Launch the TUI
    $ feeding-tube --add <url>        Quick-add a channel
    $ feeding-tube --list             List subscriptions (non-interactive)
    $ feeding-tube --channel <index>  Start on a specific channel (by index)
    $ feeding-tube --prime [query]    Prime historical videos (all or specific channel)

  Options
    --add, -a       Add a channel URL directly
    --list, -l      List all subscriptions
    --channel, -c   Start viewing a specific channel (1-indexed)
    --prime, -p     Fetch full history (slow, use once per channel)
    --help          Show this help message
    --version       Show version

  Examples
    $ feeding-tube
    $ feeding-tube --add https://youtube.com/@Fireship
    $ feeding-tube -c 1
    $ feeding-tube --prime
    $ feeding-tube --prime 3
    $ feeding-tube --prime "fireship"

  Navigation
    j/k or arrows   Move up/down
    Enter           Select / Play video
    /               Filter videos
    a               Add subscription
    d               Delete subscription
    v               View all videos
    b / Escape      Go back
    r               Refresh videos
    s               Toggle Shorts filter
    q               Quit
`, {
  importMeta: import.meta,
  flags: {
    add: { type: 'string', shortFlag: 'a' },
    list: { type: 'boolean', shortFlag: 'l' },
    channel: { type: 'number', shortFlag: 'c' },
    prime: { type: 'string', shortFlag: 'p' },
  },
});

function clearLine() {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function writeProgress(name, done, total) {
  clearLine();
  process.stdout.write(`${name}: ${done}/${total} videos`);
}

async function primeWithProgress(channel) {
  process.stdout.write(`${channel.name}: fetching...`);
  try {
    const result = await primeChannel(channel, (done, total) => writeProgress(channel.name, done, total));
    clearLine();
    const suffix = result.partial ? ' (partial - some timed out)' : '';
    console.log(`${channel.name}: added ${result.added} videos${suffix}`);
    return true;
  } catch (err) {
    clearLine();
    console.log(`${channel.name}: failed - ${err.message}`);
    return false;
  }
}

async function promptYesNo(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(question, resolve));
  rl.close();
  return answer.toLowerCase() !== 'n';
}

function findChannelsByQuery(subs, query) {
  const index = parseInt(query, 10);
  if (!isNaN(index) && index >= 1 && index <= subs.length) {
    return [subs[index - 1]];
  }
  const search = query.toLowerCase();
  return subs.filter((s) => s.name.toLowerCase().includes(search));
}

async function handleAdd(url) {
  console.log(`Fetching channel info for: ${url}`);
  try {
    const channelInfo = await getChannelInfo(url);
    const result = addSubscription(channelInfo);

    if (!result.success) {
      console.error(`Error: ${result.error}`);
      process.exit(1);
    }

    console.log(`Added: ${channelInfo.name}`);
    if (await promptYesNo('Prime historical videos? (Y/n) ')) {
      console.log('');
      await primeWithProgress(channelInfo);
    }
  } catch (err) {
    console.error(`Failed to add channel: ${err.message}`);
    process.exit(1);
  }
}

function handleList() {
  const subs = getSubscriptions();
  if (subs.length === 0) {
    console.log('No subscriptions yet. Use --add <url> to add one.');
    return;
  }
  console.log('Subscriptions:');
  subs.forEach((sub, i) => {
    console.log(`  ${i + 1}. ${sub.name}`);
    console.log(`     ${sub.url}`);
  });
}

async function handlePrime(query) {
  const subs = getSubscriptions();
  if (subs.length === 0) {
    console.log('No subscriptions yet. Use --add <url> to add one.');
    return;
  }

  let channelsToPrime = subs;
  if (query !== '') {
    const matches = findChannelsByQuery(subs, query);
    if (matches.length === 0) {
      console.error(`No channel found matching "${query}"`);
      process.exit(1);
    }
    if (matches.length > 1) {
      console.log(`Multiple channels match "${query}":`);
      matches.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
      console.log('\nBe more specific or use the index number.');
      process.exit(1);
    }
    channelsToPrime = matches;
  }

  console.log(`Priming ${channelsToPrime.length} channel(s) with full history...`);
  console.log('This may take a while.\n');

  for (const channel of channelsToPrime) {
    await primeWithProgress(channel);
  }
  console.log('\nDone!');
}

function handleChannel(index) {
  const subs = getSubscriptions();
  const idx = index - 1;
  if (idx < 0 || idx >= subs.length) {
    console.error(`Invalid channel index. You have ${subs.length} subscription(s).`);
    process.exit(1);
  }
  return subs[idx];
}

function setupAltScreen() {
  process.stdout.write('\x1B[?1049h\x1B[H');
  const restore = () => process.stdout.write('\x1B[?1049l');
  process.on('exit', restore);
  process.on('SIGINT', () => { restore(); process.exit(0); });
  process.on('SIGTERM', () => { restore(); process.exit(0); });
}

async function main() {
  await initConfig();

  if (cli.flags.add) {
    await handleAdd(cli.flags.add);
    closeDb();
    return;
  }

  if (cli.flags.list) {
    handleList();
    closeDb();
    return;
  }

  if (cli.flags.prime !== undefined) {
    await handlePrime(cli.flags.prime);
    closeDb();
    return;
  }

  const initialChannel = cli.flags.channel ? handleChannel(cli.flags.channel) : null;

  setupAltScreen();
  render(
    React.createElement(MouseProvider, { cacheInvalidationMs: 0 },
      React.createElement(App, { initialChannel })
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
