import { Suspense, lazy } from 'react';

import { PageHeader } from '@/layout/PageHeader';

// The usage page (and what it draws) is only needed when it is opened: keep it out of the main
// bundle.
const UsagePage = lazy(() =>
  import('./UsagePage').then((module) => ({ default: module.UsagePage })),
);

/** The usage page, with its header already in place while the code loads. */
export function LazyUsagePage() {
  return (
    <Suspense
      fallback={
        <>
          <title>Usage · internal-llm</title>
          <PageHeader title="Usage" />
          <p role="status" className="sr-only">
            Chargement de la page…
          </p>
        </>
      }
    >
      <UsagePage />
    </Suspense>
  );
}
