import React, { memo } from 'react';
import { Text } from 'ink';

const VideoRow = memo(function VideoRow({
  pointer,
  channelText,
  titleText,
  metaText,
  extraText,
  isSelected,
  isWatched,
  showChannel = true,
}) {
  const color = isSelected ? 'cyan' : undefined;
  const dim = isWatched && !isSelected;

  return (
    <>
      <Text color={color} dimColor={dim}>{pointer}</Text>
      {showChannel && <Text color={isSelected ? 'cyan' : 'yellow'} dimColor={dim}>{channelText}</Text>}
      <Text color={color} dimColor={dim}>{titleText}</Text>
      <Text color={isSelected ? 'cyan' : 'gray'}>{metaText}</Text>
      {extraText && <Text color={isSelected ? 'cyan' : 'magenta'}>{extraText}</Text>}
      {!isWatched && <Text color="green"> ●</Text>}
    </>
  );
});

export default VideoRow;
