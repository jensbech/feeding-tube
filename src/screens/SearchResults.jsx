import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import DescriptionPanel from '../components/DescriptionPanel.jsx';
import VideoRow from '../components/VideoRow.jsx';
import { searchYouTube, getVideoDescription } from '../lib/ytdlp.js';
import { playVideo } from '../lib/player.js';
import { getWatchedIds, addSubscription, getSubscriptions } from '../lib/config.js';
import { useAutoHideMessage, calculateVisibleRows, truncate, pad, formatViews } from '../lib/ui.js';

export default function SearchResults({ query, onBack }) {
  const [currentQuery, setCurrentQuery] = useState(query);
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [watchedIds, setWatchedIds] = useState(() => getWatchedIds());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('list');
  const [showDescription, setShowDescription] = useState(false);
  const [description, setDescription] = useState(null);
  const [loadingDescription, setLoadingDescription] = useState(false);

  const { message, setMessage, error, setError } = useAutoHideMessage();
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);

  const visibleVideos = results.slice(scrollOffset, scrollOffset + visibleCount);

  const resetScroll = () => { setSelectedIndex(0); setScrollOffset(0); };

  useEffect(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      resetScroll();

      try {
        setResults(await searchYouTube(currentQuery, 50));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    search();
  }, [currentQuery, setError]);

  const handlePlay = async () => {
    if (results.length === 0) return;
    const video = results[selectedIndex];
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  };

  const handleAddChannel = async () => {
    const video = results[selectedIndex];
    const subs = getSubscriptions();
    if (subs.some(s => s.id === video.channelId)) {
      setMessage(`Already subscribed to ${video.channelName}`);
      setMode('list');
      return;
    }

    const result = addSubscription({
      id: video.channelId,
      name: video.channelName,
      url: `https://www.youtube.com/channel/${video.channelId}`,
    });

    setMessage(result.success ? `Added: ${video.channelName}` : null);
    if (!result.success) setError(result.error);
    setMode('list');
  };

  const fetchDescription = async () => {
    if (results.length === 0) return;
    const video = results[selectedIndex];
    setLoadingDescription(true);
    setShowDescription(true);
    setDescription(null);

    try {
      setDescription(await getVideoDescription(video.id));
    } catch (err) {
      setDescription({ title: video.title, description: `Error: ${err.message}`, channelName: video.channelName });
    } finally {
      setLoadingDescription(false);
    }
  };

  const handleNewSearch = (newQuery) => {
    if (!newQuery.trim()) { setMode('list'); return; }
    setCurrentQuery(newQuery.trim());
    setSearchInput('');
    setMode('list');
  };

  useInput((input, key) => {
    if (playing) return;

    if (mode === 'new-search') {
      if (key.escape) { setMode('list'); setSearchInput(''); }
      return;
    }

    if (loading) return;

    if (mode === 'confirm-add') {
      if (input === 'n' || input === 'N' || key.escape) setMode('list');
      else if (input === 'y' || input === 'Y' || key.return) handleAddChannel();
      return;
    }

    if (key.escape || input === 'b') onBack();
    else if (input === 'q') process.exit(0);
    else if (input === 'g') { setMode('new-search'); setSearchInput(''); }
    else if (input === 'a' && results.length > 0) {
      const video = results[selectedIndex];
      if (video.channelId) setMode('confirm-add');
      else setError('Cannot add channel - no channel ID available');
    } else if (input === 'i' && results.length > 0) {
      if (showDescription) { setShowDescription(false); setDescription(null); }
      else fetchDescription();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => {
        const newIndex = Math.max(0, i - 1);
        if (newIndex < scrollOffset) setScrollOffset(newIndex);
        return newIndex;
      });
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => {
        const newIndex = Math.min(results.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return) handlePlay();
  });

  const handleRowSelect = useCallback((vi) => setSelectedIndex(scrollOffset + vi), [scrollOffset]);

  const handleRowActivate = useCallback(async (vi) => {
    if (results.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + vi;
    const video = results[actualIndex];
    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  }, [results, scrollOffset, playing, loading, setMessage, setError]);

  const channelColWidth = 22;
  const durationColWidth = 8;
  const viewsColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - durationColWidth - viewsColWidth - 2;

  const subtitle = loading ? '' : `${results.length} result${results.length !== 1 ? 's' : ''} for "${currentQuery}"`;

  return (
    <Box flexDirection="column">
      <Header title="Search YouTube" subtitle={subtitle} loading={loading} loadingMessage={loading ? 'Searching...' : ''} />

      {mode === 'new-search' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">New search: </Text>
            <TextInput value={searchInput} onChange={setSearchInput} onSubmit={handleNewSearch} placeholder="enter search query" />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'confirm-add' && results.length > 0 && (
        <Text color="cyan">Subscribe to "{results[selectedIndex]?.channelName}"? (Y/n)</Text>
      )}

      {showDescription && <DescriptionPanel loading={loadingDescription} description={description} />}

      {error && !results.length && <Text color="red">{error}</Text>}
      {!loading && results.length === 0 && !error && <Text color="gray">No results found.</Text>}

      {results.length > 0 && mode === 'list' && !showDescription && (
        <Box flexDirection="column">
          {visibleVideos.map((video, index) => {
            const actualIndex = scrollOffset + index;
            const isSelected = actualIndex === selectedIndex;
            const isWatched = watchedIds.has(video.id);
            const pointer = isSelected ? '>' : ' ';
            const channelText = pad(truncate(video.channelName, channelColWidth - 1), channelColWidth);
            const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
            const durationText = pad(video.durationString || '--:--', durationColWidth);
            const viewsText = pad(formatViews(video.viewCount), viewsColWidth);

            return (
              <ClickableRow key={video.id} index={index} onSelect={handleRowSelect} onActivate={handleRowActivate}>
                <VideoRow pointer={pointer} channelText={channelText} titleText={titleText} metaText={durationText} extraText={viewsText} isSelected={isSelected} isWatched={isWatched} />
              </ClickableRow>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column">
        {message && <Text color="green">{message}</Text>}
        {error && results.length > 0 && <Text color="red">{error}</Text>}
        <StatusBar>
          {mode === 'list' && !showDescription && (
            <>
              <KeyHint keyName="Enter" description=" play" onClick={handlePlay} />
              <KeyHint keyName="i" description="nfo" onClick={fetchDescription} />
              <KeyHint keyName="a" description="dd channel" onClick={() => {
                if (results.length > 0) {
                  const video = results[selectedIndex];
                  if (video.channelId) setMode('confirm-add');
                  else setError('Cannot add channel - no channel ID available');
                }
              }} />
              <KeyHint keyName="g" description=" new search" onClick={() => { setMode('new-search'); setSearchInput(''); }} />
              <KeyHint keyName="b" description="ack" onClick={onBack} />
              <KeyHint keyName="q" description="uit" onClick={() => process.exit(0)} />
            </>
          )}
          {showDescription && <KeyHint keyName="i" description=" close info" onClick={() => { setShowDescription(false); setDescription(null); }} />}
        </StatusBar>
      </Box>
    </Box>
  );
}
