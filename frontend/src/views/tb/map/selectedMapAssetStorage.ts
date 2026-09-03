const SELECTED_MAP_ASSET_PREFIX = 'tb.selectedMapAsset';

function normalizeStorageSegment(value: string | undefined, fallback: string) {
  const normalized = String(value || '').trim();
  return normalized ? encodeURIComponent(normalized) : fallback;
}

export interface MapAssetSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): MapAssetSelectionStorage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

export function getSelectedMapAssetStorageKey(userId?: string, dashboardId?: string) {
  const userSegment = normalizeStorageSegment(userId, 'anonymous');
  const dashboardSegment = normalizeStorageSegment(dashboardId, 'map-home');
  return `${SELECTED_MAP_ASSET_PREFIX}.${userSegment}.${dashboardSegment}`;
}

export function loadSelectedMapAssetId(userId?: string, dashboardId?: string, storage = getDefaultStorage()) {
  try {
    return storage?.getItem(getSelectedMapAssetStorageKey(userId, dashboardId))?.trim() || '';
  } catch {
    return '';
  }
}

export function saveSelectedMapAssetId(
  userId: string | undefined,
  dashboardId: string | undefined,
  assetId: string,
  storage = getDefaultStorage(),
) {
  const normalizedAssetId = String(assetId || '').trim();
  if (!normalizedAssetId) return;

  try {
    storage?.setItem(getSelectedMapAssetStorageKey(userId, dashboardId), normalizedAssetId);
  } catch {}
}

export function clearSelectedMapAssetId(userId?: string, dashboardId?: string, storage = getDefaultStorage()) {
  try {
    storage?.removeItem(getSelectedMapAssetStorageKey(userId, dashboardId));
  } catch {}
}
