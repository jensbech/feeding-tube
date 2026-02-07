import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTerminalWidth } from '../lib/ui.js';

export default function Header({ title, subtitle, loading, loadingMessage, hideShorts }) {
  const width = useTerminalWidth();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">youtube-cli</Text>
        {title && <><Text color="gray"> - </Text><Text bold>{title}</Text></>}
        {subtitle && <Text color="gray"> ({subtitle})</Text>}
        {hideShorts !== undefined && (
          <><Text color="gray"> │ </Text><Text color={hideShorts ? 'yellow' : 'gray'}>shorts {hideShorts ? 'hidden' : 'shown'}</Text></>
        )}
        {loading && (
          <>
            <Text color="gray"> │ </Text>
            <Text color="cyan"><Spinner type="dots" /></Text>
            {loadingMessage && <Text color="green"> {loadingMessage}</Text>}
          </>
        )}
      </Box>
      <Box><Text color="gray">{'─'.repeat(width)}</Text></Box>
    </Box>
  );
}
