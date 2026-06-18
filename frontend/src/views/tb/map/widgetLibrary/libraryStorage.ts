import type { CustomWidgetDefinition } from './types';

const KEY = 'tb_cesium_widget_library_v1';

function nowTs() {
  return Date.now();
}

function normalizeWidget(def: any): CustomWidgetDefinition | null {
  if (!def || typeof def !== 'object') return null;

  const normalized: CustomWidgetDefinition = {
    id: String(def.id || `widget-${nowTs()}`),
    name: String(def.name || '未命名部件'),
    source: (def.source || 'thingsboard') as CustomWidgetDefinition['source'],
    kind: (def.kind || 'unknown') as CustomWidgetDefinition['kind'],
    createdAt: Number(def.createdAt || nowTs()),
    defaultConfig: def.defaultConfig && typeof def.defaultConfig === 'object' ? def.defaultConfig : {},
    typeFullFqn: def.typeFullFqn || undefined,
    localWidgetKey: def.localWidgetKey || undefined,
    raw: def.raw ?? def.tb?.raw ?? undefined,
    tb: def.tb
      ? {
          bundleAlias: def.tb.bundleAlias,
          widgetTypeAlias: def.tb.widgetTypeAlias,
          raw: def.tb.raw,
        }
      : def.raw
        ? {
            raw: def.raw,
          }
        : undefined,
  };

  return normalized;
}

function dedupKey(def: CustomWidgetDefinition) {
  return `${def.typeFullFqn || ''}__${def.name || ''}__${def.kind || ''}`;
}

export function loadWidgetLibrary(): CustomWidgetDefinition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];

    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    const normalized = arr.map((item) => normalizeWidget(item)).filter(Boolean) as CustomWidgetDefinition[];

    normalized.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return normalized;
  } catch {
    return [];
  }
}

export function saveWidgetLibrary(defs: CustomWidgetDefinition[]) {
  const normalized = defs.map((item) => normalizeWidget(item)).filter(Boolean) as CustomWidgetDefinition[];

  const dedupById = new Map<string, CustomWidgetDefinition>();
  for (const item of normalized) {
    dedupById.set(item.id, item);
  }

  const dedupByMeaning = new Map<string, CustomWidgetDefinition>();
  for (const item of dedupById.values()) {
    dedupByMeaning.set(dedupKey(item), item);
  }

  const finalDefs = Array.from(dedupByMeaning.values()).sort(
    (a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0),
  );

  localStorage.setItem(KEY, JSON.stringify(finalDefs));
}

export function upsertWidget(def: CustomWidgetDefinition) {
  const incoming = normalizeWidget(def);
  if (!incoming) return;

  const defs = loadWidgetLibrary();

  let idx = defs.findIndex((x) => x.id === incoming.id);

  if (idx < 0) {
    const incomingMeaning = dedupKey(incoming);
    idx = defs.findIndex((x) => dedupKey(x) === incomingMeaning);
  }

  if (idx >= 0) {
    defs[idx] = {
      ...defs[idx],
      ...incoming,
      createdAt: defs[idx].createdAt || incoming.createdAt || nowTs(),
      defaultConfig: {
        ...(defs[idx].defaultConfig || {}),
        ...(incoming.defaultConfig || {}),
      },
      raw: incoming.raw ?? defs[idx].raw,
      tb: incoming.tb ?? defs[idx].tb,
    };
  } else {
    defs.unshift({
      ...incoming,
      createdAt: incoming.createdAt || nowTs(),
    });
  }

  saveWidgetLibrary(defs);
}

export function removeWidget(defId: string) {
  const defs = loadWidgetLibrary().filter((x) => x.id !== defId);
  saveWidgetLibrary(defs);
}

export function clearWidgetLibrary() {
  localStorage.removeItem(KEY);
}
