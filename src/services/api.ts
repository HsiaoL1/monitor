import axios from 'axios';
import { ServiceInfo, StartServiceResponse, ServiceMetrics, ResourceHistoryResponse, ProxyReplaceLogEntry, AccountSyncLogEntry, Pipeline, Deployment, LogEntry, LogQuery, TraceData } from '../types';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  withCredentials: true, // 允许跨域请求携带cookie
});

export const login = async (username: string, password: string): Promise<{success: boolean, message?: string}> => {
  const response = await api.post('/login', { username, password });
  return response.data;
};

export const logout = async (): Promise<{success: boolean}> => {
  const response = await api.post('/logout');
  return response.data;
};

export const checkAuth = async (): Promise<{isAuthenticated: boolean, user?: any}> => {
  try {
    const response = await api.get('/check-auth');
    return response.data;
  } catch (error) {
    return { isAuthenticated: false };
  }
};


export const fetchSystemMetrics = async (): Promise<Record<string, ServiceMetrics>> => {
  try {
    const response = await api.get('/system-metrics');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch system metrics:', error);
    throw error;
  }
};

export const fetchResourceHistory = async (duration: number = 60): Promise<ResourceHistoryResponse> => {
  try {
    const response = await api.get('/system-metrics/history', {
      params: { duration } // duration in minutes
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch resource history:', error);
    throw error;
  }
};

export const getServiceStatus = async (serviceName: string): Promise<'running' | 'stopped' | 'unknown'> => {
  try {
    const response = await api.get('/service-status', {
      params: { serviceName }
    });
    return response.data.status;
  } catch (error: any) {
    console.error('Failed to get service status:', error);
    return 'unknown';
  }
};

export const startService = async (service: ServiceInfo): Promise<StartServiceResponse> => {
  try {
    const response = await api.post('/service/start', {
      serviceName: service.name,
      servicePath: service.path,
      deployScript: service.deployScript
    });
    
    // Return the full response data for better error handling
    return response.data;
  } catch (error: any) {
    console.error('Failed to start service:', error);
    if (error?.response?.data) {
      return error.response.data;
    }
    return { success: false, message: 'Network error' };
  }
};

export const stopService = async (serviceName: string): Promise<boolean> => {
  try {
    const response = await api.post('/service/stop', {
      serviceName
    });
    return response.data.success;
  } catch (error: any) {
    console.error('Failed to stop service:', error);
    return false;
  }
};

export const restartService = async (service: ServiceInfo): Promise<StartServiceResponse> => {
  try {
    const response = await api.post('/service/restart', {
      serviceName: service.name,
      servicePath: service.path,
      deployScript: service.deployScript
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Failed to restart service:', error);
    if (error?.response?.data) {
      return error.response.data;
    }
    return { success: false, message: 'Network error' };
  }
};

export const getAllServicesStatus = async (): Promise<Record<string, 'running' | 'stopped' | 'unknown'>> => {
  try {
    const response = await api.get('/services-status');
    return response.data;
  } catch (error: any) {
    console.error('Failed to get all services status:', error);
    return {};
  }
};

// 新的真实数据API
export const fetchRealLogs = async (serviceName: string, lines: number = 100) => {
  try {
    const response = await api.get(`/logs/${serviceName}`, {
      params: { lines }
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch real logs:', error);
    throw error;
  }
};

export const executeRealCommand = async (command: string, sessionId: string = 'default') => {
  try {
    const response = await api.post('/terminal/execute', {
      command,
      sessionId
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to execute real command:', error);
    throw error;
  }
};

export const fetchRealSystemInfo = async () => {
  try {
    const response = await api.get('/system/info');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch real system info:', error);
    throw error;
  }
};

// Redis异常用户监控API
export const fetchStaleUsers = async () => {
  try {
    const response = await api.get('/redis/stale-users');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch stale users:', error);
    throw error;
  }
};

export const cleanupStaleUsers = async () => {
  try {
    const response = await api.post('/redis/cleanup-stale-users');
    return response.data;
  } catch (error: any) {
    console.error('Failed to cleanup stale users:', error);
    throw error;
  }
};

// Account status monitoring APIs
export const fetchAccountMismatch = async () => {
  try {
    const response = await api.get('/account/status-mismatch');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch account mismatch:', error);
    throw error;
  }
};

export const syncAccountStatus = async (appUniqueIds?: string[], syncAll: boolean = false) => {
  try {
    const response = await api.post('/account/sync-status', {
      app_unique_ids: appUniqueIds || [],
      sync_all: syncAll
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to sync account status:', error);
    throw error;
  }
};

// Proxy monitoring APIs
export const fetchProxyStatus = async (useCache: boolean = true, forceRefresh: boolean = false) => {
  try {
    const params: any = {};
    if (!useCache) params.use_cache = 'false';
    if (forceRefresh) params.refresh = 'true';
    
    const response = await api.get('/proxy/status', { params });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch proxy status:', error);
    throw error;
  }
};

export const startAsyncProxyCheck = async () => {
  try {
    const response = await api.post('/proxy/check-async');
    return response.data;
  } catch (error: any) {
    console.error('Failed to start async proxy check:', error);
    throw error;
  }
};

export const getAsyncCheckStatus = async (taskId: string) => {
  try {
    const response = await api.get(`/proxy/check-status/${taskId}`);
    return response.data;
  } catch (error: any) {
    console.error('Failed to get async check status:', error);
    throw error;
  }
};

export const notifyMerchants = async (proxyIds?: number[], merchantIds?: number[], notifyAll: boolean = false) => {
  try {
    const response = await api.post('/proxy/notify', {
      proxy_ids: proxyIds || [],
      merchant_ids: merchantIds || [],
      notify_all: notifyAll
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to notify merchants:', error);
    throw error;
  }
};

export const findReplacementProxy = async (proxyId: number) => {
  try {
    const response = await api.post('/proxy/find-replacement', {
      proxy_id: proxyId
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to find replacement proxy:', error);
    throw error;
  }
};

export const replaceProxy = async (oldProxyId: number, newProxyId: number) => {
  try {
    const response = await api.post('/proxy/replace', {
      old_proxy_id: oldProxyId,
      new_proxy_id: newProxyId
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to replace proxy:', error);
    throw error;
  }
};

// Proxy auto-replace APIs
export const getAutoReplaceStatus = async () => {
  try {
    const response = await api.get('/proxy/auto-replace/status');
    return response.data;
  } catch (error: any) {
    console.error('Failed to get auto-replace status:', error);
    throw error;
  }
};

export const startAutoReplace = async () => {
  try {
    const response = await api.post('/proxy/auto-replace/start');
    return response.data;
  } catch (error: any) {
    console.error('Failed to start auto-replace task:', error);
    throw error;
  }
};

export const stopAutoReplace = async () => {
  try {
    const response = await api.post('/proxy/auto-replace/stop');
    return response.data;
  } catch (error: any) {
    console.error('Failed to stop auto-replace task:', error);
    throw error;
  }
};

// Proxy replace log APIs
export const fetchProxyReplaceLog = async (params?: { startDate?: string; endDate?: string }) => {
  try {
    const response = await api.get('/proxy/replace-log', { params });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch proxy replace log:', error);
    throw error;
  }
};

export const downloadReplaceLog = async (params?: { startDate?: string; endDate?: string }) => {
  try {
    const response = await api.get('/proxy/replace-log/download', { 
      params,
      responseType: 'blob' // 处理文件下载
    });
    
    // 从响应头获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'proxy_replace_log.json';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename=(.+)/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to download replace log:', error);
    throw error;
  }
};

// Account sync log APIs
export const fetchAccountSyncLog = async (params?: { startDate?: string; endDate?: string }) => {
  try {
    const response = await api.get('/account/sync-log', { params });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch account sync log:', error);
    throw error;
  }
};

export const downloadAccountSyncLog = async (params?: { startDate?: string; endDate?: string }) => {
  try {
    const response = await api.get('/account/sync-log/download', { 
      params,
      responseType: 'blob' // 处理文件下载
    });
    
    // 从响应头获取文件名
    const contentDisposition = response.headers['content-disposition'];
    let filename = 'account_sync_log.json';
    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename=(.+)/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }
    
    // 创建下载链接
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    
    return { success: true };
  } catch (error: any) {
    console.error('Failed to download account sync log:', error);
    throw error;
  }
};


// CI/CD management APIs
export const fetchPipelines = async () => {
  try {
    const response = await api.get('/cicd/pipelines');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch pipelines:', error);
    throw error;
  }
};

export const fetchPipelineDetails = async (pipelineId: string) => {
  try {
    const response = await api.get(`/cicd/pipelines/${pipelineId}`);
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch pipeline details:', error);
    throw error;
  }
};

export const triggerPipeline = async (service: string, branch: string = 'main') => {
  try {
    const response = await api.post('/cicd/pipelines/trigger', {
      service,
      branch
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to trigger pipeline:', error);
    throw error;
  }
};

export const cancelPipeline = async (pipelineId: string) => {
  try {
    const response = await api.post(`/cicd/pipelines/${pipelineId}/cancel`);
    return response.data;
  } catch (error: any) {
    console.error('Failed to cancel pipeline:', error);
    throw error;
  }
};

export const fetchDeployments = async () => {
  try {
    const response = await api.get('/cicd/deployments');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch deployments:', error);
    throw error;
  }
};

export const deployToEnvironment = async (service: string, version: string, environment: string) => {
  try {
    const response = await api.post('/cicd/deploy', {
      service,
      version,
      environment
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to deploy to environment:', error);
    throw error;
  }
};

// Log aggregation APIs
export const fetchLogs = async (query: LogQuery) => {
  try {
    const response = await api.post('/logs/query', query);
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch logs:', error);
    throw error;
  }
};

export const exportLogs = async (query: LogQuery, format: 'json' | 'csv' = 'json') => {
  try {
    const response = await api.post('/logs/export', {
      ...query,
      format
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to export logs:', error);
    throw error;
  }
};

export const fetchLogServices = async () => {
  try {
    const response = await api.get('/logs/services');
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch log services:', error);
    throw error;
  }
};

// Trace analysis APIs
export const fetchTraceData = async (traceId: string): Promise<TraceData> => {
  try {
    const response = await api.get(`/traces/${traceId}`);
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch trace data:', error);
    throw error;
  }
};

export const searchTraces = async (params: {
  services?: string[];
  timeRange?: [string, string];
  duration?: { min?: number; max?: number };
  status?: string;
  limit?: number;
}) => {
  try {
    const response = await api.get('/traces/search', { params });
    return response.data;
  } catch (error: any) {
    console.error('Failed to search traces:', error);
    throw error;
  }
};

export const fetchTraceMetrics = async (timeRange?: [string, string]) => {
  try {
    const response = await api.get('/traces/metrics', {
      params: timeRange ? { start: timeRange[0], end: timeRange[1] } : {}
    });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch trace metrics:', error);
    throw error;
  }
};

// Device monitoring APIs
export const fetchDeviceMonitoring = async (params: {
  page?: number;
  page_size?: number;
  dev_code?: string;
  device_type?: string;
  online_status?: string;
}) => {
  try {
    const response = await api.get('/device-monitoring', { params });
    return response.data;
  } catch (error: any) {
    console.error('Failed to fetch device monitoring data:', error);
    throw error;
  }
};

