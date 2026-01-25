import React, { useState, useRef } from 'react';
import { Box, useApp } from 'ink';
import ChannelList from './screens/ChannelList.jsx';
import VideoList from './screens/VideoList.jsx';

export default function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState(initialChannel ? 'videos' : 'channels');
  const [selectedChannel, setSelectedChannel] = useState(initialChannel || null);
  const hasCheckedForNew = useRef(false);

  const handleSelectChannel = (channel) => {
    setSelectedChannel(channel);
    setScreen('videos');
  };

  const handleBrowseAll = () => {
    setSelectedChannel(null);
    setScreen('videos');
  };

  const handleBack = () => {
    setScreen('channels');
    setSelectedChannel(null);
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
          onQuit={handleQuit}
          skipRefresh={hasCheckedForNew.current}
          onRefreshDone={markChecked}
        />
      )}
      {screen === 'videos' && (
        <VideoList
          channel={selectedChannel}
          onBack={handleBack}
        />
      )}
    </Box>
  );
}
