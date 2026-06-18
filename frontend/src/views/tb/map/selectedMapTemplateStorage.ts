const SELECTED_MAP_TEMPLATE_PREFIX = 'tb.selectedMapTemplate';

export function getSelectedMapTemplateStorageKey(userId?: string) {
  return `${SELECTED_MAP_TEMPLATE_PREFIX}.${userId || 'anonymous'}`;
}

export function loadSelectedMapTemplateId(userId?: string) {
  try {
    return localStorage.getItem(getSelectedMapTemplateStorageKey(userId)) || '';
  } catch {
    return '';
  }
}

export function saveSelectedMapTemplateId(userId: string | undefined, dashboardId: string) {
  if (!dashboardId) return;

  try {
    localStorage.setItem(getSelectedMapTemplateStorageKey(userId), dashboardId);
  } catch {}
}

export function clearSelectedMapTemplateId(userId?: string) {
  try {
    localStorage.removeItem(getSelectedMapTemplateStorageKey(userId));
  } catch {}
}
