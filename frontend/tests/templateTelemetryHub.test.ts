import assert from 'node:assert/strict';
import { TbWsTelemetryClient } from '../src/views/tb/map/tbWsTelemetry';
import {
  TemplateTelemetryHub,
  type EntityDataLatestSubscriptionOptions,
  type TemplateTelemetryClient,
} from '../src/views/tb/dashboard/runtime/widgets/aggregate/templateTelemetryHub';

const runtimeGlobal = globalThis as unknown as {
  window: typeof globalThis;
  location: { protocol: string; host: string };
  WebSocket: unknown;
};
runtimeGlobal.window = globalThis;
runtimeGlobal.location = { protocol: 'http:', host: 'localhost' };

class FakeWebSocket {
  static readonly OPEN = 1;
  static readonly CONNECTING = 0;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(message: string) {
    this.sent.push(message);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
runtimeGlobal.WebSocket = FakeWebSocket;

function testEntityDataProtocol() {
  const client = new TbWsTelemetryClient('token');
  const cmdId = client.subscribeEntityDataLatest({
    entityType: 'DEVICE',
    entityIds: ['b', 'a', 'a'],
    keys: ['power', 'electricityConsumption', 'power'],
    onData: () => undefined,
  });
  const socket = FakeWebSocket.instances.at(-1);
  assert.ok(socket);
  socket.readyState = FakeWebSocket.OPEN;
  socket.onopen?.();

  const subscriptionPayload = JSON.parse(socket.sent[1]!) as {
    cmds: Array<{
      type: string;
      query: {
        entityFilter: { type: string; entityType: string; entityList: string[] };
        pageLink: { pageSize: number };
        latestValues: Array<{ type: string; key: string }>;
      };
    }>;
  };
  const command = subscriptionPayload.cmds[0]!;
  assert.equal(command.type, 'ENTITY_DATA');
  assert.deepEqual(command.query.entityFilter.entityList, ['a', 'b']);
  assert.equal(command.query.pageLink.pageSize, 2);
  assert.deepEqual(
    command.query.latestValues.map((key) => key.key),
    ['electricityConsumption', 'power'],
  );

  client.unsubscribe(cmdId);
  const unsubscribePayload = JSON.parse(socket.sent.at(-1)!) as { cmds: Array<{ type: string; cmdId: number }> };
  assert.equal(unsubscribePayload.cmds[0]?.type, 'ENTITY_DATA_UNSUBSCRIBE');
  assert.equal(unsubscribePayload.cmds[0]?.cmdId, cmdId);
  client.close();
}

class FakeTelemetryClient implements TemplateTelemetryClient {
  private nextId = 0;
  readonly subscriptions = new Map<number, EntityDataLatestSubscriptionOptions>();
  readonly stateListeners = new Set<(connected: boolean) => void>();

  subscribeEntityDataLatest(options: EntityDataLatestSubscriptionOptions) {
    const id = ++this.nextId;
    this.subscriptions.set(id, options);
    return id;
  }

  unsubscribe(cmdId: number) {
    this.subscriptions.delete(cmdId);
  }

  onConnectionState(callback: (connected: boolean) => void) {
    this.stateListeners.add(callback);
    callback(true);
    return () => this.stateListeners.delete(callback);
  }
}

async function flushPlan() {
  await new Promise((resolve) => setTimeout(resolve, 5));
}

async function waitFor(predicate: () => boolean, timeoutMs = 1000) {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for asynchronous telemetry work');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function testHubDeduplication() {
  const client = new FakeTelemetryClient();
  const hub = new TemplateTelemetryHub(client, {
    planDebounceMs: 0,
    initialFallbackDelayMs: 100000,
  });
  const values: number[] = [];
  const requirement = {
    entityType: 'DEVICE' as const,
    entityIds: ['a'],
    keys: ['electricityConsumption'],
  };
  const first = hub.registerRequirement({ ...requirement, consumerId: 'first' }, (event) => {
    if (event.type === 'value') values.push(Number(event.latest.value));
  });
  const second = hub.registerRequirement({ ...requirement, consumerId: 'second' }, (event) => {
    if (event.type === 'value') values.push(Number(event.latest.value));
  });
  await flushPlan();

  assert.equal(client.subscriptions.size, 1);
  assert.equal(hub.getRequirementRefCount('DEVICE', 'a', 'electricityConsumption'), 2);
  client.subscriptions
    .values()
    .next()
    .value?.onData({
      errorCode: 0,
      data: {
        data: [
          {
            entityId: { entityType: 'DEVICE', id: 'a' },
            latest: { TIME_SERIES: { electricityConsumption: { ts: 10, value: '12.5' } } },
          },
        ],
      },
    });
  assert.deepEqual(values, [12.5, 12.5]);

  first.unregister();
  await flushPlan();
  assert.equal(client.subscriptions.size, 1);
  assert.equal(hub.getRequirementRefCount('DEVICE', 'a', 'electricityConsumption'), 1);
  second.unregister();
  await flushPlan();
  assert.equal(client.subscriptions.size, 0);
  hub.close();
}

async function testFallbackGroupsEntityTypes() {
  const client = new FakeTelemetryClient();
  const calls: Array<{ entityType: string; entityIds: string[]; keys: string[] }> = [];
  const hub = new TemplateTelemetryHub(client, {
    planDebounceMs: 0,
    initialFallbackDelayMs: 0,
    fallbackPollMs: 100000,
    loadLatestFallback: async (entityType, entityIds, keys) => {
      calls.push({ entityType, entityIds, keys });
      return [];
    },
  });
  const device = hub.registerRequirement(
    { consumerId: 'device', entityType: 'DEVICE', entityIds: ['device-a'], keys: ['power'] },
    () => undefined,
  );
  const asset = hub.registerRequirement(
    { consumerId: 'asset', entityType: 'ASSET', entityIds: ['asset-a'], keys: ['totalPower'] },
    () => undefined,
  );
  await waitFor(() => calls.length === 2);
  assert.deepEqual(
    calls.sort((left, right) => left.entityType.localeCompare(right.entityType)),
    [
      { entityType: 'ASSET', entityIds: ['asset-a'], keys: ['totalPower'] },
      { entityType: 'DEVICE', entityIds: ['device-a'], keys: ['power'] },
    ],
  );
  device.unregister();
  asset.unregister();
  hub.close();
}

testEntityDataProtocol();
await testHubDeduplication();
await testFallbackGroupsEntityTypes();
console.log('template telemetry hub tests passed');
