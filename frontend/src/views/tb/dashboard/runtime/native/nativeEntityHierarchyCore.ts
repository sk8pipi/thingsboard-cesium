import type { EntityRelationInfo } from '/@/api/tb/relation';
import type { NativeEntityHierarchySettings, NativeSource } from './nativeWidgetTypes';

export interface NativeHierarchyNode {
  key: string;
  id: string;
  type: string;
  name: string;
  depth: number;
  path: string[];
}

export function nativeHierarchyRoot(source: NativeSource): NativeHierarchyNode {
  const identity = `${source.entityType}:${source.entityId}`;
  return {
    key: identity,
    id: source.entityId,
    type: source.entityType,
    name: source.name || source.entityId,
    depth: 0,
    path: [identity],
  };
}

export function nativeHierarchyChildren(
  parent: NativeHierarchyNode,
  relations: EntityRelationInfo[],
  settings: NativeEntityHierarchySettings,
): NativeHierarchyNode[] {
  const endpoint = settings.direction === 'FROM' ? 'to' : 'from';
  const label = settings.direction === 'FROM' ? 'toName' : 'fromName';
  const seen = new Set<string>();
  const children = relations.flatMap((relation) => {
    if (relation.type !== settings.relationType) return [];
    const entity = relation[endpoint];
    const id = entity?.id;
    const type = entity?.entityType;
    if (!id || !type) return [];
    const identity = `${type}:${id}`;
    if (parent.path.includes(identity) || seen.has(identity)) return [];
    seen.add(identity);
    return [
      {
        key: `${parent.key}/${identity}`,
        id,
        type,
        name: relation[label] || id,
        depth: parent.depth + 1,
        path: [...parent.path, identity],
      },
    ];
  });
  if (settings.sortByName) children.sort((left, right) => left.name.localeCompare(right.name));
  return children;
}

export function nativeHierarchyVisible(
  root: NativeHierarchyNode,
  children: Record<string, NativeHierarchyNode[]>,
  expanded: Record<string, boolean>,
): NativeHierarchyNode[] {
  const rows: NativeHierarchyNode[] = [];
  const walk = (node: NativeHierarchyNode) => {
    rows.push(node);
    if (expanded[node.key]) for (const child of children[node.key] || []) walk(child);
  };
  walk(root);
  return rows;
}
