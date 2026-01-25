import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import { getSubscriptions, addSubscription, removeSubscription, getNewVideoCounts, updateChannelLastViewed } from '../lib/config.js';
import { getChannelInfo, primeChannel, refreshAllVideos } from '../lib/ytdlp.js';

export default function ChannelList({ onSelectChannel, onBrowseAll, onQuit, skipRefresh, onRefreshDone }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'confirm-delete' | 'confirm-prime'
  const [addUrl, setAddUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [pendingChannel, setPendingChannel] = useState(null);
  const [newCounts, setNewCounts] = useState(new Map());

  // Load subscriptions, prefetch RSS (only once per session), and check for new videos
  useEffect(() => {
    const init = async () => {
      const subs = getSubscriptions();
      setSubscriptions(subs);
      
      // Prefetch RSS to detect new videos (only on first mount)
      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage('Checking for new videos...');
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage('');
        onRefreshDone?.();
      }
      
      // Now counts will include newly fetched videos
      setNewCounts(getNewVideoCounts());
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
    if (loading) return;

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

    // List mode
    if (input === 'q') {
      onQuit();
    } else if (input === 'a') {
      setMode('add');
      setAddUrl('');
    } else if (input === 'd' && subscriptions.length > 0) {
      setMode('confirm-delete');
    } else if (input === 'v') {
      onBrowseAll();
    } else if (input === 'r' && subscriptions.length > 0) {
      // Manual refresh
      const refresh = async () => {
        setLoading(true);
        setLoadingMessage('Checking for new videos...');
        await refreshAllVideos(subscriptions);
        setNewCounts(getNewVideoCounts());
        setLoading(false);
        setLoadingMessage('');
        setMessage('Refreshed');
      };
      refresh();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(subscriptions.length - 1, i + 1));
    } else if (key.return) {
      if (subscriptions.length > 0) {
        const channel = subscriptions[selectedIndex];
        // Mark channel as viewed (clears "new" indicator)
        updateChannelLastViewed(channel.id);
        setNewCounts((prev) => {
          const next = new Map(prev);
          next.delete(channel.id);
          return next;
        });
        onSelectChannel(channel);
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
      setMessage(`Primed ${pendingChannel.name}: ${result.added} videos added`);
    } catch (err) {
      setError(`Prime failed: ${err.message}`);
    } finally {
      setLoading(false);
      setPendingChannel(null);
      setMode('list');
    }
  };

  const handleDelete = () => {
    if (subscriptions.length === 0) return;

    const channel = subscriptions[selectedIndex];
    const result = removeSubscription(selectedIndex);

    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode('list');
  };

  return (
    <Box flexDirection="column">
      <Header
        title="Channels"
        subtitle={`${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`}
      />

      {loading && <Loading message={loadingMessage} />}

      {!loading && mode === 'add' && (
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

      {!loading && mode === 'confirm-delete' && subscriptions.length > 0 && (
        <Box flexDirection="column">
          <Text color="red">
            Delete "{subscriptions[selectedIndex].name}"? (y/N)
          </Text>
        </Box>
      )}

      {!loading && mode === 'confirm-prime' && pendingChannel && (
        <Box flexDirection="column">
          <Text color="cyan">
            Prime historical videos for "{pendingChannel.name}"? (Y/n)
          </Text>
          <Text color="gray">This fetches all videos from the channel (may take a while)</Text>
        </Box>
      )}

      {!loading && mode === 'list' && (
        <Box flexDirection="column">
          {subscriptions.length === 0 ? (
            <Box flexDirection="column">
              <Text color="gray">No subscriptions yet.</Text>
              <Text color="gray">Press (a) to add a channel.</Text>
            </Box>
          ) : (
            subscriptions.map((sub, index) => {
              const hasNew = newCounts.get(sub.id) > 0;
              return (
                <Box key={sub.id || index}>
                  <Text color={index === selectedIndex ? 'cyan' : undefined}>
                    {index === selectedIndex ? '>' : ' '} {sub.name}
                  </Text>
                  {hasNew && <Text color="green"> ●</Text>}
                </Box>
              );
            })
          )}
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
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
            <KeyHint keyName="Enter" description=" browse" />
            <KeyHint keyName="q" description="uit" />
          </>
        )}
      </StatusBar>
    </Box>
  );
}
