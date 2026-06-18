// E:\things\thingsboard-ui-vue3\src\views\tb\map\tbWsTelemetry.ts
type LatestCb = (payload: any) => void;

export class TbWsTelemetryClient {
  private ws: WebSocket | null = null;
  private token: string;
  private cmdId = 10;
  private opened = false;

  private pending: any[] = [];
  private subs = new Map<number, LatestCb>(); // cmdId/subscriptionId -> callback

  constructor(token: string) {
    this.token = token;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    const wsUrl = this.buildWsUrl();
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.opened = true;

      // 先鉴权
      this.send({
        authCmd: { cmdId: 0, token: this.token },
      });

      // 再发送积压命令
      if (this.pending.length) {
        this.pending.forEach((m) => this.send(m));
        this.pending = [];
      }
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        //console.log('[WS] recv', msg);

        // 兼容：有的返回 cmdId，有的返回 subscriptionId
        const id = Number(msg?.cmdId ?? msg?.subscriptionId);
        if (!Number.isFinite(id)) return;

        const cb = this.subs.get(id);
        if (!cb) return;
        cb(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.opened = false;
    };

    this.ws.onerror = () => {
      // ignore
    };
  }

  close() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.opened = false;
    this.pending = [];
    this.subs.clear();
  }

  unsubscribe(cmdId: number) {
    this.subs.delete(cmdId);
  }

  private send(obj: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    //console.log('[WS] send', obj);
    this.ws.send(JSON.stringify(obj));
  }

  private buildWsUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/api/ws`;
  }

  // -----------------------------
  // ✅ 你原来的最新值订阅（cmds）
  // -----------------------------
  subscribeLatest(opts: { entityType: string; entityId: string; keys: string[]; onData: LatestCb }): number {
    const cmdId = ++this.cmdId;
    this.subs.set(cmdId, opts.onData);

    const cmd = {
      cmds: [
        {
          entityType: String(opts.entityType).toUpperCase(),
          entityId: opts.entityId,
          scope: 'LATEST_TELEMETRY',
          type: 'TIMESERIES',
          keys: opts.keys.join(','),
          cmdId,
        },
      ],
    };

    if (this.opened) this.send(cmd);
    else this.pending.push(cmd);

    return cmdId;
  }

  // -------------------------------------------
  // ✅ 用 cmds 拉历史窗口（更兼容你当前 TB）
  // -------------------------------------------
  requestHistoryByCmds(opts: {
    entityType: string;
    entityId: string;
    keys: string[];
    startTs: number;
    endTs: number;
    interval?: number;
    limit?: number;
    agg?: 'NONE' | 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT';
    onData: LatestCb;
  }): number {
    const cmdId = ++this.cmdId;
    this.subs.set(cmdId, opts.onData);

    const c0: any = {
      cmdId,
      type: 'TIMESERIES',
      scope: 'LATEST_TELEMETRY',
      entityType: String(opts.entityType).toUpperCase(),
      entityId: opts.entityId,
      keys: opts.keys.join(','),
      startTs: opts.startTs,
      endTs: opts.endTs,
    };

    if (opts.interval != null) c0.interval = opts.interval;
    if (opts.limit != null) c0.limit = opts.limit;
    if (opts.agg != null) c0.agg = opts.agg;

    const cmd = { cmds: [c0] };

    if (this.opened) this.send(cmd);
    else this.pending.push(cmd);

    return cmdId;
  }

  // -------------------------------------------
  // ✅ 用 cmds 订阅窗口时序（timeWindow）
  // -------------------------------------------
  subscribeTimeseriesByCmds(opts: {
    entityType: string;
    entityId: string;
    keys: string[];
    timeWindowMs: number;
    interval?: number;
    limit?: number;
    agg?: 'NONE' | 'MIN' | 'MAX' | 'AVG' | 'SUM' | 'COUNT';
    onData: LatestCb;
  }): number {
    const cmdId = ++this.cmdId;
    this.subs.set(cmdId, opts.onData);

    const c0: any = {
      cmdId,
      type: 'TIMESERIES',
      scope: 'LATEST_TELEMETRY',
      entityType: String(opts.entityType).toUpperCase(),
      entityId: opts.entityId,
      keys: opts.keys.join(','),
      timeWindow: opts.timeWindowMs,
    };

    if (opts.interval != null) c0.interval = opts.interval;
    if (opts.limit != null) c0.limit = opts.limit;
    if (opts.agg != null) c0.agg = opts.agg;

    const cmd = { cmds: [c0] };

    if (this.opened) this.send(cmd);
    else this.pending.push(cmd);

    return cmdId;
  }
}
