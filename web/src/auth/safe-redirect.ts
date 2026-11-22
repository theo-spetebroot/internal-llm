/**
 * Where to go after logging in. Only same-origin paths are accepted, so that a crafted
 * `?redirect=` link cannot send the user to another site (open redirect).
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target?.startsWith('/')) return fallback;
  // "//host" and "/\host" are protocol-relative URLs in browsers.
  if (target.startsWith('//') || target.startsWith('/\\')) return fallback;
  if (target === '/login' || target.startsWith('/login?')) return fallback;
  return target;
}

/** Login URL that brings the user back to `path` once authenticated. */
export function loginPath(path: string): string {
  return path === '/' ? '/login' : `/login?redirect=${encodeURIComponent(path)}`;
}
