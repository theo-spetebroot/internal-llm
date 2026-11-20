/** Resolves after `ms`, or rejects with the signal's reason as soon as it is aborted. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return raceAbort(new Promise<void>((resolve) => setTimeout(resolve, ms).unref()), signal);
}

/**
 * Settles like `promise`, unless `signal` aborts first: then rejects with the abort reason.
 * Guarantees responsiveness even when the underlying work ignores the signal.
 */
export function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(toError(signal.reason));

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(toError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(toError(error));
      },
    );
  });
}

function toError(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}
