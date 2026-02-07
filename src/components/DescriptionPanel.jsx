import React from 'react';
import { Box, Text } from 'ink';

export default function DescriptionPanel({ loading, description, onClose }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginBottom={1}>
      {loading ? (
        <Text color="gray">Loading description...</Text>
      ) : description && (
        <>
          <Box marginBottom={1}><Text bold color="cyan">{description.title}</Text></Box>
          <Box marginBottom={1}><Text color="yellow">{description.channelName}</Text></Box>
          <Box>
            <Text wrap="wrap">
              {description.description?.slice(0, 500)}
              {description.description?.length > 500 ? '...' : ''}
            </Text>
          </Box>
        </>
      )}
      <Box marginTop={1}><Text color="gray">Press (i) to close</Text></Box>
    </Box>
  );
}
