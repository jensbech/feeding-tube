import React, { useState, useEffect, memo, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import { searchYouTube } from '../lib/ytdlp.js';
import { playVideo } from '../lib/player.js';
import { getWatchedIds, addSubscription, getSubscriptions } from '../lib/config.js';

// Memoized video row
const VideoRow = memo(function VideoRow({ 
  pointer, channelText, titleText, durationText, isSelected, isWatched 
}) {
  return (
    <>
      <Text color={isSelected ? 'cyan' : undefined} dimColor={isWatched && !isSelected}>
        {pointer} 
      </Text>
      <Text color={isSelected ? 'cyan' : 'yellow'} dimColor={isWatched && !isSelected}>
        {channelText}
      </Text>
      <Text color={isSelected ? 'cyan' : undefined} dimColor={isWatched && !isSelected}>
        {titleText}
      </Text>
      <Text color={isSelected ? 'cyan' : 'gray'}>
        {durationText}
      </Text>
    </>
  );
});

export default function SearchResults({ query, onBack, onNewSearch }) {
  const [currentQuery, setCurrentQuery] = useState(query);
  const [searchInput, setSearchInput] = useState('');
  const [results, setResults] = useState([]);
  const [watchedIds, setWatchedIds] = useState(() => getWatchedIds());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [displayPage, setDisplayPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState('list');
  
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  
  // Display pagination
  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(results.length / PAGE_SIZE);
  const startIdx = displayPage * PAGE_SIZE;
  const visibleVideos = results.slice(startIdx, startIdx + PAGE_SIZE);

  // Search on mount or when query changes
  useEffect(() => {
    const search = async () => {
      setLoading(true);
      setError(null);
      setSelectedIndex(0);
      setDisplayPage(0);
      
      try {
        const searchResults = await searchYouTube(currentQuery, 50);
        setResults(searchResults);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    search();
  }, [currentQuery]);

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
    if (playing) return;
    
    // New search input mode
    if (mode === 'new-search') {
      if (key.escape) {
        setMode('list');
        setSearchInput('');
      }
      return;
    }
    
    // Block input during loading (except for new search mode)
    if (loading) return;
    
    // Confirm add channel mode
    if (mode === 'confirm-add') {
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
      } else if (input === 'y' || input === 'Y' || key.return) {
        handleAddChannel();
      }
      return;
    }

    if (key.escape || input === 'b') {
      onBack();
    } else if (input === 'q') {
      process.exit(0);
    } else if (input === 'g') {
      setMode('new-search');
      setSearchInput('');
    } else if (input === 'a' && visibleVideos.length > 0) {
      // Add channel to subscriptions
      const video = visibleVideos[selectedIndex];
      if (video.channelId) {
        setMode('confirm-add');
      } else {
        setError('Cannot add channel - no channel ID available');
      }
    } else if (input === 'n' && totalPages > 1 && displayPage < totalPages - 1) {
      setDisplayPage((p) => p + 1);
      setSelectedIndex(0);
    } else if (input === 'p' && totalPages > 1 && displayPage > 0) {
      setDisplayPage((p) => p - 1);
      setSelectedIndex(0);
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(visibleVideos.length - 1, i + 1));
    } else if (key.return) {
      handlePlay();
    }
  });

  const handlePlay = async () => {
    if (visibleVideos.length === 0) return;

    const video = visibleVideos[selectedIndex];
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);

    const result = await playVideo(video.url, video.id);
    
    setWatchedIds(getWatchedIds());

    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }

    setPlaying(false);
  };

  // Mouse handlers
  const handleRowSelect = useCallback((index) => {
    setSelectedIndex(index);
  }, []);

  const handleRowActivate = useCallback(async (index) => {
    if (visibleVideos.length === 0 || playing || loading) return;
    
    const video = visibleVideos[index];
    setSelectedIndex(index);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);

    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());

    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }

    setPlaying(false);
  }, [visibleVideos, playing, loading]);

  const handleAddChannel = async () => {
    const video = visibleVideos[selectedIndex];
    
    // Check if already subscribed
    const subs = getSubscriptions();
    if (subs.some(s => s.id === video.channelId)) {
      setMessage(`Already subscribed to ${video.channelName}`);
      setMode('list');
      return;
    }
    
    const channelInfo = {
      id: video.channelId,
      name: video.channelName,
      url: `https://www.youtube.com/channel/${video.channelId}`,
    };
    
    const result = addSubscription(channelInfo);
    
    if (result.success) {
      setMessage(`Added: ${video.channelName}`);
    } else {
      setError(result.error);
    }
    
    setMode('list');
  };

  const handleNewSearch = (newQuery) => {
    if (!newQuery.trim()) {
      setMode('list');
      return;
    }
    setCurrentQuery(newQuery.trim());
    setSearchInput('');
    setMode('list');
  };

  // Truncate or pad text
  const truncate = (text, maxLen) => {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '...' : text;
  };
  
  const pad = (text, width) => {
    if (!text) return ' '.repeat(width);
    if (text.length >= width) return text.slice(0, width);
    return text + ' '.repeat(width - text.length);
  };

  // Column layout
  const channelColWidth = 24;
  const durationColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - durationColWidth - 2;

  const pageInfo = totalPages > 1 ? ` [${displayPage + 1}/${totalPages}]` : '';
  const subtitle = loading 
    ? 'Searching...' 
    : `${results.length} result${results.length !== 1 ? 's' : ''} for "${currentQuery}"${pageInfo}`;

  return (
    <Box flexDirection="column">
      <Header title="Search YouTube" subtitle={subtitle} loading={loading} />

      {mode === 'new-search' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">New search: </Text>
            <TextInput
              value={searchInput}
              onChange={setSearchInput}
              onSubmit={handleNewSearch}
              placeholder="enter search query"
            />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {mode === 'confirm-add' && visibleVideos.length > 0 && (
        <Box>
          <Text color="cyan">
            Subscribe to "{visibleVideos[selectedIndex].channelName}"? (Y/n)
          </Text>
        </Box>
      )}

      {error && !results.length && (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && results.length === 0 && !error && (
        <Text color="gray">No results found.</Text>
      )}

      {results.length > 0 && mode === 'list' && (
        <Box flexDirection="column">
          {visibleVideos.map((video, index) => {
            const isSelected = index === selectedIndex;
            const isWatched = watchedIds.has(video.id);
            
            const pointer = isSelected ? '>' : ' ';
            const channelText = pad(truncate(video.channelName, channelColWidth - 1), channelColWidth);
            const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
            const durationText = pad(video.durationString || '--:--', durationColWidth);

            return (
              <ClickableRow
                key={video.id}
                index={index}
                onSelect={handleRowSelect}
                onActivate={handleRowActivate}
              >
                <VideoRow
                  pointer={pointer}
                  channelText={channelText}
                  titleText={titleText}
                  durationText={durationText}
                  isSelected={isSelected}
                  isWatched={isWatched}
                />
              </ClickableRow>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column">
        {message && (
          <Box>
            <Text color="green">{message}</Text>
          </Box>
        )}

        {error && results.length > 0 && (
          <Box>
            <Text color="red">{error}</Text>
          </Box>
        )}

        <StatusBar>
          {mode === 'list' && (
            <>
              <KeyHint keyName="Enter" description=" play" onClick={handlePlay} />
              <KeyHint keyName="a" description="dd channel" onClick={() => {
                if (visibleVideos.length > 0) {
                  const video = visibleVideos[selectedIndex];
                  if (video.channelId) {
                    setMode('confirm-add');
                  } else {
                    setError('Cannot add channel - no channel ID available');
                  }
                }
              }} />
              <KeyHint keyName="g" description=" new search" onClick={() => { setMode('new-search'); setSearchInput(''); }} />
              {totalPages > 1 && (
                <>
                  <KeyHint keyName="n" description="ext" onClick={() => { if (displayPage < totalPages - 1) { setDisplayPage((p) => p + 1); setSelectedIndex(0); } }} />
                  <KeyHint keyName="p" description="rev" onClick={() => { if (displayPage > 0) { setDisplayPage((p) => p - 1); setSelectedIndex(0); } }} />
                </>
              )}
              <KeyHint keyName="b" description="ack" onClick={onBack} />
              <KeyHint keyName="q" description="uit" onClick={() => process.exit(0)} />
            </>
          )}
        </StatusBar>
      </Box>
    </Box>
  );
}
