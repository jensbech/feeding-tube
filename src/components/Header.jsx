import React from 'react';
import { Box, Text, useStdout } from 'ink';
import Spinner from 'ink-spinner';

export default function Header({ title, subtitle, hints, loading }) {
  const { stdout } = useStdout();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
  
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text bold color="cyan">ytsub</Text>
        {title && (
          <>
            <Text color="gray"> - </Text>
            <Text bold>{title}</Text>
          </>
        )}
        {subtitle && (
          <Text color="gray"> ({subtitle})</Text>
        )}
        {loading && (
          <Text color="cyan"> <Spinner type="dots" /></Text>
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
