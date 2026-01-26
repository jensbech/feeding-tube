import React, { useState, useEffect, memo } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import { getSubscriptions, addSubscription, removeSubscription, getNewVideoCounts, updateChannelLastViewed, markAllChannelsViewed, getFullyWatchedChannels } from '../lib/config.js';
import { getChannelInfo, primeChannel, refreshAllVideos } from '../lib/ytdlp.js';

// Memoized channel row to reduce re-renders
const ChannelRow = memo(function ChannelRow({ name, isSelected, hasNew, isFullyWatched }) {
  return (
    <Box>
      <Text 
        color={isSelected ? 'cyan' : undefined} 
        dimColor={isFullyWatched && !isSelected}
      >
        {isSelected ? '>' : ' '} {name}
      </Text>
      {hasNew && <Text color="green"> ●</Text>}
    </Box>
  );
});

export default function ChannelList({ onSelectChannel, onBrowseAll, onQuit, skipRefresh, onRefreshDone, savedIndex }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState('list');
  const [addUrl, setAddUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingChannel, setPendingChannel] = useState(null);
  const [newCounts, setNewCounts] = useState(new Map());
  const [fullyWatched, setFullyWatched] = useState(new Set());
  
  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(subscriptions.length / PAGE_SIZE);
  const startIdx = page * PAGE_SIZE;
  const visibleChannels = subscriptions.slice(startIdx, startIdx + PAGE_SIZE);
  
  // Restore saved position on mount
  useEffect(() => {
    if (savedIndex > 0 && subscriptions.length > 0) {
      const targetPage = Math.floor(savedIndex / PAGE_SIZE);
      setPage(targetPage);
      setSelectedIndex(savedIndex - targetPage * PAGE_SIZE);
    }
  }, [savedIndex, subscriptions.length]);

  // Load subscriptions, prefetch RSS (only once per session), and check for new videos
  useEffect(() => {
    const init = async () => {
      const subs = getSubscriptions();
      setSubscriptions(subs);
      setNewCounts(getNewVideoCounts()); // Show existing counts immediately
      setFullyWatched(getFullyWatchedChannels());
      
      // Prefetch RSS to detect new videos (only on first mount) - background load
      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage('Refreshing...');
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage('');
        onRefreshDone?.();
        // Update counts after fetch
        setNewCounts(getNewVideoCounts());
        setFullyWatched(getFullyWatchedChannels());
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const blockingLoad = loading && (mode === 'add' || mode === 'confirm-prime');
    if (blockingLoad) return;

    if (mode === 'add') {
      if (key.escape) {
        setMode('list');
        setAddUrl('');
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
    } else if (input === 'a') {
      setMode('add');
      setAddUrl('');
    } else if (input === 'd' && visibleChannels.length > 0) {
      setMode('confirm-delete');
    } else if (input === 'v') {
      onBrowseAll();
    } else if (input === 'r' && subscriptions.length > 0 && !loading) {
      // Manual refresh (only if not already loading)
      const refresh = async () => {
        setLoading(true);
        setLoadingMessage('Refreshing...');
        await refreshAllVideos(subscriptions);
        setNewCounts(getNewVideoCounts());
        setFullyWatched(getFullyWatchedChannels());
        setLoading(false);
        setLoadingMessage('');
        setMessage('Refreshed');
      };
      refresh();
    } else if (input === 'm') {
      setMode('confirm-mark-all');
    } else if (input === 'n' && totalPages > 1 && page < totalPages - 1) {
      // Next page
      setPage((p) => p + 1);
      setSelectedIndex(0);
    } else if (input === 'p' && totalPages > 1 && page > 0) {
      // Previous page
      setPage((p) => p - 1);
      setSelectedIndex(0);
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(visibleChannels.length - 1, i + 1));
    } else if (key.return) {
      if (visibleChannels.length > 0) {
        const channel = visibleChannels[selectedIndex];
        const globalIndex = startIdx + selectedIndex;
        // Mark channel as viewed (clears "new" indicator)
        updateChannelLastViewed(channel.id);
        setNewCounts((prev) => {
          const next = new Map(prev);
          next.delete(channel.id);
          return next;
        });
        onSelectChannel(channel, globalIndex);
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
    if (visibleChannels.length === 0) return;

    const channel = visibleChannels[selectedIndex];
    const globalIndex = startIdx + selectedIndex;
    const result = removeSubscription(globalIndex);

    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode('list');
  };

  // Build subtitle with optional loading indicator and page info
  const countText = `${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`;
  const pageInfo = totalPages > 1 ? ` [${page + 1}/${totalPages}]` : '';
  const subtitle = loading ? `${countText}${pageInfo} - ${loadingMessage}` : `${countText}${pageInfo}`;

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

      {mode === 'confirm-delete' && visibleChannels.length > 0 && (
        <Box flexDirection="column">
          <Text color="red">
            Delete "{visibleChannels[selectedIndex].name}"? (y/N)
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
              return (
                <ChannelRow
                  key={sub.id}
                  name={sub.name}
                  isSelected={index === selectedIndex}
                  hasNew={hasNew}
                  isFullyWatched={isFullyWatched}
                />
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
          {mode === 'list' && (
            <>
              <KeyHint keyName="a" description="dd" />
              {subscriptions.length > 0 && <KeyHint keyName="d" description="elete" />}
              <KeyHint keyName="v" description="iew all" />
              <KeyHint keyName="r" description="efresh" />
              <KeyHint keyName="m" description="ark all read" />
              {totalPages > 1 && (
                <>
                  <KeyHint keyName="n" description="ext" />
                  <KeyHint keyName="p" description="rev" />
                </>
              )}
              <KeyHint keyName="Enter" description=" browse" />
              <KeyHint keyName="q" description="uit" />
            </>
          )}
        </StatusBar>
      </Box>
    </Box>
  );
}
