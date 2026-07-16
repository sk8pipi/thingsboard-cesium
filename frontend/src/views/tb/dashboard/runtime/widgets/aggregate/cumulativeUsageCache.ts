import type { UsageSummary } from './resourceUsage';

const DATABASE_NAME = 'tb-dashboard-usage-cache';
const DATABASE_VERSION = 1;
const STORE_NAME = 'usage-summaries';
const CACHE_VERSION = 1;
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type CachedUsageSummary = {
  key: string;
  version: number;
  savedAt: number;
  summary: UsageSummary;
};

let databasePromise: Promise<IDBDatabase | null> | null = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

function isUsageSummary(value: unknown): value is UsageSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Partial<UsageSummary>;
  return (
    typeof summary.today === 'number' &&
    typeof summary.month === 'number' &&
    typeof summary.updatedAt === 'number' &&
    Array.isArray(summary.trend24h) &&
    Array.isArray(summary.trend7d) &&
    Array.isArray(summary.deviceTodayValues) &&
    Array.isArray(summary.latestDeviceReadings)
  );
}

export async function readCumulativeUsageCache(key: string): Promise<UsageSummary | null> {
  try {
    const database = await openDatabase();
    if (!database) return null;
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    const cached = await new Promise<CachedUsageSummary | undefined>((resolve) => {
      request.onsuccess = () => resolve(request.result as CachedUsageSummary | undefined);
      request.onerror = () => resolve(undefined);
    });
    if (
      !cached ||
      cached.version !== CACHE_VERSION ||
      Date.now() - cached.savedAt > MAX_CACHE_AGE_MS ||
      !isUsageSummary(cached.summary)
    ) {
      return null;
    }
    return cached.summary;
  } catch {
    return null;
  }
}

export async function writeCumulativeUsageCache(key: string, summary: UsageSummary): Promise<void> {
  try {
    const database = await openDatabase();
    if (!database) return;
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key,
      version: CACHE_VERSION,
      savedAt: Date.now(),
      summary,
    } satisfies CachedUsageSummary);
    await new Promise<void>((resolve) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    });
  } catch {
    // Persisted cache is an optional acceleration path.
  }
}
