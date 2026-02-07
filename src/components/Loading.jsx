import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export default function Loading({ message = 'Loading...' }) {
  return (
    <Box>
      <Text color="cyan"><Spinner type="dots" /></Text>
      <Text> {message}</Text>
    </Box>
  );
}
