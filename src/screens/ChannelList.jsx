import React, { useState, useEffect, memo, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import {
  getSubscriptions, addSubscription, removeSubscription, getNewVideoCounts,
  updateChannelLastViewed, markAllChannelsViewed, getFullyWatchedChannels,
  getSettings, updateSettings, getStoredVideos, markChannelAllWatched
} from '../lib/config.js';
import { getChannelInfo, primeChannel, refreshAllVideos } from '../lib/ytdlp.js';
import { useAutoHideMessage, calculateVisibleRows } from '../lib/ui.js';

const ChannelRow = memo(function ChannelRow({ pointer, name, hasNew, isFullyWatched, isSelected }) {
  return (
    <>
      <Text color={isSelected ? 'cyan' : undefined} dimColor={isFullyWatched && !isSelected}>
        {pointer} {name}
      </Text>
      {hasNew && <Text color="green"> ●</Text>}
    </>
  );
});

export default function ChannelList({
  onSelectChannel, onBrowseAll, onGlobalSearch, onQuit, skipRefresh, onRefreshDone, savedIndex
}) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [mode, setMode] = useState('list');
  const [addUrl, setAddUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [pendingChannel, setPendingChannel] = useState(null);
  const [newCounts, setNewCounts] = useState(new Map());
  const [fullyWatched, setFullyWatched] = useState(new Set());
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [hideShorts, setHideShorts] = useState(() => getSettings().hideShorts ?? true);

  const { message, setMessage, error, setError } = useAutoHideMessage();
  const { stdout } = useStdout();
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);

  const filteredSubs = filterText
    ? subscriptions.filter(s => s.name.toLowerCase().includes(filterText.toLowerCase()))
    : subscriptions;
  const visibleChannels = filteredSubs.slice(scrollOffset, scrollOffset + visibleCount);

  const resetScroll = () => { setSelectedIndex(0); setScrollOffset(0); };
  const refreshCounts = () => { setNewCounts(getNewVideoCounts(hideShorts)); setFullyWatched(getFullyWatchedChannels(hideShorts)); };

  useEffect(() => {
    if (savedIndex > 0 && subscriptions.length > 0) {
      setSelectedIndex(savedIndex);
      if (savedIndex >= visibleCount) {
        setScrollOffset(savedIndex - Math.floor(visibleCount / 2));
      }
    }
  }, [savedIndex, subscriptions.length, visibleCount]);

  useEffect(() => {
    const init = async () => {
      const subs = getSubscriptions();
      setSubscriptions(subs);
      refreshCounts();

      if (subs.length > 0 && !skipRefresh) {
        setLoading(true);
        setLoadingMessage('Checking for new videos...');
        await refreshAllVideos(subs);
        setLoading(false);
        setLoadingMessage('');
        onRefreshDone?.();
        refreshCounts();
      }
    };
    init();
  }, []);

  useEffect(() => { refreshCounts(); }, [hideShorts]);

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
      const skippedInfo = result.skipped ? ` (${result.skipped} already cached)` : '';
      setMessage(`Primed ${pendingChannel.name}: ${result.added} videos added${skippedInfo}`);
      refreshCounts();
    } catch (err) {
      setError(`Prime failed: ${err.message}`);
    } finally {
      setLoading(false);
      setPendingChannel(null);
      setMode('list');
    }
  };

  const handlePrimeAll = async () => {
    if (subscriptions.length === 0) return;
    setLoading(true);
    setMode('list');
    setError(null);

    let totalAdded = 0;
    let totalSkipped = 0;
    let failures = 0;

    for (let i = 0; i < subscriptions.length; i++) {
      const channel = subscriptions[i];
      setLoadingMessage(`Priming ${i + 1}/${subscriptions.length}: ${channel.name}`);
      try {
        const result = await primeChannel(channel, (done, total) => {
          setLoadingMessage(`Priming ${i + 1}/${subscriptions.length}: ${channel.name} (${done}/${total})`);
        });
        totalAdded += result.added;
        totalSkipped += result.skipped || 0;
      } catch {
        failures++;
      }
    }

    setLoading(false);
    setLoadingMessage('');
    refreshCounts();
    const failInfo = failures > 0 ? `, ${failures} failed` : '';
    setMessage(`Primed all: ${totalAdded} videos added (${totalSkipped} cached${failInfo})`);
  };

  const handleDelete = () => {
    if (filteredSubs.length === 0) return;
    const channel = filteredSubs[selectedIndex];
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

  const handleMarkChannelWatched = () => {
    if (filteredSubs.length === 0) return;
    const channel = filteredSubs[selectedIndex];
    const videos = getStoredVideos(channel.id);
    const filteredVideos = hideShorts ? videos.filter((v) => !v.isShort) : videos;
    const count = markChannelAllWatched(filteredVideos.map((v) => v.id));
    refreshCounts();
    setMessage(`Marked ${count} videos as watched in ${channel.name}`);
  };

  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings({ hideShorts: newValue });
    setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
  };

  const handleRefresh = async () => {
    if (subscriptions.length === 0 || loading) return;
    setLoading(true);
    setLoadingMessage('Checking for new videos...');
    await refreshAllVideos(subscriptions);
    refreshCounts();
    setLoading(false);
    setLoadingMessage('');
    setMessage('Refreshed');
  };

  useInput((input, key) => {
    const blockingLoad = loading && ['add', 'confirm-prime', 'confirm-prime-all', 'global-search'].includes(mode);
    if (blockingLoad) return;

    if (isFiltering) {
      if (key.escape) { setIsFiltering(false); setFilterText(''); resetScroll(); }
      else if (key.return) setIsFiltering(false);
      else if (key.backspace || key.delete) { setFilterText((t) => t.slice(0, -1)); resetScroll(); }
      else if (input && !key.ctrl && !key.meta) { setFilterText((t) => t + input); resetScroll(); }
      return;
    }

    if (mode === 'add') {
      if (key.escape) { setMode('list'); setAddUrl(''); }
      return;
    }
    if (mode === 'global-search') {
      if (key.escape) { setMode('list'); setSearchQuery(''); }
      return;
    }

    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') handleDelete();
      else setMode('list');
      return;
    }

    if (mode === 'confirm-prime') {
      if (input === 'n' || input === 'N') { setPendingChannel(null); setMode('list'); }
      else if (input === 'y' || input === 'Y' || key.return) handlePrime();
      return;
    }

    if (mode === 'confirm-prime-all') {
      if (input === 'n' || input === 'N' || key.escape) setMode('list');
      else if (input === 'y' || input === 'Y' || key.return) handlePrimeAll();
      return;
    }

    if (mode === 'confirm-mark-all') {
      if (input === 'n' || input === 'N') setMode('list');
      else if (input === 'y' || input === 'Y' || key.return) {
        markAllChannelsViewed(subscriptions.map((s) => s.id));
        setNewCounts(new Map());
        setMessage('Marked all channels as read');
        setMode('list');
      }
      return;
    }

    if (input === 'q') onQuit();
    else if ((key.escape || input === 'b') && filterText) { setFilterText(''); resetScroll(); }
    else if (input === 'a') { setMode('add'); setAddUrl(''); }
    else if (input === 'g') { setMode('global-search'); setSearchQuery(''); }
    else if (input === '/') setIsFiltering(true);
    else if (input === 'd' && filteredSubs.length > 0) setMode('confirm-delete');
    else if (input === 'v') onBrowseAll();
    else if (input === 'r' && subscriptions.length > 0 && !loading) handleRefresh();
    else if (input === 's') handleToggleShorts();
    else if (input === 'w' && filteredSubs.length > 0) handleMarkChannelWatched();
    else if (input === 'p' && subscriptions.length > 0) setMode('confirm-prime-all');
    else if (input === 'm') setMode('confirm-mark-all');
    else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) setScrollOffset(newIndex);
        return newIndex;
      });
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => {
        const newIndex = Math.min(filteredSubs.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return && filteredSubs.length > 0) {
      const channel = filteredSubs[selectedIndex];
      updateChannelLastViewed(channel.id);
      setNewCounts((prev) => { const next = new Map(prev); next.delete(channel.id); return next; });
      onSelectChannel(channel, selectedIndex);
    }
  });

  const handleRowSelect = useCallback((visibleIndex) => {
    setSelectedIndex(scrollOffset + visibleIndex);
  }, [scrollOffset]);

  const handleRowActivate = useCallback((visibleIndex) => {
    if (filteredSubs.length === 0 || mode !== 'list') return;
    const actualIndex = scrollOffset + visibleIndex;
    const channel = filteredSubs[actualIndex];
    updateChannelLastViewed(channel.id);
    setNewCounts((prev) => { const next = new Map(prev); next.delete(channel.id); return next; });
    onSelectChannel(channel, actualIndex);
  }, [filteredSubs, scrollOffset, mode, onSelectChannel]);

  const countText = `${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`;
  const filterInfo = filterText ? ` (filter: "${filterText}")` : '';
  const subtitle = `${countText}${filterInfo}`;

  return (
    <Box flexDirection="column">
      <Header
        title="Channels"
        subtitle={subtitle}
        loading={loading}
        loadingMessage={loadingMessage}
        hideShorts={hideShorts}
        onToggleShorts={handleToggleShorts}
      />

      {mode === 'add' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">Enter channel URL: </Text>
            <TextInput value={addUrl} onChange={setAddUrl} onSubmit={handleAddSubmit} placeholder="https://youtube.com/@channel" />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'global-search' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">Search YouTube: </Text>
            <TextInput value={searchQuery} onChange={setSearchQuery} onSubmit={(q) => { if (q.trim()) { setMode('list'); setSearchQuery(''); onGlobalSearch(q.trim()); } else setMode('list'); }} placeholder="enter search query" />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'confirm-delete' && filteredSubs.length > 0 && (
        <Text color="red">Delete "{filteredSubs[selectedIndex]?.name}"? (y/N)</Text>
      )}

      {mode === 'confirm-prime' && pendingChannel && (
        <Box flexDirection="column">
          <Text color="cyan">Prime historical videos for "{pendingChannel.name}"? (Y/n)</Text>
          <Text color="gray">This fetches all videos from the channel (may take a while)</Text>
        </Box>
      )}

      {mode === 'confirm-prime-all' && (
        <Box flexDirection="column">
          <Text color="cyan">Prime historical videos for all {subscriptions.length} channels? (Y/n)</Text>
          <Text color="gray">This fetches all videos from every channel (may take a long time)</Text>
        </Box>
      )}

      {mode === 'confirm-mark-all' && <Text>Clear all new video indicators? (y/n)</Text>}

      {mode === 'list' && (
        <Box flexDirection="column">
          {subscriptions.length === 0 ? (
            <Box flexDirection="column">
              <Text color="gray">No subscriptions yet.</Text>
              <Text color="gray">Press (a) to add a channel.</Text>
            </Box>
          ) : (
            visibleChannels.map((sub, index) => {
              const isSelected = scrollOffset + index === selectedIndex;
              return (
                <ClickableRow key={sub.id} index={index} onSelect={handleRowSelect} onActivate={handleRowActivate}>
                  <ChannelRow
                    pointer={isSelected ? '>' : ' '}
                    name={sub.name}
                    isSelected={isSelected}
                    hasNew={newCounts.get(sub.id) > 0}
                    isFullyWatched={fullyWatched.has(sub.id)}
                  />
                </ClickableRow>
              );
            })
          )}
        </Box>
      )}

      <Box flexDirection="column">
        {error && <Text color="red">Error: {error}</Text>}
        {message && <Text color="green">{message}</Text>}
        <StatusBar>
          {isFiltering ? (
            <Text><Text color="yellow">Filter: </Text><Text>{filterText}</Text><Text color="gray">_  (Enter to confirm, Esc to cancel)</Text></Text>
          ) : mode === 'list' && (
            <>
              <KeyHint keyName="a" description="dd" onClick={() => { setMode('add'); setAddUrl(''); }} />
              {subscriptions.length > 0 && <KeyHint keyName="d" description="elete" onClick={() => setMode('confirm-delete')} />}
              {subscriptions.length > 0 && <KeyHint keyName="w" description="atched" onClick={handleMarkChannelWatched} />}
              {subscriptions.length > 0 && <KeyHint keyName="p" description="rime all" onClick={() => setMode('confirm-prime-all')} />}
              <KeyHint keyName="v" description="iew all" onClick={onBrowseAll} />
              <KeyHint keyName="g" description="lobal" onClick={() => { setMode('global-search'); setSearchQuery(''); }} />
              <KeyHint keyName="/" description=" filter" onClick={() => setIsFiltering(true)} />
              <KeyHint keyName="s" description={hideShorts ? ' +shorts' : ' -shorts'} onClick={handleToggleShorts} />
              <KeyHint keyName="r" description="efresh" onClick={handleRefresh} />
              <KeyHint keyName="q" description="uit" onClick={onQuit} />
            </>
          )}
        </StatusBar>
      </Box>
    </Box>
  );
}
