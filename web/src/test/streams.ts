const encoder = new TextEncoder();

/** A byte stream delivering `chunks` one by one (strings are UTF-8 encoded). */
export function streamFrom(
  chunks: (string | Uint8Array<ArrayBuffer>)[],
): ReadableStream<Uint8Array<ArrayBuffer>> {
  const queue = chunks.map((chunk) => (typeof chunk === 'string' ? encoder.encode(chunk) : chunk));
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    pull(controller) {
      const next = queue.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
}

export async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}
