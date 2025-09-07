export interface ServiceInfo {
  name: string;
  path: string;
  deployScript: string;
  pprofUrl?: string;
  status: 'running' | 'stopped' | 'unknown';
}

export interface ServiceMetrics {
  serviceName: string;
  status: 'running' | 'stopped' | 'unknown';
  cpu: number;
  memory: number;
  processes: number;
  ports: string[];
  timestamp: number;
}

// 资源历史数据相关类型
export interface ResourceDataPoint {
  timestamp: number;
  timestampFormatted: string;
  cpu: number;
  memory: number;
}

export interface ServiceResourceHistory {
  serviceName: string;
  status: 'running' | 'stopped' | 'unknown';
  dataPoints: ResourceDataPoint[];
}

export interface ResourceHistoryResponse {
  services: Record<string, ServiceResourceHistory>;
  timeRange: {
    start: number;
    end: number;
    duration: number; // in minutes
  };
}

export interface PprofData {
  cpu?: number;
  memory?: number;
  goroutines?: number;
}

export interface ServerConfig {
  ip: string;
  username: string;
  password: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  logs?: string;
}

export interface StartServiceResponse extends ApiResponse {
  alreadyRunning?: boolean;
}

export interface LogLine {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TRACE';
  content: string;
  serviceName: string;
}

export interface LogViewerConfig {
  realTime: boolean;
  autoScroll: boolean;
  maxLines: number;
  levelFilter: string[];
  searchKeyword: string;
}

export interface TerminalSession {
  id: string;
  title: string;
  active: boolean;
  connected: boolean;
}

// Account monitoring types
export interface UserOnlineInfo {
  server: string;
  http_port: string;
  online: boolean;
  loginTime: number;
  loginTimeFormatted: string;
  heartbeatTime: number;
  heartbeatTimeFormatted: string;
  bdClientNo: string;
  platformId: string;
  thirdApp: string;
}

export interface SocialAccount {
  id: number;
  merchant_id: number;
  account: string;
  app_unique_id: string;
  account_status: number; // 0:禁用,1:启用
  platform_id: number;
  online_status: number; // 0:离线,1:在线,2上线中，3下线中
}

export interface AccountStatusMismatch {
  social_account: SocialAccount;
  redis_info: UserOnlineInfo;
  is_hb_time_out: boolean;
  redis_exists: boolean;
  status_match: boolean;
}

// Proxy monitoring types
export interface ProxyInfo {
  id: number;
  ip: string;
  port: string;
  account: string;
  password: string;
  protocol: string;
  proxy_type: string;
  status: number;
  merchant_id: number;
  custom_code: number;
  proxy_text: string;
}

export interface DeviceInfo {
  id: number;
  dev_code: string;
  dev_text: string;
  device_type: string; // "ai_box" or "cloud"
  is_online: number;
  merchant_id: number;
}

export interface ProxyStatus {
  proxy_info: ProxyInfo;
  is_available: boolean;
  response_time: number; // milliseconds
  error_message: string;
  test_url: string;
  using_devices: DeviceInfo[];
  device_count: number;
  check_time: string;
}

// Proxy replacement log types
export interface ProxyReplaceLogEntry {
  id?: number;
  replaceTime: string;
  oldProxy: {
    id: number;
    ip: string;
    port: string;
    merchant_id: number;
  };
  newProxy: {
    id: number;
    ip: string;
    port: string;
    merchant_id: number;
  };
  success: boolean;
  devicesCount: number;
  reason?: string;
  errorMessage?: string;
  operator?: string;
  operatorType: 'manual' | 'auto';
}

// Account sync log types
export interface AccountSyncLogEntry {
  id?: number;
  syncTime: string;
  accountInfo: {
    id: number;
    account: string;
    app_unique_id: string;
    merchant_id: number;
    platform_id: number;
  };
  syncType: 'single' | 'batch';
  success: boolean;
  accountsCount: number;
  reason?: string;
  errorMessage?: string;
  operator?: string;
  operatorType: 'manual' | 'auto';
  beforeStatus: number;
  afterStatus: number;
}

// CI/CD related types
export interface Pipeline {
  id: string;
  name: string;
  service: string;
  branch: string;
  status: 'running' | 'success' | 'failed' | 'pending' | 'cancelled';
  progress: number;
  startTime: string;
  duration: string;
  commitId: string;
  commitMessage: string;
  author: string;
  stages: PipelineStage[];
}

export interface PipelineStage {
  name: string;
  status: 'running' | 'success' | 'failed' | 'pending' | 'skipped';
  startTime?: string;
  duration?: string;
  logs?: string;
}

export interface Deployment {
  id: string;
  service: string;
  version: string;
  environment: 'dev' | 'staging' | 'prod';
  status: 'deploying' | 'deployed' | 'failed' | 'rolled-back';
  deployTime: string;
  deployedBy: string;
}

// Log aggregation types
export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  service: string;
  message: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  stackTrace?: string;
}

export interface LogQuery {
  services: string[];
  levels: string[];
  keywords: string;
  timeRange: [string, string] | null;
  traceId?: string;
  userId?: string;
  limit: number;
}

// Trace analysis types  
export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  duration: number;
  status: 'success' | 'error' | 'timeout';
  tags: Record<string, string>;
  logs: SpanLog[];
  childSpans?: Span[];
}

export interface SpanLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

export interface TraceData {
  traceId: string;
  startTime: number;
  duration: number;
  totalSpans: number;
  errorCount: number;
  services: string[];
  rootSpan: Span;
  spans: Span[];
}