export type MapWidgetFullscreenDomSession = {
  widgetId: string;
  content: HTMLElement;
  host: HTMLElement;
  originParent: Node;
  originNextSibling: Node | null;
  triggerElement: HTMLElement | null;
  restored: boolean;
};

export type MoveMapWidgetToFullscreenOptions = {
  widgetId: string;
  content: HTMLElement;
  host: HTMLElement;
  triggerElement?: HTMLElement | null;
};

/**
 * Moves the existing widget DOM into the fullscreen host without recreating its
 * Vue application. GridStack keeps the empty item in place, so x/y/w/h remain
 * untouched and the same content can be restored exactly where it came from.
 */
export function moveMapWidgetToFullscreen(options: MoveMapWidgetToFullscreenOptions): MapWidgetFullscreenDomSession {
  const originParent = options.content.parentNode;
  if (!originParent) {
    throw new Error('Map widget content has no origin parent.');
  }

  const session: MapWidgetFullscreenDomSession = {
    widgetId: options.widgetId,
    content: options.content,
    host: options.host,
    originParent,
    originNextSibling: options.content.nextSibling,
    triggerElement: options.triggerElement || null,
    restored: false,
  };

  options.host.appendChild(options.content);
  return session;
}

/** Restores a fullscreen widget idempotently, even if siblings changed meanwhile. */
export function restoreMapWidgetFromFullscreen(session: MapWidgetFullscreenDomSession): boolean {
  if (session.restored) return false;

  const reference =
    session.originNextSibling && session.originNextSibling.parentNode === session.originParent
      ? session.originNextSibling
      : null;
  session.originParent.insertBefore(session.content, reference);
  session.restored = true;
  return true;
}
