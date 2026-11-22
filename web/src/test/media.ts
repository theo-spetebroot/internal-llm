import { act } from '@testing-library/react';

import { DESKTOP_MEDIA_QUERY } from '@/lib/use-media-query';
import { DARK_MEDIA_QUERY } from '@/theme/theme';

/**
 * jsdom has no `matchMedia`: this fake answers the two queries the app uses from a state
 * the tests control (viewport, OS colour scheme), and notifies listeners when it changes.
 */
const state = { desktop: true, systemDark: false };
const lists = new Set<FakeMediaQueryList>();

class FakeMediaQueryList extends EventTarget {
  onchange = null;

  constructor(readonly media: string) {
    super();
  }

  get matches(): boolean {
    if (this.media === DESKTOP_MEDIA_QUERY) return state.desktop;
    if (this.media === DARK_MEDIA_QUERY) return state.systemDark;
    return false;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ): void {
    lists.add(this);
    super.addEventListener(type, listener, options);
  }
}

export function installMatchMedia(): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => new FakeMediaQueryList(query),
  });
}

function notify(): void {
  act(() => {
    for (const list of lists) list.dispatchEvent(new Event('change'));
  });
}

export function setViewport(viewport: 'mobile' | 'desktop'): void {
  state.desktop = viewport === 'desktop';
  notify();
}

export function setSystemDark(dark: boolean): void {
  state.systemDark = dark;
  notify();
}

export function resetMedia(): void {
  state.desktop = true;
  state.systemDark = false;
  lists.clear();
}
