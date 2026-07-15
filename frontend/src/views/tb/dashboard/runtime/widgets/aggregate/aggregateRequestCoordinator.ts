const DEFAULT_CONCURRENCY = 6;

let activeRequests = 0;
const requestQueue: Array<() => void> = [];

export async function runAggregateRequest<T>(request: () => Promise<T>): Promise<T> {
  if (activeRequests >= DEFAULT_CONCURRENCY) {
    await new Promise<void>((resolve) => requestQueue.push(resolve));
  }

  activeRequests += 1;
  try {
    return await request();
  } finally {
    activeRequests -= 1;
    requestQueue.shift()?.();
  }
}

export async function mapAggregateSettled<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<Array<PromiseSettledResult<R>>> {
  if (!items.length) return [];

  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]!, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }

  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency)));
  await Promise.all(Array.from({ length: workerCount }, consume));
  return results;
}
