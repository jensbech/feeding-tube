import React from 'react';
import { render } from 'ink';
import { MouseProvider } from '@ink-tools/ink-mouse';
import meow from 'meow';
import readline from 'readline';
import App from './App.jsx';
import { addSubscription, getSubscriptions } from './lib/config.js';
import { getChannelInfo, primeChannel } from './lib/ytdlp.js';

const cli = meow(`
  Usage
    $ youtube-cli                    Launch the TUI
    $ youtube-cli --add <url>        Quick-add a channel
    $ youtube-cli --list             List subscriptions (non-interactive)
    $ youtube-cli --channel <index>  Start on a specific channel (by index)
    $ youtube-cli --prime [query]    Prime historical videos (all or specific channel)

  Options
    --add, -a       Add a channel URL directly
    --list, -l      List all subscriptions
    --channel, -c   Start viewing a specific channel (1-indexed)
    --prime, -p     Fetch full history (slow, use once per channel)
    --help          Show this help message
    --version       Show version

  Examples
    $ youtube-cli
    $ youtube-cli --add https://youtube.com/@Fireship
    $ youtube-cli -c 1
    $ youtube-cli --prime            # Prime all channels
    $ youtube-cli --prime 3          # Prime channel #3
    $ youtube-cli --prime "fireship" # Prime by name

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
    add: {
      type: 'string',
      shortFlag: 'a',
    },
    list: {
      type: 'boolean',
      shortFlag: 'l',
    },
    channel: {
      type: 'number',
      shortFlag: 'c',
    },
    prime: {
      type: 'string',
      shortFlag: 'p',
    },
  },
});

async function main() {
  // Handle --add flag
  if (cli.flags.add) {
    console.log(`Fetching channel info for: ${cli.flags.add}`);
    try {
      const channelInfo = await getChannelInfo(cli.flags.add);
      const result = addSubscription(channelInfo);
      
      if (result.success) {
        console.log(`Added: ${channelInfo.name}`);
        
        // Prompt to prime
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        
        const answer = await new Promise((resolve) => {
          rl.question('Prime historical videos? (Y/n) ', resolve);
        });
        rl.close();
        
        if (answer.toLowerCase() !== 'n') {
          console.log('');
          process.stdout.write(`${channelInfo.name}: fetching...`);
          try {
            const primeResult = await primeChannel(channelInfo, (done, total) => {
              process.stdout.clearLine(0);
              process.stdout.cursorTo(0);
              process.stdout.write(`${channelInfo.name}: ${done}/${total} videos`);
            });
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            if (primeResult.partial) {
              console.log(`${channelInfo.name}: added ${primeResult.added} videos (partial - some timed out)`);
            } else {
              console.log(`${channelInfo.name}: added ${primeResult.added} videos`);
            }
          } catch (err) {
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            console.log(`${channelInfo.name}: failed - ${err.message}`);
          }
        }
      } else {
        console.error(`Error: ${result.error}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`Failed to add channel: ${err.message}`);
      process.exit(1);
    }
    return;
  }

  // Handle --list flag
  if (cli.flags.list) {
    const subs = getSubscriptions();
    if (subs.length === 0) {
      console.log('No subscriptions yet. Use --add <url> to add one.');
    } else {
      console.log('Subscriptions:');
      subs.forEach((sub, i) => {
        console.log(`  ${i + 1}. ${sub.name}`);
        console.log(`     ${sub.url}`);
      });
    }
    return;
  }

  // Handle --prime flag
  if (cli.flags.prime !== undefined) {
    const subs = getSubscriptions();
    if (subs.length === 0) {
      console.log('No subscriptions yet. Use --add <url> to add one.');
      return;
    }

    let channelsToPrime = subs;
    if (cli.flags.prime !== '') {
      const query = cli.flags.prime;
      const index = parseInt(query, 10);
      
      // Check if it's a number (index)
      if (!isNaN(index) && index >= 1 && index <= subs.length) {
        channelsToPrime = [subs[index - 1]];
      } else {
        // Search by name (case-insensitive)
        const search = query.toLowerCase();
        const matches = subs.filter((s) => 
          s.name.toLowerCase().includes(search)
        );
        
        if (matches.length === 0) {
          console.error(`No channel found matching "${query}"`);
          process.exit(1);
        } else if (matches.length > 1) {
          console.log(`Multiple channels match "${query}":`);
          for (const [i, m] of matches.entries()) {
            console.log(`  ${i + 1}. ${m.name}`);
          }
          console.log('\nBe more specific or use the index number.');
          process.exit(1);
        }
        channelsToPrime = matches;
      }
    }

    console.log(`Priming ${channelsToPrime.length} channel(s) with full history...`);
    console.log('This may take a while.\n');

    for (const channel of channelsToPrime) {
      process.stdout.write(`${channel.name}: fetching...`);
      try {
        const result = await primeChannel(channel, (done, total) => {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(`${channel.name}: ${done}/${total} videos`);
        });
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        if (result.partial) {
          console.log(`${channel.name}: added ${result.added} videos (partial - some timed out)`);
        } else {
          console.log(`${channel.name}: added ${result.added} videos`);
        }
      } catch (err) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        console.log(`${channel.name}: failed - ${err.message}`);
      }
    }
    console.log('\nDone!');
    return;
  }

  // Handle --channel flag
  let initialChannel = null;
  if (cli.flags.channel) {
    const subs = getSubscriptions();
    const index = cli.flags.channel - 1;
    if (index >= 0 && index < subs.length) {
      initialChannel = subs[index];
    } else {
      console.error(`Invalid channel index. You have ${subs.length} subscription(s).`);
      process.exit(1);
    }
  }

  // Launch the TUI with mouse support
  // Use alternate screen buffer for accurate mouse positioning
  // (mouse coords are viewport-relative, so we need a clean slate)
  process.stdout.write('\x1B[?1049h'); // Switch to alternate screen buffer
  process.stdout.write('\x1B[H');      // Move cursor to top-left

  // Ensure we restore the screen buffer on exit
  const restoreScreen = () => {
    process.stdout.write('\x1B[?1049l');
  };
  process.on('exit', restoreScreen);
  process.on('SIGINT', () => {
    restoreScreen();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    restoreScreen();
    process.exit(0);
  });

  // cacheInvalidationMs=0 ensures accurate hit detection with dynamic content
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
