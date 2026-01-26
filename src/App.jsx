import React, { useState, useRef } from 'react';
import { Box, useApp } from 'ink';
import ChannelList from './screens/ChannelList.jsx';
import VideoList from './screens/VideoList.jsx';
import SearchResults from './screens/SearchResults.jsx';

export default function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState(initialChannel ? 'videos' : 'channels');
  const [selectedChannel, setSelectedChannel] = useState(initialChannel || null);
  const [searchQuery, setSearchQuery] = useState('');
  const hasCheckedForNew = useRef(false);
  const savedChannelListIndex = useRef(0);

  const handleSelectChannel = (channel, index) => {
    savedChannelListIndex.current = index;
    setSelectedChannel(channel);
    setScreen('videos');
  };

  const handleBrowseAll = () => {
    setSelectedChannel(null);
    setScreen('videos');
  };

  const handleGlobalSearch = (query) => {
    setSearchQuery(query);
    setScreen('search');
  };

  const handleBack = () => {
    setScreen('channels');
    setSelectedChannel(null);
    setSearchQuery('');
  };

  const handleQuit = () => {
    exit();
  };

  const markChecked = () => {
    hasCheckedForNew.current = true;
  };

  return (
    <Box flexDirection="column">
      {screen === 'channels' && (
        <ChannelList
          onSelectChannel={handleSelectChannel}
          onBrowseAll={handleBrowseAll}
          onGlobalSearch={handleGlobalSearch}
          onQuit={handleQuit}
          skipRefresh={hasCheckedForNew.current}
          onRefreshDone={markChecked}
          savedIndex={savedChannelListIndex.current}
        />
      )}
      {screen === 'videos' && (
        <VideoList
          channel={selectedChannel}
          onBack={handleBack}
        />
      )}
      {screen === 'search' && (
        <SearchResults
          query={searchQuery}
          onBack={handleBack}
        />
      )}
    </Box>
  );
}
