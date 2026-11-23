import { Suspense, lazy } from 'react';

// Markdown parsing is only needed once a conversation is open: keep it out of the main bundle.
const Markdown = lazy(() => import('./Markdown').then((module) => ({ default: module.Markdown })));

/** Markdown answer, shown as plain text until the renderer has loaded. */
export function LazyMarkdown({ children }: { children: string }) {
  return (
    <Suspense fallback={<div className="whitespace-pre-wrap">{children}</div>}>
      <Markdown>{children}</Markdown>
    </Suspense>
  );
}
