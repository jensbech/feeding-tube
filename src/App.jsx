import React, { useState } from 'react';
import { Box, useApp } from 'ink';
import ChannelList from './screens/ChannelList.jsx';
import VideoList from './screens/VideoList.jsx';

export default function App({ initialChannel }) {
  const { exit } = useApp();
  const [screen, setScreen] = useState(initialChannel ? 'videos' : 'channels');
  const [selectedChannel, setSelectedChannel] = useState(initialChannel || null);

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

  return (
    <Box flexDirection="column">
      {screen === 'channels' && (
        <ChannelList
          onSelectChannel={handleSelectChannel}
          onBrowseAll={handleBrowseAll}
          onQuit={handleQuit}
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
