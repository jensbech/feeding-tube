import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Spinner from 'ink-spinner';

export default function Header({ title, subtitle, hints, loading, loadingMessage, hideShorts, onToggleShorts }) {
  const { stdout } = useStdout();
  const width = Math.max((stdout?.columns || 80) - 5, 60);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">youtube-cli</Text>
        {title && (
          <>
            <Text color="gray"> - </Text>
            <Text bold>{title}</Text>
          </>
        )}
        {subtitle && (
          <Text color="gray"> ({subtitle})</Text>
        )}
        {hideShorts !== undefined && (
          <>
            <Text color="gray"> │ </Text>
            <Text color={hideShorts ? 'yellow' : 'gray'}>shorts {hideShorts ? 'hidden' : 'shown'}</Text>
          </>
        )}
        {loading && (
          <>
            <Text color="gray"> │ </Text>
            <Text color="cyan"><Spinner type="dots" /></Text>
            {loadingMessage && <Text color="green"> {loadingMessage}</Text>}
          </>
        )}
      </Box>
      {hints && (
        <Box marginTop={0}>
          <Text color="gray">{hints}</Text>
        </Box>
      )}
      <Box>
        <Text color="gray">{'─'.repeat(width)}</Text>
      </Box>
    </Box>
  );
}
