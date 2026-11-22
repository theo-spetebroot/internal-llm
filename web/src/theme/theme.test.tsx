import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setSystemDark } from '@/test/media';
import { renderApp } from '@/test/render';
import { backend } from '@/test/server';

import { THEME_STORAGE_KEY, readThemePreference, resolveTheme } from './theme';

const html = document.documentElement;

describe('theme helpers', () => {
  it('resolves "system" against the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('ignores an unknown stored value', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readThemePreference()).toBe('system');
  });
});

describe('theme selector', () => {
  beforeEach(() => {
    backend.loggedIn = true;
  });

  it('follows the system by default, live', async () => {
    setSystemDark(true);
    renderApp('/');
    await screen.findByRole('radiogroup', { name: 'Thème' });

    expect(screen.getByRole('radio', { name: 'Système' })).toBeChecked();
    expect(html).toHaveClass('dark');

    setSystemDark(false);
    expect(html).not.toHaveClass('dark');
  });

  it('applies and remembers an explicit choice', async () => {
    const { user } = renderApp('/');
    await screen.findByRole('radiogroup', { name: 'Thème' });

    await user.click(screen.getByRole('radio', { name: 'Sombre' }));
    expect(html).toHaveClass('dark');
    expect(html.style.colorScheme).toBe('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');

    // An explicit choice no longer follows the OS.
    setSystemDark(false);
    expect(html).toHaveClass('dark');

    await user.click(screen.getByRole('radio', { name: 'Clair' }));
    expect(html).not.toHaveClass('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('starts from the saved choice', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    renderApp('/');
    await screen.findByRole('radiogroup', { name: 'Thème' });

    expect(screen.getByRole('radio', { name: 'Sombre' })).toBeChecked();
    expect(html).toHaveClass('dark');
  });
});
