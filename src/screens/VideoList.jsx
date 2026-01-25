import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import { getChannelVideos, refreshAllVideos, getVideoPage } from '../lib/ytdlp.js';
import { getSubscriptions, getSettings, getWatchedIds, updateSettings } from '../lib/config.js';
import { playVideo } from '../lib/player.js';

export default function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState([]);
  const [watchedIds, setWatchedIds] = useState(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [hideShorts, setHideShorts] = useState(() => getSettings().hideShorts ?? false);
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  
  // Cache channel IDs to avoid re-computing
  const channelIdsRef = useRef(null);
  
  // Filter videos based on hideShorts and search text
  const videos = allVideos.filter((v) => {
    if (hideShorts && v.isShort) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return v.title?.toLowerCase().includes(search) || 
             v.channelName?.toLowerCase().includes(search);
    }
    return true;
  });
  
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;
  // Cap at 50 or terminal height, whichever is smaller
  const maxVisibleVideos = Math.min(50, Math.max(5, terminalHeight - 10));
  
  // Calculate scroll offset to keep selection visible
  const scrollOffset = Math.max(0, selectedIndex - maxVisibleVideos + 3);
  const visibleVideos = videos.slice(scrollOffset, scrollOffset + maxVisibleVideos);
  
  const totalPages = Math.ceil(totalVideos / pageSize);

  // Initial load: fetch RSS + first page
  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWatchedIds(getWatchedIds());

    try {
      const settings = getSettings();
      const limit = settings.videosPerChannel || 15;

      if (channel) {
        // Single channel view - use existing flow
        const channelVideos = await getChannelVideos(channel, limit);
        setAllVideos(channelVideos);
        setTotalVideos(channelVideos.length);
        setCurrentPage(0);
      } else {
        // All videos view - fetch RSS once, then paginate from store
        const subscriptions = getSubscriptions();
        if (subscriptions.length === 0) {
          setAllVideos([]);
          setTotalVideos(0);
          setError('No subscriptions. Go back and add some channels first.');
        } else {
          channelIdsRef.current = subscriptions.map((s) => s.id);
          await refreshAllVideos(subscriptions);
          const result = getVideoPage(channelIdsRef.current, 0, 100);
          setAllVideos(result.videos);
          setTotalVideos(result.total);
          setPageSize(result.pageSize);
          setCurrentPage(0);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  // Page change: just read from store (fast, no network)
  const loadPage = useCallback((page) => {
    if (!channelIdsRef.current || channel) return;
    
    const result = getVideoPage(channelIdsRef.current, page, 100);
    setAllVideos(result.videos);
    setTotalVideos(result.total);
    setSelectedIndex(0);
  }, [channel]);

  // Initial load on mount
  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  // Handle page changes (fast)
  useEffect(() => {
    if (!loading && !channel && channelIdsRef.current && currentPage > 0) {
      loadPage(currentPage);
    }
  }, [currentPage, loading, channel, loadPage]);

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
    if (loading || playing) return;

    // Filter mode input handling
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText('');
        setSelectedIndex(0);
      } else if (key.return) {
        setIsFiltering(false);
      } else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        setSelectedIndex(0);
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        setSelectedIndex(0);
      }
      return;
    }

    if (key.escape || input === 'b') {
      if (filterText) {
        setFilterText('');
        setSelectedIndex(0);
      } else {
        onBack();
      }
    } else if (input === 'q') {
      process.exit(0);
    } else if (input === 'r') {
      initialLoad();
    } else if (input === 's') {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setSelectedIndex(0);
      setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
    } else if (input === '/') {
      setIsFiltering(true);
    } else if (input === 'n' && !channel && currentPage < totalPages - 1) {
      // Next page (only in "all videos" view)
      setCurrentPage((p) => p + 1);
    } else if (input === 'p' && !channel && currentPage > 0) {
      // Previous page (only in "all videos" view)
      setCurrentPage((p) => p - 1);
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(videos.length - 1, i + 1));
    } else if (key.return) {
      handlePlay();
    }
  });

  const handlePlay = async () => {
    if (videos.length === 0) return;

    const video = videos[selectedIndex];
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);

    const result = await playVideo(video.url, video.id);
    
    // Update watched state immediately after playing
    setWatchedIds(getWatchedIds());

    if (result.success) {
      setMessage(`Playing in ${result.player}`);
    } else {
      setError(`Failed to play: ${result.error}`);
    }

    setPlaying(false);
  };

  // Truncate or pad text to exact width
  const truncate = (text, maxLen) => {
    if (!text) return '';
    return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
  };
  
  const pad = (text, width) => {
    if (!text) return ' '.repeat(width);
    if (text.length >= width) return text.slice(0, width);
    return text + ' '.repeat(width - text.length);
  };

  // Fixed column widths for table layout
  const showChannel = !channel;
  const channelColWidth = showChannel ? 32 : 0;
  const dateColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  // Layout: pointer(2) + channel + title + date
  const titleColWidth = availableWidth - 2 - channelColWidth - dateColWidth - 2;

  const title = channel ? channel.name : 'All Videos';
  const filterInfo = filterText ? ` (filter: "${filterText}")` : '';
  const pageInfo = !channel && totalVideos > 0 ? ` [${currentPage + 1}/${totalPages}]` : '';
  const subtitle = loading ? 'loading...' : `${videos.length} video${videos.length !== 1 ? 's' : ''}${filterInfo}${pageInfo}`;

  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} />

      {loading && <Loading message={channel ? `Fetching videos from ${channel.name}...` : 'Fetching videos from all channels...'} />}

      {!loading && error && !videos.length && (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && videos.length === 0 && !error && (
        <Text color="gray">No videos found.</Text>
      )}

      {!loading && videos.length > 0 && (
        <Box flexDirection="column">
          {visibleVideos.map((video, displayIndex) => {
            const actualIndex = displayIndex + scrollOffset;
            const isSelected = actualIndex === selectedIndex;
            const isWatched = watchedIds.has(video.id);
            
            // Color logic: selected = cyan, watched = dimmed, unwatched = normal
            const getColor = (defaultColor) => {
              if (isSelected) return 'cyan';
              if (isWatched) return defaultColor; // keep original color, just dim it
              return defaultColor;
            };
            
            // Format columns with fixed widths
            const pointer = isSelected ? '>' : ' ';
            const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : '';
            const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
            const dateText = (isWatched && !isSelected ? '* ' : '  ') + pad(video.relativeDate || '', dateColWidth - 2);

            return (
              <Box key={video.id || actualIndex}>
                <Text color={getColor(undefined)} dimColor={isWatched && !isSelected}>
                  {pointer} 
                </Text>
                {showChannel && (
                  <Text color={getColor('yellow')} dimColor={isWatched && !isSelected}>{channelText}</Text>
                )}
                <Text color={getColor(undefined)} dimColor={isWatched && !isSelected}>
                  {titleText}
                </Text>
                <Text color={getColor('gray')}>
                  {dateText}
                </Text>
              </Box>
            );
          })}
          
          {videos.length > maxVisibleVideos && (
            <Box marginTop={1}>
              <Text color="gray">
                Showing {scrollOffset + 1}-{Math.min(scrollOffset + maxVisibleVideos, videos.length)} of {videos.length}
              </Text>
            </Box>
          )}
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      )}

      {error && videos.length > 0 && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
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
        ) : (
          <>
            <KeyHint keyName="Enter" description=" play" />
            <KeyHint keyName="/" description=" filter" />
            <KeyHint keyName="s" description={hideShorts ? " +shorts" : " -shorts"} />
            {!channel && totalPages > 1 && (
              <>
                <KeyHint keyName="n" description="ext" />
                <KeyHint keyName="p" description="rev" />
              </>
            )}
            <KeyHint keyName="r" description="efresh" />
            <KeyHint keyName="b" description="ack" />
            <KeyHint keyName="q" description="uit" />
          </>
        )}
      </StatusBar>
    </Box>
  );
}
