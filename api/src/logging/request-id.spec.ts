import { describe, expect, it } from 'vitest';

import { REQUEST_ID_HEADER, resolveRequestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('names the header X-Request-Id', () => {
    expect(REQUEST_ID_HEADER).toBe('X-Request-Id');
  });

  it.each([
    '3f2c9a1e-8d4b-4c5e-9a7f-1b2c3d4e5f60',
    'abc123',
    'req_2026.11.27-a',
    'A',
    'a'.repeat(64),
  ])('keeps a valid incoming id: %s', (id) => {
    expect(resolveRequestId(id)).toBe(id);
  });

  it('generates a UUID when there is no incoming id', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID);
  });

  it('generates a different id each time', () => {
    expect(resolveRequestId(undefined)).not.toBe(resolveRequestId(undefined));
  });

  it.each([
    ['empty', ''],
    ['too long (65 characters)', 'a'.repeat(65)],
    ['with a space', 'abc def'],
    ['with a line break', 'abc\r\nSet-Cookie: session=1'],
    ['with a quote', 'abc"def'],
    ['with a slash', 'abc/def'],
    ['with a non-ASCII character', 'abcé'],
    ['with markup', '<script>alert(1)</script>'],
    ['sent twice', ['abc', 'def']],
  ])('replaces an invalid incoming id (%s)', (_label, id) => {
    expect(resolveRequestId(id)).toMatch(UUID);
  });
});
