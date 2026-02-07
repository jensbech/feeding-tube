import React, { useRef, useCallback } from 'react';
import { Box } from 'ink';
import { useOnClick } from '@ink-tools/ink-mouse';

const DOUBLE_CLICK_THRESHOLD = 400;

let lastClickTime = 0;
let lastClickIndex = -1;
let clickLock = false;

export default function ClickableRow({ index, onSelect, onActivate, children }) {
  const ref = useRef(null);

  const handleClick = useCallback(() => {
    if (clickLock) return;
    clickLock = true;
    setTimeout(() => { clickLock = false; }, 50);

    const now = Date.now();
    const isDoubleClick = now - lastClickTime < DOUBLE_CLICK_THRESHOLD && lastClickIndex === index;

    if (isDoubleClick) {
      onActivate?.(index);
      lastClickTime = 0;
      lastClickIndex = -1;
    } else {
      onSelect?.(index);
      lastClickTime = now;
      lastClickIndex = index;
    }
  }, [index, onSelect, onActivate]);

  useOnClick(ref, handleClick);

  return <Box ref={ref}>{children}</Box>;
}
