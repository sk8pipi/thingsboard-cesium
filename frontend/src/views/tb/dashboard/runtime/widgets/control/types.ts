export type ControlMode = 'rpc' | 'shared-attribute' | 'client-attribute';

export type ControlValueType = 'boolean' | 'number' | 'string' | 'enum' | 'json';

export interface ControlWidgetSettings {
  title?: string;

  // 控制目标
  targetDeviceId?: string;

  // 控制方式
  mode: ControlMode;

  // 当前状态来源
  stateSource?: 'telemetry' | 'attribute';
  stateKey: string;

  // 值类型
  valueType?: ControlValueType;

  // boolean 控制映射
  onValue?: any;
  offValue?: any;

  // RPC 配置
  rpcMethod?: string;
  rpcTimeout?: number;
  rpcParamsTemplate?: any;

  // UI 配置
  trueLabel?: string;
  falseLabel?: string;
  successMessage?: string;
  failureMessage?: string;
}

export interface WidgetDatasourceLike {
  entityId?: string;
  entityName?: string;
  entityType?: string;
  data?: Record<string, any>;
}
