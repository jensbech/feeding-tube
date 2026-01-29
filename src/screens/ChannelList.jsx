import React, { useState, useEffect, memo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import { getSubscriptions, addSubscription, removeSubscription, getNewVideoCounts, updateChannelLastViewed, markAllChannelsViewed, getFullyWatchedChannels, getSettings, updateSettings } from '../lib/config.js';
import { getChannelInfo, primeChannel, refreshAllVideos } from '../lib/ytdlp.js';

// Memoized channel row to reduce re-renders
const ChannelRow = memo(function ChannelRow({ name, isSelected, hasNew, isFullyWatched }) {
  return (
    <>
      <Text
        color={isSelected ? 'cyan' : undefined}
        dimColor={isFullyWatched && !isSelected}
      >
        {isSelected ? '>' : ' '} {name}
      </Text>
      {hasNew && <Text color="green"> ●</Text>}
    </>
  );
});

export default function ChannelList({ onSelectChannel, onBrowseAll, onGlobalSearch, onQuit, skipRefresh, onRefreshDone, savedIndex }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState('list');
  const [addUrl, setAddUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingChannel, setPendingChannel] = useState(null);
  const [newCounts, setNewCounts] = useState(new Map());
  const [fullyWatched, setFullyWatched] = useState(new Set());
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [hideShorts, setHideShorts] = useState(() => getSettings().hideShorts ?? true);

  // Filter subscriptions by name
  const filteredSubs = filterText
    ? subscriptions.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()))
    : subscriptions;

  const VISIBLE_COUNT = 30;
  const visibleChannels = filteredSubs.slice(scrollOffset, scrollOffset + VISIBLE_COUNT);

  // Restore saved position on mount
  useEffect(() => {
    if (savedIndex > 0 && subscriptions.length > 0) {
      setSelectedIndex(savedIndex);
      // Ensure the saved index is visible
      if (savedIndex >= VISIBLE_COUNT) {
        setScrollOffset(savedIndex - Math.floor(VISIBLE_COUNT / 2));
      }
    }
  }, [savedIndex, subscriptions.length]);

  // Load subscriptions, prefetch RSS (only once per session), and check for new videos
  useEffect(() => {
    const init = async () => {
      const subs = getSubscriptions();
      setSubscriptions(subs);
      setNewCounts(getNewVideoCounts(hideShorts)); // Show existing counts immediately
      setFullyWatched(getFullyWatchedChannels(hideShorts));

      // Prefetch RSS to detect new videos (only on first mount) - background load
      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage('Checking for new videos...');
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage('');
        onRefreshDone?.();
        // Update counts after fetch
        setNewCounts(getNewVideoCounts(hideShorts));
        setFullyWatched(getFullyWatchedChannels(hideShorts));
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update counts when hideShorts changes
  useEffect(() => {
    setNewCounts(getNewVideoCounts(hideShorts));
    setFullyWatched(getFullyWatchedChannels(hideShorts));
  }, [hideShorts]);

  // Clear messages after 3 seconds
  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, error]);

  useInput((input, key) => {
    // Allow navigation even during background loading (but not during blocking operations)
    const blockingLoad = loading && (mode === 'add' || mode === 'confirm-prime' || mode === 'global-search');
    if (blockingLoad) return;

    // Filter mode input handling
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText('');
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (key.return) {
        setIsFiltering(false);
      } else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        setSelectedIndex(0);
        setScrollOffset(0);
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        setSelectedIndex(0);
        setScrollOffset(0);
      }
      return;
    }

    if (mode === 'add') {
      if (key.escape) {
        setMode('list');
        setAddUrl('');
      }
      return;
    }

    if (mode === 'global-search') {
      if (key.escape) {
        setMode('list');
        setSearchQuery('');
      }
      return;
    }

    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') {
        handleDelete();
      } else {
        setMode('list');
      }
      return;
    }

    if (mode === 'confirm-prime') {
      if (input === 'n' || input === 'N') {
        setPendingChannel(null);
        setMode('list');
      } else if (input === 'y' || input === 'Y' || key.return) {
        handlePrime();
      }
      return;
    }

    if (mode === 'confirm-mark-all') {
      if (input === 'n' || input === 'N') {
        setMode('list');
      } else if (input === 'y' || input === 'Y' || key.return) {
        // Mark all channels as viewed (clears dots)
        const channelIds = subscriptions.map((s) => s.id);
        markAllChannelsViewed(channelIds);
        setNewCounts(new Map());
        setMessage('Marked all channels as read');
        setMode('list');
      }
      return;
    }

    // List mode
    if (input === 'q') {
      onQuit();
    } else if (key.escape || input === 'b') {
      // Clear filter if active
      if (filterText) {
        setFilterText('');
        setSelectedIndex(0);
        setScrollOffset(0);
      }
    } else if (input === 'a') {
      setMode('add');
      setAddUrl('');
    } else if (input === 'g') {
      setMode('global-search');
      setSearchQuery('');
    } else if (input === '/') {
      setIsFiltering(true);
    } else if (input === 'd' && filteredSubs.length > 0) {
      setMode('confirm-delete');
    } else if (input === 'v') {
      onBrowseAll();
    } else if (input === 'r' && subscriptions.length > 0 && !loading) {
      // Manual refresh (only if not already loading)
      const refresh = async () => {
        setLoading(true);
        setLoadingMessage('Checking for new videos...');
        await refreshAllVideos(subscriptions);
        setNewCounts(getNewVideoCounts(hideShorts));
        setFullyWatched(getFullyWatchedChannels(hideShorts));
        setLoading(false);
        setLoadingMessage('');
        setMessage('Refreshed');
      };
      refresh();
    } else if (input === 's') {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
    } else if (input === 'm') {
      setMode('confirm-mark-all');
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        // Scroll up if needed
        if (newIndex < scrollOffset) {
          setScrollOffset(newIndex);
        }
        return newIndex;
      });
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredSubs.length - 1, i + 1);
        // Scroll down if needed
        if (newIndex >= scrollOffset + VISIBLE_COUNT) {
          setScrollOffset(newIndex - VISIBLE_COUNT + 1);
        }
        return newIndex;
      });
    } else if (key.return) {
      if (filteredSubs.length > 0) {
        const channel = filteredSubs[selectedIndex];
        // Mark channel as viewed (clears "new" indicator)
        updateChannelLastViewed(channel.id);
        setNewCounts((prev) => {
          const next = new Map(prev);
          next.delete(channel.id);
          return next;
        });
        onSelectChannel(channel, selectedIndex);
      }
    }
  });

  const handleAddSubmit = async (url) => {
    if (!url.trim()) {
      setMode('list');
      return;
    }

    setLoading(true);
    setLoadingMessage('Fetching channel info...');
    setError(null);

    try {
      const channelInfo = await getChannelInfo(url);
      const result = addSubscription(channelInfo);

      if (result.success) {
        setSubscriptions(getSubscriptions());
        setMessage(`Added: ${channelInfo.name}`);
        setPendingChannel(channelInfo);
        setMode('confirm-prime');
      } else {
        setError(result.error);
        setMode('list');
      }
    } catch (err) {
      setError(err.message);
      setMode('list');
    } finally {
      setLoading(false);
      setAddUrl('');
    }
  };

  const handlePrime = async () => {
    if (!pendingChannel) return;

    setLoading(true);
    setLoadingMessage(`Priming ${pendingChannel.name}: 0/?`);
    setError(null);

    try {
      const result = await primeChannel(pendingChannel, (done, total) => {
        setLoadingMessage(`Priming ${pendingChannel.name}: ${done}/${total}`);
      });
      if (result.partial) {
        setMessage(`Primed ${pendingChannel.name}: ${result.added} videos (partial - some timed out)`);
      } else {
        setMessage(`Primed ${pendingChannel.name}: ${result.added} videos added`);
      }
    } catch (err) {
      setError(`Prime failed: ${err.message}`);
    } finally {
      setLoading(false);
      setPendingChannel(null);
      setMode('list');
    }
  };

  const handleDelete = () => {
    if (filteredSubs.length === 0) return;

    const channel = filteredSubs[selectedIndex];
    // Pass channel ID to remove by ID (not index, since list is sorted differently)
    const result = removeSubscription(channel.id);

    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode('list');
  };

  const handleGlobalSearch = (query) => {
    if (!query.trim()) {
      setMode('list');
      return;
    }
    setMode('list');
    setSearchQuery('');
    onGlobalSearch(query.trim());
  };

  // Mouse handlers - convert visible index to actual index
  const handleRowSelect = useCallback((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);

  const handleRowActivate = useCallback((visibleIndex) => {
    if (filteredSubs.length === 0 || mode !== 'list') return;

    const actualIndex = scrollOffset + visibleIndex;
    const channel = filteredSubs[actualIndex];

    updateChannelLastViewed(channel.id);
    setNewCounts((prev) => {
      const next = new Map(prev);
      next.delete(channel.id);
      return next;
    });
    onSelectChannel(channel, actualIndex);
  }, [filteredSubs, scrollOffset, mode, onSelectChannel]);

  // Build subtitle with optional loading indicator
  const countText = `${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`;
  const filterInfo = filterText ? ` (filter: "${filterText}")` : '';
  const subtitle = loading ? `${countText}${filterInfo} - ${loadingMessage}` : `${countText}${filterInfo}`;

  return (
    <Box flexDirection="column">
      <Header
        title="Channels"
        subtitle={subtitle}
        loading={loading}
      />

      {mode === 'add' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">Enter channel URL: </Text>
            <TextInput
              value={addUrl}
              onChange={setAddUrl}
              onSubmit={handleAddSubmit}
              placeholder="https://youtube.com/@channel"
            />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'global-search' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">Search YouTube: </Text>
            <TextInput
              value={searchQuery}
              onChange={setSearchQuery}
              onSubmit={handleGlobalSearch}
              placeholder="enter search query"
            />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'confirm-delete' && filteredSubs.length > 0 && (
        <Box flexDirection="column">
          <Text color="red">
            Delete "{filteredSubs[selectedIndex]?.name}"? (y/N)
          </Text>
        </Box>
      )}

      {mode === 'confirm-prime' && pendingChannel && (
        <Box flexDirection="column">
          <Text color="cyan">
            Prime historical videos for "{pendingChannel.name}"? (Y/n)
          </Text>
          <Text color="gray">This fetches all videos from the channel (may take a while)</Text>
        </Box>
      )}

      {mode === 'list' && (
        <Box flexDirection="column">
          {subscriptions.length === 0 ? (
            <Box flexDirection="column">
              <Text color="gray">No subscriptions yet.</Text>
              <Text color="gray">Press (a) to add a channel.</Text>
            </Box>
          ) : (
            visibleChannels.map((sub, index) => {
              const hasNew = newCounts.get(sub.id) > 0;
              const isFullyWatched = fullyWatched.has(sub.id);
              const actualIndex = scrollOffset + index;
              return (
                <ClickableRow
                  key={sub.id}
                  index={index}
                  onSelect={handleRowSelect}
                  onActivate={handleRowActivate}
                >
                  <ChannelRow
                    name={sub.name}
                    isSelected={actualIndex === selectedIndex}
                    hasNew={hasNew}
                    isFullyWatched={isFullyWatched}
                  />
                </ClickableRow>
              );
            })
          )}
        </Box>
      )}

      {mode === 'confirm-mark-all' && (
        <Box flexDirection="column">
          <Text>Clear all new video indicators? (y/n)</Text>
        </Box>
      )}

      <Box flexDirection="column">
        {error && (
          <Box>
            <Text color="red">Error: {error}</Text>
          </Box>
        )}

        {message && (
          <Box>
            <Text color="green">{message}</Text>
          </Box>
        )}

        <StatusBar>
          {isFiltering ? (
            <Text>
              <Text color="yellow">Filter: </Text>
              <Text>{filterText}</Text>
              <Text color="gray">_</Text>
              <Text color="gray">  (Enter to confirm, Esc to cancel)</Text>
            </Text>
          ) : mode === 'list' && (
            <>
              <KeyHint keyName="a" description="dd" onClick={() => { setMode('add'); setAddUrl(''); }} />
              {subscriptions.length > 0 && <KeyHint keyName="d" description="elete" onClick={() => setMode('confirm-delete')} />}
              <KeyHint keyName="v" description="iew all" onClick={onBrowseAll} />
              <KeyHint keyName="g" description="lobal" onClick={() => { setMode('global-search'); setSearchQuery(''); }} />
              <KeyHint keyName="/" description=" filter" onClick={() => setIsFiltering(true)} />
              <KeyHint keyName="s" description={hideShorts ? ' +shorts' : ' -shorts'} onClick={() => {
                const newValue = !hideShorts;
                setHideShorts(newValue);
                updateSettings({ hideShorts: newValue });
                setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
              }} />
              <KeyHint keyName="r" description="efresh" onClick={() => {
                if (subscriptions.length > 0 && !loading) {
                  const refresh = async () => {
                    setLoading(true);
                    setLoadingMessage('Checking for new videos...');
                    await refreshAllVideos(subscriptions);
                    setNewCounts(getNewVideoCounts(hideShorts));
                    setFullyWatched(getFullyWatchedChannels(hideShorts));
                    setLoading(false);
                    setLoadingMessage('');
                    setMessage('Refreshed');
                  };
                  refresh();
                }
              }} />
              <KeyHint keyName="q" description="uit" onClick={onQuit} />
            </>
          )}
        </StatusBar>
      </Box>
    </Box>
  );
}
