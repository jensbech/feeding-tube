import React from 'react';
import { Box, Text, useStdout } from 'ink';

export default function StatusBar({ children }) {
  const { stdout } = useStdout();
  const width = Math.max((stdout?.columns || 80) - 5, 60);
  
  return (
    <Box marginTop={1} flexDirection="column">
      <Box>
        <Text color="gray">{'─'.repeat(width)}</Text>
      </Box>
      <Box>
        {children}
      </Box>
    </Box>
  );
}

export function KeyHint({ keyName, description }) {
  return (
    <Box marginRight={2}>
      <Text color="yellow">({keyName})</Text>
      <Text color="gray">{description}</Text>
    </Box>
  );
}
