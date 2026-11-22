import { describe, expect, it } from 'vitest';

import { loginPath, safeRedirect } from './safe-redirect';

describe('safeRedirect', () => {
  it.each([
    ['/conversations/abc', '/conversations/abc'],
    ['/a?b=c#d', '/a?b=c#d'],
  ])('keeps the same-origin path %s', (target, expected) => {
    expect(safeRedirect(target)).toBe(expected);
  });

  it.each([
    [null],
    [undefined],
    [''],
    ['https://evil.example'],
    ['//evil.example'],
    ['/\\evil.example'],
    ['javascript:alert(1)'],
    ['/login'],
    ['/login?redirect=/x'],
  ])('falls back to the home page for %s', (target) => {
    expect(safeRedirect(target)).toBe('/');
  });
});

describe('loginPath', () => {
  it('only adds a redirect when coming from another page than home', () => {
    expect(loginPath('/')).toBe('/login');
    expect(loginPath('/a?b=1')).toBe('/login?redirect=%2Fa%3Fb%3D1');
  });
});
