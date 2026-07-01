type TelemetryCallback = (payload: any) => void;

type SubscriptionRecord = {
  command: Record<string, any>;
  onData: TelemetryCallback;
  resubscribe: boolean;
};

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 15000;

/** One ThingsBoard telemetry connection shared by all widgets on a page. */
export class TbWsTelemetryClient {
  private ws: WebSocket | null = null;
  private cmdId = 10;
  private opened = false;
  private manuallyClosed = false;
  private reconnectDelayMs = RECONNECT_MIN_MS;
  private reconnectTimer?: number;
  private readonly subscriptions = new Map<number, SubscriptionRecord>();

  private readonly getToken: () => string;

  constructor(tokenOrProvider: string | (() => string)) {
    this.getToken = typeof tokenOrProvider === 'function' ? tokenOrProvider : () => tokenOrProvider;
  }

  connect() {
    this.manuallyClosed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    this.clearReconnectTimer();
    const socket = new WebSocket(this.buildWsUrl());
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) return;
      this.opened = true;
      this.reconnectDelayMs = RECONNECT_MIN_MS;
      this.sendRaw({ authCmd: { cmdId: 0, token: this.getToken() } });
      this.subscriptions.forEach((subscription) => {
        if (subscription.resubscribe) this.sendCommand(subscription.command);
      });
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const id = Number(message?.cmdId ?? message?.subscriptionId);
        if (!Number.isFinite(id)) return;

        const subscription = this.subscriptions.get(id);
        if (!subscription) return;
        subscription.onData(message);
        if (!subscription.resubscribe) this.subscriptions.delete(id);
      } catch (error) {
        console.warn('[TbWsTelemetryClient] Failed to process telemetry message:', error);
      }
    };

    socket.onclose = () => {
      if (this.ws !== socket) return;
      this.ws = null;
      this.opened = false;
      if (!this.manuallyClosed && this.hasActiveSubscriptions()) this.scheduleReconnect();
    };

    socket.onerror = () => {
      if (this.ws === socket) socket.close();
    };
  }

  close() {
    this.manuallyClosed = true;
    this.clearReconnectTimer();
    this.subscriptions.clear();
    this.opened = false;
    const socket = this.ws;
    this.ws = null;
    try {
      socket?.close();
    } catch {}
  }

  unsubscribe(cmdId: number) {
    const subscription = this.subscriptions.get(cmdId);
    if (!subscription) return;
    if (subscription.resubscribe && this.opened) {
      this.sendCommand({ ...subscription.command, unsubscribe: true });
    }
    this.subscriptions.delete(cmdId);
  }

  subscribeLatest(opts: { entityType: string; entityId: string; keys: string[]; onData: TelemetryCallback }): number {
    return this.register(
      {
        entityType: String(opts.entityType).toUpperCase(),
        entityId: opts.entityId,
        scope: 'LATEST_TELEMETRY',
        type: 'TIMESERIES',
        keys: opts.keys.join(','),
      },
      opts.onData,
      true,
    );
  }

  requestHistoryByCmds(opts: {
    entityType: string;
    entityId: string;
    keys: string[];
    startTs: number;
    endTs: number;
    interval?: number;
    limit?: number;
    agg?: 'NONE' | 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT';
    onData: TelemetryCallback;
  }): number {
    return this.register(
      this.withQueryOptions(
        {
          type: 'TIMESERIES',
          scope: 'LATEST_TELEMETRY',
          entityType: String(opts.entityType).toUpperCase(),
          entityId: opts.entityId,
          keys: opts.keys.join(','),
          startTs: opts.startTs,
          endTs: opts.endTs,
        },
        opts,
      ),
      opts.onData,
      false,
    );
  }

  subscribeTimeseriesByCmds(opts: {
    entityType: string;
    entityId: string;
    keys: string[];
    timeWindowMs: number;
    interval?: number;
    limit?: number;
    agg?: 'NONE' | 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT';
    onData: TelemetryCallback;
  }): number {
    return this.register(
      this.withQueryOptions(
        {
          type: 'TIMESERIES',
          scope: 'LATEST_TELEMETRY',
          entityType: String(opts.entityType).toUpperCase(),
          entityId: opts.entityId,
          keys: opts.keys.join(','),
          timeWindow: opts.timeWindowMs,
        },
        opts,
      ),
      opts.onData,
      true,
    );
  }

  private register(commandWithoutId: Record<string, any>, onData: TelemetryCallback, resubscribe: boolean): number {
    const cmdId = ++this.cmdId;
    const command = { ...commandWithoutId, cmdId };
    this.subscriptions.set(cmdId, { command, onData, resubscribe });
    if (this.opened) this.sendCommand(command);
    else this.connect();
    return cmdId;
  }

  private withQueryOptions(command: Record<string, any>, opts: Record<string, any>) {
    if (opts.interval != null) command.interval = opts.interval;
    if (opts.limit != null) command.limit = opts.limit;
    if (opts.agg != null) command.agg = opts.agg;
    return command;
  }

  private sendCommand(command: Record<string, any>) {
    const currentCommand =
      Number(command.timeWindow) > 0 ? { ...command, startTs: Date.now() - Number(command.timeWindow) } : command;
    this.sendRaw({ cmds: [currentCommand] });
  }

  private sendRaw(message: Record<string, any>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private hasActiveSubscriptions() {
    return Array.from(this.subscriptions.values()).some((subscription) => subscription.resubscribe);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.manuallyClosed) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, RECONNECT_MAX_MS);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (!this.reconnectTimer) return;
    window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
  }

  private buildWsUrl() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/api/ws`;
  }
}
