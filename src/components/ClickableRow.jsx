import React, { useRef, useCallback } from 'react';
import { Box } from 'ink';
import { useOnClick } from '@ink-tools/ink-mouse';

const DOUBLE_CLICK_THRESHOLD = 400; // ms

/**
 * Wrapper component that makes a row clickable with double-click support
 * 
 * @param {Object} props
 * @param {number} props.index - Row index
 * @param {Function} props.onSelect - Called on single click with index
 * @param {Function} props.onActivate - Called on double click with index
 * @param {React.ReactNode} props.children - Row content
 */
export default function ClickableRow({ index, onSelect, onActivate, children }) {
  const ref = useRef(null);
  const lastClickTime = useRef(0);
  const lastClickIndex = useRef(-1);

  const handleClick = useCallback(() => {
    const now = Date.now();
    const timeDiff = now - lastClickTime.current;
    
    // Check for double-click on same row
    if (timeDiff < DOUBLE_CLICK_THRESHOLD && lastClickIndex.current === index) {
      // Double click - activate
      onActivate?.(index);
      lastClickTime.current = 0; // Reset to prevent triple-click
      lastClickIndex.current = -1;
    } else {
      // Single click - select
      onSelect?.(index);
      lastClickTime.current = now;
      lastClickIndex.current = index;
    }
  }, [index, onSelect, onActivate]);

  useOnClick(ref, handleClick);

  return (
    <Box ref={ref}>
      {children}
    </Box>
  );
}
