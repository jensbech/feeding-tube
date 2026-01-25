import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Header from '../components/Header.jsx';
import Loading from '../components/Loading.jsx';
import StatusBar, { KeyHint } from '../components/StatusBar.jsx';
import { getSubscriptions, addSubscription, removeSubscription } from '../lib/config.js';
import { getChannelInfo } from '../lib/ytdlp.js';

export default function ChannelList({ onSelectChannel, onBrowseAll, onQuit }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState('list'); // 'list' | 'add' | 'confirm-delete'
  const [addUrl, setAddUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  // Load subscriptions on mount
  useEffect(() => {
    setSubscriptions(getSubscriptions());
  }, []);

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
    if (loading) return;

    if (mode === 'add') {
      if (key.escape) {
        setMode('list');
        setAddUrl('');
      }
      return;
    }

    if (mode === 'confirm-delete') {
      if (input === 'y' || input === 'Y') {
        handleDelete();
      } else {
        setMode('list');
      }
      return;
    }

    // List mode
    if (input === 'q') {
      onQuit();
    } else if (input === 'a') {
      setMode('add');
      setAddUrl('');
    } else if (input === 'd' && subscriptions.length > 0) {
      setMode('confirm-delete');
    } else if (input === 'v') {
      onBrowseAll();
    } else if (key.upArrow || input === 'k') {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow || input === 'j') {
      setSelectedIndex((i) => Math.min(subscriptions.length - 1, i + 1));
    } else if (key.return) {
      if (subscriptions.length > 0) {
        onSelectChannel(subscriptions[selectedIndex]);
      }
    }
  });

  const handleAddSubmit = async (url) => {
    if (!url.trim()) {
      setMode('list');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const channelInfo = await getChannelInfo(url);
      const result = addSubscription(channelInfo);

      if (result.success) {
        setSubscriptions(getSubscriptions());
        setMessage(`Added: ${channelInfo.name}`);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setMode('list');
      setAddUrl('');
    }
  };

  const handleDelete = () => {
    if (subscriptions.length === 0) return;

    const channel = subscriptions[selectedIndex];
    const result = removeSubscription(selectedIndex);

    if (result.success) {
      setSubscriptions(getSubscriptions());
      setMessage(`Removed: ${channel.name}`);
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else {
      setError(result.error);
    }
    setMode('list');
  };

  return (
    <Box flexDirection="column">
      <Header
        title="Channels"
        subtitle={`${subscriptions.length} subscription${subscriptions.length !== 1 ? 's' : ''}`}
      />

      {loading && <Loading message="Fetching channel info..." />}

      {!loading && mode === 'add' && (
        <Box flexDirection="column">
          <Box>
            <Text color="cyan">Enter channel URL: </Text>
            <TextInput
              value={addUrl}
              onChange={setAddUrl}
              onSubmit={handleAddSubmit}
              placeholder="https://youtube.com/@channel"
            />
          </Box>
          <Text color="gray">Press ESC to cancel</Text>
        </Box>
      )}

      {!loading && mode === 'confirm-delete' && subscriptions.length > 0 && (
        <Box flexDirection="column">
          <Text color="red">
            Delete "{subscriptions[selectedIndex].name}"? (y/N)
          </Text>
        </Box>
      )}

      {!loading && mode === 'list' && (
        <Box flexDirection="column">
          {subscriptions.length === 0 ? (
            <Box flexDirection="column">
              <Text color="gray">No subscriptions yet.</Text>
              <Text color="gray">Press (a) to add a channel.</Text>
            </Box>
          ) : (
            subscriptions.map((sub, index) => (
              <Box key={sub.id || index}>
                <Text color={index === selectedIndex ? 'cyan' : undefined}>
                  {index === selectedIndex ? '>' : ' '} {sub.name}
                </Text>
              </Box>
            ))
          )}
        </Box>
      )}

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {message && (
        <Box marginTop={1}>
          <Text color="green">{message}</Text>
        </Box>
      )}

      <StatusBar>
        {mode === 'list' && (
          <>
            <KeyHint keyName="a" description="dd" />
            {subscriptions.length > 0 && <KeyHint keyName="d" description="elete" />}
            <KeyHint keyName="v" description="iew all" />
            <KeyHint keyName="Enter" description=" browse" />
            <KeyHint keyName="q" description="uit" />
          </>
        )}
      </StatusBar>
    </Box>
  );
}
