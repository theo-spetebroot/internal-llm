import { randomUUID } from 'node:crypto';

/** Name of the header carrying the request id, in the request and in the response. */
export const REQUEST_ID_HEADER = 'X-Request-Id';

/**
 * What an incoming id may look like: letters, digits, dots, dashes and underscores, 1 to 64
 * characters. Enough for UUIDs and the ids of common proxies, and nothing a log reader or a
 * response header could be fooled by (spaces, line breaks, quotes…).
 */
const VALID_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The id of a request: the one the caller sent in `X-Request-Id` when it is valid, otherwise a
 * new UUID. The header is trusted only for its shape, never for what it says.
 */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  if (typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}
