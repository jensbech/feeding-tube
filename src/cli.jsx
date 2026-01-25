import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import App from './App.jsx';
import { addSubscription, getSubscriptions } from './lib/config.js';
import { getChannelInfo } from './lib/ytdlp.js';

const cli = meow(`
  Usage
    $ ytsub                    Launch the TUI
    $ ytsub --add <url>        Quick-add a channel
    $ ytsub --list             List subscriptions (non-interactive)
    $ ytsub --channel <index>  Start on a specific channel (by index)

  Options
    --add, -a       Add a channel URL directly
    --list, -l      List all subscriptions
    --channel, -c   Start viewing a specific channel (1-indexed)
    --help          Show this help message
    --version       Show version

  Examples
    $ ytsub
    $ ytsub --add https://youtube.com/@Fireship
    $ ytsub -c 1

  Navigation
    j/k or arrows   Move up/down
    Enter           Select / Play video
    a               Add subscription
    d               Delete subscription
    v               View all videos
    b / Escape      Go back
    r               Refresh videos
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

  // Launch the TUI
  render(React.createElement(App, { initialChannel }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
