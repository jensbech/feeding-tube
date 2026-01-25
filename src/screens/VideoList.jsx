import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import { getChannelVideos, getAllVideos } from '../lib/ytdlp.js';
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
  
  // Filter videos based on hideShorts setting
  const videos = hideShorts ? allVideos.filter((v) => !v.isShort) : allVideos;
  
  const { stdout } = useStdout();
  const terminalHeight = stdout?.rows || 24;
  const terminalWidth = stdout?.columns || 80;
  const maxVisibleVideos = Math.max(5, terminalHeight - 10);
  
  // Calculate scroll offset to keep selection visible
  const scrollOffset = Math.max(0, selectedIndex - maxVisibleVideos + 3);
  const visibleVideos = videos.slice(scrollOffset, scrollOffset + maxVisibleVideos);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    // Load watched videos
    setWatchedIds(getWatchedIds());

    try {
      const settings = getSettings();
      const limit = settings.videosPerChannel || 15;

      if (channel) {
        // Load videos for specific channel using RSS
        const channelVideos = await getChannelVideos(channel, limit);
        setAllVideos(channelVideos);
      } else {
        // Load videos from all subscriptions
        const subscriptions = getSubscriptions();
        if (subscriptions.length === 0) {
          setAllVideos([]);
          setError('No subscriptions. Go back and add some channels first.');
        } else {
          const fetchedVideos = await getAllVideos(subscriptions, Math.min(limit, 10));
          setAllVideos(fetchedVideos);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

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

    if (key.escape || input === 'b') {
      onBack();
    } else if (input === 'q') {
      process.exit(0);
    } else if (input === 'r') {
      loadVideos();
    } else if (input === 's') {
      const newValue = !hideShorts;
      setHideShorts(newValue);
      updateSettings({ hideShorts: newValue });
      setSelectedIndex(0);
      setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
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
  const subtitle = loading ? 'loading...' : `${videos.length} video${videos.length !== 1 ? 's' : ''}`;

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
        <KeyHint keyName="Enter" description=" play" />
        <KeyHint keyName="s" description={hideShorts ? " +shorts" : " -shorts"} />
        <KeyHint keyName="r" description="efresh" />
        <KeyHint keyName="b" description="ack" />
        <KeyHint keyName="q" description="uit" />
      </StatusBar>
    </Box>
  );
}
