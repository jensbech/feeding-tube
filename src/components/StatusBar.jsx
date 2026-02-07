import React, { useRef } from 'react';
import { Box, Text } from 'ink';
import { useOnClick } from '@ink-tools/ink-mouse';
import { useTerminalWidth } from '../lib/ui.js';

export default function StatusBar({ children }) {
  const width = useTerminalWidth();

  return (
    <Box marginTop={1} flexDirection="column">
      <Box><Text color="gray">{'─'.repeat(width)}</Text></Box>
      <Box>{children}</Box>
    </Box>
  );
}

export function KeyHint({ keyName, description, onClick }) {
  const ref = useRef(null);
  useOnClick(ref, onClick || (() => {}));

  return (
    <Box ref={ref} marginRight={2}>
      <Text color="yellow">({keyName})</Text>
      <Text color="gray">{description}</Text>
    </Box>
  );
}
