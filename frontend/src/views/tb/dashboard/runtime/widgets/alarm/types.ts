export type AlarmSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING' | 'INDETERMINATE' | string;

export type AlarmStatus = 'ACTIVE_UNACK' | 'ACTIVE_ACK' | 'CLEARED_UNACK' | 'CLEARED_ACK' | string;

export interface AlarmOriginator {
  id: string;
  entityType: string;
  name?: string;
  label?: string;
}

export interface AlarmItem {
  id: string;
  name: string;
  type: string;
  severity: AlarmSeverity;
  status: AlarmStatus;
  createdTime: number;
  startTs?: number;
  endTs?: number;
  ackTs?: number;
  clearTs?: number;
  originator?: AlarmOriginator;
  details?: Record<string, any>;
  raw?: any;
}

export interface AlarmPage {
  data: AlarmItem[];
  totalPages: number;
  totalElements: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface AlarmQuery {
  page: number;
  pageSize: number;
  searchText?: string;
  sortProperty?: string;
  sortOrder?: 'ASC' | 'DESC';
  startTime?: number;
  endTime?: number;
  statusList?: string[];
  severityList?: string[];
  entityId?: string;
  entityType?: string;
  fetchMode?: 'entity' | 'all';
}

export interface AlarmWidgetSettings {
  pageSize: number;
  showSearch: boolean;
  showPagination: boolean;
  showAck: boolean;
  showClear: boolean;
  showOriginator: boolean;
  showSeverity: boolean;
  showStatus: boolean;
  showType: boolean;
  showCreatedTime: boolean;
  dense: boolean;
  columns: string[];
  title?: string;
  defaultStatusList?: string[];
  defaultSeverityList?: string[];
}

export interface AlarmWidgetContext {
  widget?: any;
  datasource?: any;
  ctx?: any;
  timewindow?: {
    startTs?: number;
    endTs?: number;
  };
}

export interface AlarmActionContext {
  item: AlarmItem;
  widget?: any;
  datasource?: any;
  ctx?: any;
}
