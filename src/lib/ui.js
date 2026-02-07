import { useState, useEffect, useCallback } from 'react';
import { useStdout } from 'ink';

export function useTerminalWidth(minWidth = 60, margin = 5) {
  const { stdout } = useStdout();
  return Math.max((stdout?.columns || 80) - margin, minWidth);
}

export function truncate(text, maxLen) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

export function pad(text, width) {
  if (!text) return ' '.repeat(width);
  if (text.length >= width) return text.slice(0, width);
  return text + ' '.repeat(width - text.length);
}

export function formatViews(count) {
  if (!count && count !== 0) return '';
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
  return String(count);
}

export function useAutoHideMessage(initialValue = null, timeout = 3000) {
  const [message, setMessage] = useState(initialValue);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (message || error) {
      const timer = setTimeout(() => {
        setMessage(null);
        setError(null);
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [message, error, timeout]);

  return { message, setMessage, error, setError };
}

export function useScrollableList(items, visibleCount) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const moveUp = useCallback(() => {
    setSelectedIndex((i) => {
      const newIndex = Math.max(0, i - 1);
      if (newIndex < scrollOffset) {
        setScrollOffset(newIndex);
      }
      return newIndex;
    });
  }, [scrollOffset]);

  const moveDown = useCallback(() => {
    setSelectedIndex((i) => {
      const newIndex = Math.min(items.length - 1, i + 1);
      if (newIndex >= scrollOffset + visibleCount) {
        setScrollOffset(newIndex - visibleCount + 1);
      }
      return newIndex;
    });
  }, [items.length, scrollOffset, visibleCount]);

  const reset = useCallback(() => {
    setSelectedIndex(0);
    setScrollOffset(0);
  }, []);

  const setIndex = useCallback((index) => {
    setSelectedIndex(index);
    if (index < scrollOffset) {
      setScrollOffset(index);
    } else if (index >= scrollOffset + visibleCount) {
      setScrollOffset(index - visibleCount + 1);
    }
  }, [scrollOffset, visibleCount]);

  return {
    selectedIndex,
    scrollOffset,
    moveUp,
    moveDown,
    reset,
    setIndex,
    setSelectedIndex,
    setScrollOffset,
    visibleItems: items.slice(scrollOffset, scrollOffset + visibleCount),
  };
}

export function useFilterMode() {
  const [filterText, setFilterText] = useState('');
  const [isFiltering, setIsFiltering] = useState(false);

  const startFiltering = useCallback(() => {
    setIsFiltering(true);
  }, []);

  const stopFiltering = useCallback(() => {
    setIsFiltering(false);
  }, []);

  const clearFilter = useCallback(() => {
    setFilterText('');
    setIsFiltering(false);
  }, []);

  const handleFilterInput = useCallback((input, key) => {
    if (key.escape) {
      clearFilter();
      return true;
    }
    if (key.return) {
      stopFiltering();
      return true;
    }
    if (key.backspace || key.delete) {
      setFilterText((t) => t.slice(0, -1));
      return true;
    }
    if (input && !key.ctrl && !key.meta) {
      setFilterText((t) => t + input);
      return true;
    }
    return false;
  }, [clearFilter, stopFiltering]);

  return {
    filterText,
    setFilterText,
    isFiltering,
    startFiltering,
    stopFiltering,
    clearFilter,
    handleFilterInput,
  };
}

export function calculateVisibleRows(terminalHeight, reservedRows = 6) {
  return Math.max(5, Math.floor((terminalHeight - reservedRows) * 0.95));
}
