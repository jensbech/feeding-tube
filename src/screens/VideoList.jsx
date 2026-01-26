import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import { getChannelVideos, refreshAllVideos, getVideoPage } from '../lib/ytdlp.js';
import { getSubscriptions, getSettings, getWatchedIds, updateSettings, toggleWatched, markChannelAllWatched } from '../lib/config.js';
import { playVideo } from '../lib/player.js';

// Memoized video row to reduce re-renders
const VideoRow = memo(function VideoRow({ 
  pointer, channelText, titleText, dateText, isSelected, isWatched, showChannel 
}) {
  const getColor = (defaultColor) => {
    if (isSelected) return 'cyan';
    return defaultColor;
  };
  
  return (
    <>
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
    </>
  );
});

export default function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState([]);
  const [watchedIds, setWatchedIds] = useState(() => getWatchedIds());
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
  const [mode, setMode] = useState('list');
  const [displayPage, setDisplayPage] = useState(0);
  
  // Cache channel IDs to avoid re-computing
  const channelIdsRef = useRef(null);
  
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  
  // Filter videos based on hideShorts and search text
  const filteredVideos = allVideos.filter((v) => {
    if (hideShorts && v.isShort) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return v.title?.toLowerCase().includes(search) || 
             v.channelName?.toLowerCase().includes(search);
    }
    return true;
  });
  
  // Display pagination (30 items per page to prevent flickering)
  const DISPLAY_PAGE_SIZE = 30;
  const displayTotalPages = Math.ceil(filteredVideos.length / DISPLAY_PAGE_SIZE);
  const displayStartIdx = displayPage * DISPLAY_PAGE_SIZE;
  const visibleVideos = filteredVideos.slice(displayStartIdx, displayStartIdx + DISPLAY_PAGE_SIZE);
  
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
    if (playing) return;
    
    // Allow navigation during background loading
    const blockingLoad = loading && mode !== 'list';
    if (blockingLoad) return;

    // Filter mode input handling
    if (isFiltering) {
      if (key.escape) {
        setIsFiltering(false);
        setFilterText('');
        setSelectedIndex(0);
        setDisplayPage(0);
      } else if (key.return) {
        setIsFiltering(false);
      } else if (key.backspace || key.delete) {
        setFilterText((t) => t.slice(0, -1));
        setSelectedIndex(0);
        setDisplayPage(0);
      } else if (input && !key.ctrl && !key.meta) {
        setFilterText((t) => t + input);
        setSelectedIndex(0);
        setDisplayPage(0);
      }
      return;
    }
    
    // Confirm mark all mode
    if (mode === 'confirm-mark-all') {
      if (input === 'n' || input === 'N' || key.escape) {
        setMode('list');
      } else if (input === 'y' || input === 'Y' || key.return) {
        // Mark all videos in current view as watched
        const videoIds = allVideos.map((v) => v.id);
        markChannelAllWatched(videoIds);
        setWatchedIds(getWatchedIds());
        setMessage(`Marked ${videoIds.length} videos as watched`);
        setMode('list');
      }
      return;
    }

    if (key.escape || input === 'b') {
      if (filterText) {
        setFilterText('');
        setSelectedIndex(0);
        setDisplayPage(0);
      } else {
        onBack();
      }
    } else if (input === 'q') {
      process.exit(0);
    } else if (input === 'r' && !loading) {
      setDisplayPage(0);
      initialLoad();
    } else if (input === 's') {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setSelectedIndex(0);
      setDisplayPage(0);
      setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
    } else if (input === '/') {
      setIsFiltering(true);
    } else if (input === 'n') {
      if (channel) {
        // Channel view: display pagination
        if (displayPage < displayTotalPages - 1) {
          setDisplayPage((p) => p + 1);
          setSelectedIndex(0);
        }
      } else if (currentPage < totalPages - 1) {
        // All videos view: store pagination
        setCurrentPage((p) => p + 1);
      }
    } else if (input === 'p') {
      if (channel) {
        // Channel view: display pagination
        if (displayPage > 0) {
          setDisplayPage((p) => p - 1);
          setSelectedIndex(0);
        }
      } else if (currentPage > 0) {
        // All videos view: store pagination
        setCurrentPage((p) => p - 1);
      }
    } else if (input === 'w' && visibleVideos.length > 0) {
      // Toggle watched status
      const video = visibleVideos[selectedIndex];
      const nowWatched = toggleWatched(video.id);
      setWatchedIds(getWatchedIds());
      setMessage(nowWatched ? 'Marked as watched' : 'Marked as unwatched');
    } else if (input === 'm' && channel && visibleVideos.length > 0) {
      // Mark all as watched (only in channel view)
      setMode('confirm-mark-all');
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(visibleVideos.length - 1, i + 1));
    } else if (key.return && !loading) {
      handlePlay();
    }
  });

  const handlePlay = async () => {
    if (visibleVideos.length === 0) return;

    const video = visibleVideos[selectedIndex];
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
  // Show page info: for channel view use displayPage, for all videos use currentPage
  const pageInfo = channel 
    ? (displayTotalPages > 1 ? ` [${displayPage + 1}/${displayTotalPages}]` : '')
    : (totalVideos > 0 ? ` [${currentPage + 1}/${totalPages}]` : '');
  const loadingInfo = loading ? ' - Refreshing...' : '';
  const subtitle = `${filteredVideos.length} video${filteredVideos.length !== 1 ? 's' : ''}${filterInfo}${pageInfo}${loadingInfo}`;

  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} loading={loading} />

      {mode === 'confirm-mark-all' && (
        <Box>
          <Text>Mark all {allVideos.length} videos as watched? (y/n)</Text>
        </Box>
      )}

      {error && !filteredVideos.length && (
        <Box>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {!loading && filteredVideos.length === 0 && !error && (
        <Text color="gray">No videos found.</Text>
      )}

      {filteredVideos.length > 0 && (
        <Box flexDirection="column">
          {visibleVideos.map((video, index) => {
            const isSelected = index === selectedIndex;
            const isWatched = watchedIds.has(video.id);
            
            // Format columns with fixed widths
            const pointer = isSelected ? '>' : ' ';
            const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : '';
            const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
            const dateText = (isWatched && !isSelected ? '* ' : '  ') + pad(video.relativeDate || '', dateColWidth - 2);

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
                  dateText={dateText}
                  isSelected={isSelected}
                  isWatched={isWatched}
                  showChannel={showChannel}
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

        {error && filteredVideos.length > 0 && (
          <Box>
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
              <KeyHint keyName="w" description="atched" />
              {channel && <KeyHint keyName="m" description="ark all" />}
              <KeyHint keyName="/" description=" filter" />
              <KeyHint keyName="s" description={hideShorts ? " +shorts" : " -shorts"} />
              {(channel ? displayTotalPages > 1 : totalPages > 1) && (
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
    </Box>
  );
}
