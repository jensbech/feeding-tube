import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import Header from '../components/Header.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import ClickableRow from '../components/ClickableRow.jsx';
import DescriptionPanel from '../components/DescriptionPanel.jsx';
import VideoRow from '../components/VideoRow.jsx';
import { getChannelVideos, refreshAllVideos, getVideoPage, getVideoDescription } from '../lib/ytdlp.js';
import { getSubscriptions, getSettings, getWatchedIds, updateSettings, toggleWatched, markChannelAllWatched } from '../lib/config.js';
import { playVideo } from '../lib/player.js';
import { useAutoHideMessage, calculateVisibleRows, truncate, pad } from '../lib/ui.js';

export default function VideoList({ channel, onBack }) {
  const [allVideos, setAllVideos] = useState([]);
  const [watchedIds, setWatchedIds] = useState(() => getWatchedIds());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hideShorts, setHideShorts] = useState(() => getSettings().hideShorts ?? true);
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalVideos, setTotalVideos] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [mode, setMode] = useState('list');
  const [showDescription, setShowDescription] = useState(false);
  const [description, setDescription] = useState(null);
  const [loadingDescription, setLoadingDescription] = useState(false);

  const { message, setMessage, error, setError } = useAutoHideMessage();
  const channelIdsRef = useRef(null);
  const { stdout } = useStdout();
  const terminalWidth = stdout?.columns || 80;
  const visibleCount = calculateVisibleRows(stdout?.rows || 24);

  const filteredVideos = allVideos.filter((v) => {
    if (hideShorts && v.isShort) return false;
    if (filterText) {
      const search = filterText.toLowerCase();
      return v.title?.toLowerCase().includes(search) || v.channelName?.toLowerCase().includes(search);
    }
    return true;
  });

  const visibleVideos = filteredVideos.slice(scrollOffset, scrollOffset + visibleCount);
  const totalPages = Math.ceil(totalVideos / pageSize);

  const resetScroll = () => { setSelectedIndex(0); setScrollOffset(0); };

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWatchedIds(getWatchedIds());

    try {
      if (channel) {
        const channelVideos = await getChannelVideos(channel, getSettings().videosPerChannel || 15);
        setAllVideos(channelVideos);
        setTotalVideos(channelVideos.length);
        setCurrentPage(0);
      } else {
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
  }, [channel, setError]);

  const loadPage = useCallback((page) => {
    if (!channelIdsRef.current || channel) return;
    const result = getVideoPage(channelIdsRef.current, page, 100);
    setAllVideos(result.videos);
    setTotalVideos(result.total);
    setSelectedIndex(0);
  }, [channel]);

  useEffect(() => { initialLoad(); }, [initialLoad]);

  useEffect(() => {
    if (!loading && !channel && channelIdsRef.current && currentPage > 0) loadPage(currentPage);
  }, [currentPage, loading, channel, loadPage]);

  const handlePlay = async () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    if (!video?.url) { setError('No video selected'); return; }

    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  };

  const fetchDescription = async () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
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

  const handleToggleShorts = () => {
    const newValue = !hideShorts;
    setHideShorts(newValue);
    updateSettings({ hideShorts: newValue });
    resetScroll();
    setMessage(newValue ? 'Hiding Shorts' : 'Showing all videos');
  };

  const handleToggleWatched = () => {
    if (filteredVideos.length === 0) return;
    const video = filteredVideos[selectedIndex];
    const nowWatched = toggleWatched(video.id);
    setWatchedIds(getWatchedIds());
    setMessage(nowWatched ? 'Marked as watched' : 'Marked as unwatched');
  };

  useInput((input, key) => {
    if (playing) return;
    if (loading && mode !== 'list') return;

    if (isFiltering) {
      if (key.escape) { setIsFiltering(false); setFilterText(''); resetScroll(); }
      else if (key.return) setIsFiltering(false);
      else if (key.backspace || key.delete) { setFilterText((t) => t.slice(0, -1)); resetScroll(); }
      else if (input && !key.ctrl && !key.meta) { setFilterText((t) => t + input); resetScroll(); }
      return;
    }

    if (mode === 'confirm-mark-all') {
      if (input === 'n' || input === 'N' || key.escape) setMode('list');
      else if (input === 'y' || input === 'Y' || key.return) {
        markChannelAllWatched(allVideos.map((v) => v.id));
        setWatchedIds(getWatchedIds());
        setMessage(`Marked ${allVideos.length} videos as watched`);
        setMode('list');
      }
      return;
    }

    if (key.escape || input === 'b') {
      if (filterText) { setFilterText(''); resetScroll(); }
      else onBack();
    } else if (input === 'q') process.exit(0);
    else if (input === 'r' && !loading) { setScrollOffset(0); initialLoad(); }
    else if (input === 's') handleToggleShorts();
    else if (input === '/') setIsFiltering(true);
    else if (input === 'n' && !channel && currentPage < totalPages - 1) { setCurrentPage((p) => p + 1); resetScroll(); }
    else if (input === 'p' && !channel && currentPage > 0) { setCurrentPage((p) => p - 1); resetScroll(); }
    else if (input === 'w') handleToggleWatched();
    else if (input === 'm' && channel && filteredVideos.length > 0) setMode('confirm-mark-all');
    else if (input === 'i' && filteredVideos.length > 0) {
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
        const newIndex = Math.min(filteredVideos.length - 1, i + 1);
        if (newIndex >= scrollOffset + visibleCount) setScrollOffset(newIndex - visibleCount + 1);
        return newIndex;
      });
    } else if (key.return && !loading) handlePlay();
  });

  const handleRowSelect = useCallback((vi) => setSelectedIndex(scrollOffset + vi), [scrollOffset]);

  const handleRowActivate = useCallback(async (vi) => {
    if (filteredVideos.length === 0 || playing || loading) return;
    const actualIndex = scrollOffset + vi;
    const video = filteredVideos[actualIndex];
    if (!video?.url) return;

    setSelectedIndex(actualIndex);
    setPlaying(true);
    setMessage(`Opening: ${video.title}`);
    const result = await playVideo(video.url, video.id);
    setWatchedIds(getWatchedIds());
    setMessage(result.success ? `Playing in ${result.player}` : null);
    if (!result.success) setError(`Failed to play: ${result.error}`);
    setPlaying(false);
  }, [filteredVideos, scrollOffset, playing, loading, setMessage, setError]);

  const showChannel = !channel;
  const channelColWidth = showChannel ? 32 : 0;
  const dateColWidth = 8;
  const availableWidth = Math.max(terminalWidth - 5, 80);
  const titleColWidth = availableWidth - 2 - channelColWidth - dateColWidth - 2;

  const title = channel ? channel.name : 'All Videos';
  const filterInfo = filterText ? ` (filter: "${filterText}")` : '';
  const pageInfo = !channel && totalPages > 1 ? ` [${currentPage + 1}/${totalPages}]` : '';
  const subtitle = `${filteredVideos.length} video${filteredVideos.length !== 1 ? 's' : ''}${filterInfo}${pageInfo}`;

  return (
    <Box flexDirection="column">
      <Header title={title} subtitle={subtitle} loading={loading} loadingMessage={loading ? 'Refreshing...' : ''} hideShorts={hideShorts} />

      {mode === 'confirm-mark-all' && <Text>Mark all {allVideos.length} videos as watched? (y/n)</Text>}
      {error && !filteredVideos.length && <Text color="red">{error}</Text>}
      {!loading && filteredVideos.length === 0 && !error && <Text color="gray">No videos found.</Text>}

      {showDescription && <DescriptionPanel loading={loadingDescription} description={description} />}

      {filteredVideos.length > 0 && !showDescription && (
        <Box flexDirection="column">
          {visibleVideos.map((video, index) => {
            const actualIndex = scrollOffset + index;
            const isSelected = actualIndex === selectedIndex;
            const isWatched = watchedIds.has(video.id);
            const pointer = isSelected ? '>' : ' ';
            const channelText = showChannel ? pad(truncate(video.channelName, channelColWidth - 1), channelColWidth) : '';
            const titleText = pad(truncate(video.title, titleColWidth - 1), titleColWidth);
            const dateText = '  ' + pad(video.relativeDate || '', dateColWidth - 2);

            return (
              <ClickableRow key={video.id} index={index} onSelect={handleRowSelect} onActivate={handleRowActivate}>
                <VideoRow pointer={pointer} channelText={channelText} titleText={titleText} metaText={dateText} isSelected={isSelected} isWatched={isWatched} showChannel={showChannel} />
              </ClickableRow>
            );
          })}
        </Box>
      )}

      <Box flexDirection="column">
        {message && <Text color="green">{message}</Text>}
        {error && filteredVideos.length > 0 && <Text color="red">{error}</Text>}
        <StatusBar>
          {isFiltering ? (
            <Text><Text color="yellow">Filter: </Text><Text>{filterText}</Text><Text color="gray">_  (Enter to confirm, Esc to cancel)</Text></Text>
          ) : showDescription ? (
            <KeyHint keyName="i" description=" close info" onClick={() => { setShowDescription(false); setDescription(null); }} />
          ) : (
            <>
              <KeyHint keyName="Enter" description=" play" onClick={handlePlay} />
              <KeyHint keyName="i" description="nfo" onClick={fetchDescription} />
              <KeyHint keyName="w" description="atched" onClick={handleToggleWatched} />
              {channel && <KeyHint keyName="m" description="ark all" onClick={() => setMode('confirm-mark-all')} />}
              <KeyHint keyName="/" description=" filter" onClick={() => setIsFiltering(true)} />
              <KeyHint keyName="s" description={hideShorts ? " +shorts" : " -shorts"} onClick={handleToggleShorts} />
              {!channel && totalPages > 1 && (
                <>
                  <KeyHint keyName="n" description="ext" onClick={() => { if (currentPage < totalPages - 1) { setCurrentPage((p) => p + 1); resetScroll(); } }} />
                  <KeyHint keyName="p" description="rev" onClick={() => { if (currentPage > 0) { setCurrentPage((p) => p - 1); resetScroll(); } }} />
                </>
              )}
              <KeyHint keyName="r" description="efresh" onClick={() => { if (!loading) { setScrollOffset(0); initialLoad(); } }} />
              <KeyHint keyName="b" description="ack" onClick={() => { if (filterText) { setFilterText(''); resetScroll(); } else onBack(); }} />
              <KeyHint keyName="q" description="uit" onClick={() => process.exit(0)} />
            </>
          )}
        </StatusBar>
      </Box>
    </Box>
  );
}
