import React, { useRef, useCallback } from 'react';
import { Box } from 'ink';
import { useOnClick } from '@ink-tools/ink-mouse';

const DOUBLE_CLICK_THRESHOLD = 400; // ms

// Global click tracking to prevent multiple rows from handling the same click
let globalLastClickTime = 0;
let globalLastClickIndex = -1;
let globalClickLock = false;

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

  const handleClick = useCallback(() => {
    // Prevent multiple rows from handling the same click event
    if (globalClickLock) return;
    globalClickLock = true;
    setTimeout(() => { globalClickLock = false; }, 50);

    const now = Date.now();
    const timeDiff = now - globalLastClickTime;

    // Check for double-click on same row
    if (timeDiff < DOUBLE_CLICK_THRESHOLD && globalLastClickIndex === index) {
      // Double click - activate
      onActivate?.(index);
      globalLastClickTime = 0; // Reset to prevent triple-click
      globalLastClickIndex = -1;
    } else {
      // Single click - select
      onSelect?.(index);
      globalLastClickTime = now;
      globalLastClickIndex = index;
    }
  }, [index, onSelect, onActivate]);

  useOnClick(ref, handleClick);

  return (
    <Box ref={ref}>
      {children}
    </Box>
  );
}
