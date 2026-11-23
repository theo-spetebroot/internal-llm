import { useCallback, useLayoutEffect, useRef } from 'react';

/** Distance from the bottom under which the view counts as "at the bottom". */
const THRESHOLD_PX = 80;

/**
 * Keeps a scroll container (attach `ref`) pinned to its bottom while its content grows
 * (streamed answer), unless the user has scrolled up to read; scrolling back down re-pins it.
 * `version` changes whenever the content may have grown.
 */
export function useStickToBottom<T extends HTMLElement>(version: string | number) {
  const ref = useRef<T>(null);
  const pinned = useRef(true);

  const onScroll = useCallback(() => {
    const element = ref.current;
    if (!element) return;
    pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < THRESHOLD_PX;
  }, []);

  /** Pins the view again (e.g. the user just sent a message). */
  const pin = useCallback(() => {
    pinned.current = true;
  }, []);

  useLayoutEffect(() => {
    const element = ref.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [version]);

  return { ref, onScroll, pin };
}
