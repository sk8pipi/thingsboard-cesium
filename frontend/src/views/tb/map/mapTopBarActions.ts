import { Authority } from '/@/enums/authorityEnum';
import type { MapTopBarActionConfig, MapTopBarActionType } from './mapTemplateConfig';

const AUTHENTICATED_AUTHORITIES: readonly Authority[] = [
  Authority.SYS_ADMIN,
  Authority.TENANT_ADMIN,
  Authority.CUSTOMER_USER,
];

export type MapTopBarActionHandler = () => void | Promise<void>;

export type MapTopBarActionHandlers = Partial<Record<MapTopBarActionType, MapTopBarActionHandler>>;

export type MapTopBarActionContext = {
  authority?: Authority | string | null;
  handlers?: MapTopBarActionHandlers;
  fullscreenTarget?: HTMLElement | null;
  fullscreenDocument?: Document;
};

export type MapTopBarActionResult = {
  type: MapTopBarActionType;
  status: 'executed' | 'forbidden' | 'unavailable';
  fullscreen?: boolean;
};

type MapTopBarActionDefinition = {
  authorities: readonly Authority[];
};

export const MAP_TOP_BAR_ACTION_REGISTRY: Record<MapTopBarActionType, MapTopBarActionDefinition> = {
  overview: {
    authorities: AUTHENTICATED_AUTHORITIES,
  },
  settings: {
    authorities: AUTHENTICATED_AUTHORITIES,
  },
  fullscreen: {
    authorities: AUTHENTICATED_AUTHORITIES,
  },
};

export function canUseMapTopBarAction(type: MapTopBarActionType, authority?: Authority | string | null): boolean {
  if (!authority) return false;
  return MAP_TOP_BAR_ACTION_REGISTRY[type].authorities.some((allowed) => allowed === String(authority));
}

export function getAvailableMapTopBarActions(
  actions: readonly MapTopBarActionConfig[],
  authority?: Authority | string | null,
): MapTopBarActionConfig[] {
  return actions
    .filter((action) => action.visible && canUseMapTopBarAction(action.type, authority))
    .slice()
    .sort((left, right) => left.order - right.order);
}

export async function executeMapTopBarAction(
  type: MapTopBarActionType,
  context: MapTopBarActionContext,
): Promise<MapTopBarActionResult> {
  if (!canUseMapTopBarAction(type, context.authority)) {
    return { type, status: 'forbidden' };
  }

  const handler = context.handlers?.[type];
  if (handler) {
    await handler();
    return { type, status: 'executed' };
  }

  if (type !== 'fullscreen') {
    return { type, status: 'unavailable' };
  }

  return toggleMapTopBarFullscreen(type, context);
}

async function toggleMapTopBarFullscreen(
  type: MapTopBarActionType,
  context: MapTopBarActionContext,
): Promise<MapTopBarActionResult> {
  const fullscreenDocument =
    context.fullscreenDocument ||
    context.fullscreenTarget?.ownerDocument ||
    (typeof document === 'undefined' ? undefined : document);
  const fullscreenTarget = context.fullscreenTarget || fullscreenDocument?.documentElement;

  if (!fullscreenDocument || !fullscreenTarget) {
    return { type, status: 'unavailable' };
  }

  if (fullscreenDocument.fullscreenElement) {
    if (typeof fullscreenDocument.exitFullscreen !== 'function') {
      return { type, status: 'unavailable' };
    }
    await fullscreenDocument.exitFullscreen();
  } else {
    if (typeof fullscreenTarget.requestFullscreen !== 'function') {
      return { type, status: 'unavailable' };
    }
    await fullscreenTarget.requestFullscreen();
  }

  return {
    type,
    status: 'executed',
    fullscreen: Boolean(fullscreenDocument.fullscreenElement),
  };
}
