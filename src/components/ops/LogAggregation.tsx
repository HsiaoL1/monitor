import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  message, 
  Tag, 
  Row, 
  Col,
  Statistic,
  Alert,
  Input,
  Select,
  DatePicker,
  Checkbox,
  Tooltip,
  Modal,
  Typography,
  Collapse,
  Switch,
  Spin,
  Badge
} from 'antd';
import { 
  SearchOutlined,
  FilterOutlined,
  DownloadOutlined,
  ReloadOutlined,
  BugOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  StopOutlined,
  PlayCircleOutlined,
  EyeOutlined,
  SettingOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ClearOutlined,
  FullscreenOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { TextArea } = Input;
const { Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface LogEntry {
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

interface LogQuery {
  services: string[];
  levels: string[];
  keywords: string;
  timeRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  traceId?: string;
  userId?: string;
  limit: number;
}

const LogAggregation: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [logDetailVisible, setLogDetailVisible] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [realTimeMode, setRealTimeMode] = useState(false);
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);
  
  // 查询参数状态
  const [query, setQuery] = useState<LogQuery>({
    services: [],
    levels: [],
    keywords: '',
    timeRange: [dayjs().subtract(1, 'hour'), dayjs()],
    limit: 1000
  });

  // 分页状态
  const [pageSize, setPageSize] = useState<number>(50);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // 服务列表 - 对应八个服务
  const services = [
    'user-service',
    'order-service', 
    'payment-service',
    'inventory-service',
    'notification-service',
    'api-gateway',
    'auth-service',
    'analytics-service'
  ];

  const logLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

  // 生成模拟日志数据
  const generateMockLogs = (): LogEntry[] => {
    const mockLogs: LogEntry[] = [];
    const messages = [
      'User login successful',
      'Order created successfully',
      'Payment processing failed',
      'Database connection timeout',
      'Invalid authentication token',
      'Service health check passed',
      'Rate limit exceeded for user',
      'Cache miss for key user:profile',
      'External API call failed',
      'Memory usage threshold exceeded'
    ];

    for (let i = 0; i < 200; i++) {
      const service = services[Math.floor(Math.random() * services.length)];
      const level = logLevels[Math.floor(Math.random() * logLevels.length)];
      const message = messages[Math.floor(Math.random() * messages.length)];
      const timestamp = dayjs().subtract(Math.random() * 3600, 'second').format('YYYY-MM-DD HH:mm:ss.SSS');
      const traceId = Math.random() > 0.3 ? `trace-${Math.random().toString(36).substring(2, 15)}` : undefined;
      const spanId = traceId ? `span-${Math.random().toString(36).substring(2, 10)}` : undefined;

      mockLogs.push({
        id: `log-${i}`,
        timestamp,
        level: level as any,
        service,
        message: `${message} - ${service}`,
        traceId,
        spanId,
        userId: Math.random() > 0.5 ? `user-${Math.floor(Math.random() * 1000)}` : undefined,
        requestId: `req-${Math.random().toString(36).substring(2, 15)}`,
        metadata: {
          ip: `192.168.1.${Math.floor(Math.random() * 254) + 1}`,
          userAgent: 'Mozilla/5.0 (compatible; API Client)',
          responseTime: Math.floor(Math.random() * 1000)
        },
        stackTrace: level === 'ERROR' ? 'java.lang.RuntimeException: Sample error\n\tat com.example.Service.method(Service.java:42)' : undefined
      });
    }

    return mockLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  // 搜索日志
  const searchLogs = async () => {
    setLoading(true);
    try {
      // 模拟API延迟
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 生成模拟数据并应用筛选
      const mockLogs = generateMockLogs();
      let filteredLogs = mockLogs;

      // 应用筛选条件
      if (query.services.length > 0) {
        filteredLogs = filteredLogs.filter(log => query.services.includes(log.service));
      }

      if (query.levels.length > 0) {
        filteredLogs = filteredLogs.filter(log => query.levels.includes(log.level));
      }

      if (query.keywords.trim()) {
        const keywords = query.keywords.toLowerCase();
        filteredLogs = filteredLogs.filter(log => 
          log.message.toLowerCase().includes(keywords) ||
          log.service.toLowerCase().includes(keywords) ||
          (log.traceId && log.traceId.toLowerCase().includes(keywords))
        );
      }

      if (query.traceId) {
        filteredLogs = filteredLogs.filter(log => log.traceId === query.traceId);
      }

      if (query.timeRange && query.timeRange[0] && query.timeRange[1]) {
        const [start, end] = query.timeRange;
        filteredLogs = filteredLogs.filter(log => {
          const logTime = dayjs(log.timestamp);
          return logTime.isAfter(start) && logTime.isBefore(end);
        });
      }

      // 应用数量限制
      filteredLogs = filteredLogs.slice(0, query.limit);

      setLogs(filteredLogs);
      setCurrentPage(1);
      message.success(`找到 ${filteredLogs.length} 条日志记录`);
    } catch (error) {
      message.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  // 自动刷新
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => {
        searchLogs();
      }, 10000); // 10秒刷新一次
      
      return () => {
        if (autoRefreshRef.current) {
          clearInterval(autoRefreshRef.current);
        }
      };
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current);
    }
  }, [autoRefresh, query]);

  // 初始化加载
  useEffect(() => {
    searchLogs();
  }, []);

  const getLevelTag = (level: string) => {
    const configs: { [key: string]: { color: string; icon: React.ReactNode } } = {
      DEBUG: { color: 'default', icon: <BugOutlined /> },
      INFO: { color: 'blue', icon: <InfoCircleOutlined /> },
      WARN: { color: 'orange', icon: <WarningOutlined /> },
      ERROR: { color: 'red', icon: <StopOutlined /> },
      FATAL: { color: 'red', icon: <StopOutlined /> }
    };
    const config = configs[level] || { color: 'default', icon: null };
    return (
      <Tag color={config.color} icon={config.icon}>
        {level}
      </Tag>
    );
  };

  const showLogDetail = (log: LogEntry) => {
    setSelectedLog(log);
    setLogDetailVisible(true);
  };

  const exportLogs = () => {
    const dataStr = JSON.stringify(logs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `logs_export_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('日志导出成功');
  };

  const resetQuery = () => {
    setQuery({
      services: [],
      levels: [],
      keywords: '',
      timeRange: [dayjs().subtract(1, 'hour'), dayjs()],
      limit: 1000
    });
    setCurrentPage(1);
  };

  const columns = [
    {
      title: '时间',
      key: 'timestamp',
      width: 180,
      render: (record: LogEntry) => (
        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
          {dayjs(record.timestamp).format('MM-DD HH:mm:ss.SSS')}
        </div>
      ),
    },
    {
      title: '级别',
      key: 'level',
      width: 80,
      render: (record: LogEntry) => getLevelTag(record.level),
    },
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
      width: 120,
      render: (service: string) => (
        <Tag color="geekblue">{service}</Tag>
      ),
    },
    {
      title: '消息',
      key: 'message',
      render: (record: LogEntry) => (
        <div>
          <div style={{ wordBreak: 'break-word' }}>
            {record.message}
          </div>
          {record.traceId && (
            <div style={{ fontSize: '12px', color: '#888', marginTop: 4 }}>
              <Text code>TraceID: {record.traceId}</Text>
              {record.spanId && <Text code style={{ marginLeft: 8 }}>SpanID: {record.spanId}</Text>}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (record: LogEntry) => (
        <Button 
          type="link" 
          size="small" 
          icon={<EyeOutlined />}
          onClick={() => showLogDetail(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  const levelCounts = useMemo(() => {
    const counts = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    logs.forEach(log => {
      counts[log.level]++;
    });
    return counts;
  }, [logs]);

  const serviceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach(log => {
      counts[log.service] = (counts[log.service] || 0) + 1;
    });
    return counts;
  }, [logs]);

  return (
    <Card 
      title={
        <Space>
          <FileTextOutlined />
          日志聚合查询
          {realTimeMode && (
            <Badge status="processing" text="实时模式" />
          )}
        </Space>
      }
      extra={
        <Space>
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren="自动刷新"
            unCheckedChildren="手动刷新"
          />
          <Button icon={<DownloadOutlined />} onClick={exportLogs}>
            导出
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={searchLogs}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      {/* 查询条件 */}
      <Collapse defaultActiveKey={['query']} style={{ marginBottom: 16 }}>
        <Panel header="查询条件" key="query" extra={<FilterOutlined />}>
          <Row gutter={[16, 16]}>
            <Col span={24}>
              <Row gutter={16}>
                <Col span={6}>
                  <label>服务选择:</label>
                  <Select
                    mode="multiple"
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="选择服务（空表示全部）"
                    value={query.services}
                    onChange={(services) => setQuery({ ...query, services })}
                    allowClear
                  >
                    {services.map(service => (
                      <Select.Option key={service} value={service}>
                        {service}
                      </Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col span={6}>
                  <label>日志级别:</label>
                  <Select
                    mode="multiple"
                    style={{ width: '100%', marginTop: 4 }}
                    placeholder="选择级别（空表示全部）"
                    value={query.levels}
                    onChange={(levels) => setQuery({ ...query, levels })}
                    allowClear
                  >
                    {logLevels.map(level => (
                      <Select.Option key={level} value={level}>
                        {getLevelTag(level)}
                      </Select.Option>
                    ))}
                  </Select>
                </Col>
                <Col span={6}>
                  <label>时间范围:</label>
                  <RangePicker
                    style={{ width: '100%', marginTop: 4 }}
                    showTime={{ format: 'HH:mm:ss' }}
                    format="YYYY-MM-DD HH:mm:ss"
                    value={query.timeRange}
                    onChange={(timeRange) => setQuery({ ...query, timeRange })}
                  />
                </Col>
                <Col span={6}>
                  <label>数量限制:</label>
                  <Select
                    style={{ width: '100%', marginTop: 4 }}
                    value={query.limit}
                    onChange={(limit) => setQuery({ ...query, limit })}
                  >
                    <Select.Option value={100}>最近100条</Select.Option>
                    <Select.Option value={500}>最近500条</Select.Option>
                    <Select.Option value={1000}>最近1000条</Select.Option>
                    <Select.Option value={5000}>最近5000条</Select.Option>
                  </Select>
                </Col>
              </Row>
            </Col>
            <Col span={24}>
              <Row gutter={16}>
                <Col span={8}>
                  <label>关键词搜索:</label>
                  <Input
                    style={{ marginTop: 4 }}
                    placeholder="搜索消息内容、服务名或TraceID"
                    prefix={<SearchOutlined />}
                    value={query.keywords}
                    onChange={(e) => setQuery({ ...query, keywords: e.target.value })}
                    onPressEnter={searchLogs}
                    allowClear
                  />
                </Col>
                <Col span={8}>
                  <label>TraceID过滤:</label>
                  <Input
                    style={{ marginTop: 4 }}
                    placeholder="输入TraceID进行精确过滤"
                    value={query.traceId}
                    onChange={(e) => setQuery({ ...query, traceId: e.target.value })}
                    allowClear
                  />
                </Col>
                <Col span={8}>
                  <label>&nbsp;</label>
                  <div style={{ marginTop: 4 }}>
                    <Space>
                      <Button type="primary" icon={<SearchOutlined />} onClick={searchLogs} loading={loading}>
                        查询
                      </Button>
                      <Button icon={<ClearOutlined />} onClick={resetQuery}>
                        重置
                      </Button>
                    </Space>
                  </div>
                </Col>
              </Row>
            </Col>
          </Row>
        </Panel>
      </Collapse>

      {/* 统计信息 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Statistic 
            title="总日志数" 
            value={logs.length} 
            prefix={<FileTextOutlined />}
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="ERROR" 
            value={levelCounts.ERROR} 
            valueStyle={{ color: '#cf1322' }}
            prefix={<StopOutlined />}
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="WARN" 
            value={levelCounts.WARN} 
            valueStyle={{ color: '#d46b08' }}
            prefix={<WarningOutlined />}
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="INFO" 
            value={levelCounts.INFO} 
            valueStyle={{ color: '#1890ff' }}
            prefix={<InfoCircleOutlined />}
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="DEBUG" 
            value={levelCounts.DEBUG} 
            valueStyle={{ color: '#52c41a' }}
            prefix={<BugOutlined />}
          />
        </Col>
        <Col span={4}>
          <Statistic 
            title="服务数" 
            value={Object.keys(serviceCounts).length} 
            prefix={<SettingOutlined />}
          />
        </Col>
      </Row>

      {levelCounts.ERROR > 0 && (
        <Alert
          message="发现错误日志"
          description={`检测到 ${levelCounts.ERROR} 条 ERROR 级别日志，建议及时处理`}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 日志表格 */}
      <Table
        columns={columns}
        dataSource={logs}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 1000 }}
        rowClassName={(record) => {
          if (record.level === 'ERROR' || record.level === 'FATAL') return 'error-row';
          if (record.level === 'WARN') return 'warn-row';
          return '';
        }}
        pagination={{
          current: currentPage,
          pageSize: pageSize,
          total: logs.length,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          showTotal: (total, range) => 
            `第 ${range[0]}-${range[1]} 条，共 ${total} 条日志`,
          onChange: (page, size) => {
            setCurrentPage(page);
            if (size !== pageSize) {
              setPageSize(size);
              setCurrentPage(1);
            }
          },
        }}
      />

      {/* 日志详情模态框 */}
      <Modal
        title="日志详情"
        open={logDetailVisible}
        onCancel={() => setLogDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setLogDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={900}
      >
        {selectedLog && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <strong>时间:</strong> {selectedLog.timestamp}
              </Col>
              <Col span={12}>
                <strong>级别:</strong> {getLevelTag(selectedLog.level)}
              </Col>
            </Row>
            <Row gutter={16} style={{ marginTop: 8 }}>
              <Col span={12}>
                <strong>服务:</strong> <Tag color="geekblue">{selectedLog.service}</Tag>
              </Col>
              <Col span={12}>
                <strong>请求ID:</strong> <Text code>{selectedLog.requestId}</Text>
              </Col>
            </Row>
            
            {selectedLog.traceId && (
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={12}>
                  <strong>TraceID:</strong> <Text code>{selectedLog.traceId}</Text>
                </Col>
                <Col span={12}>
                  <strong>SpanID:</strong> <Text code>{selectedLog.spanId}</Text>
                </Col>
              </Row>
            )}

            {selectedLog.userId && (
              <Row gutter={16} style={{ marginTop: 8 }}>
                <Col span={24}>
                  <strong>用户ID:</strong> <Text code>{selectedLog.userId}</Text>
                </Col>
              </Row>
            )}

            <div style={{ marginTop: 16 }}>
              <strong>消息:</strong>
              <div style={{ 
                background: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '4px', 
                marginTop: '4px',
                fontFamily: 'monospace',
                wordBreak: 'break-word'
              }}>
                {selectedLog.message}
              </div>
            </div>

            {selectedLog.metadata && (
              <div style={{ marginTop: 16 }}>
                <strong>元数据:</strong>
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: '12px', 
                  borderRadius: '4px', 
                  marginTop: '4px'
                }}>
                  <pre>{JSON.stringify(selectedLog.metadata, null, 2)}</pre>
                </div>
              </div>
            )}

            {selectedLog.stackTrace && (
              <div style={{ marginTop: 16 }}>
                <strong>堆栈跟踪:</strong>
                <div style={{ 
                  background: '#fff2f0', 
                  padding: '12px', 
                  borderRadius: '4px', 
                  marginTop: '4px',
                  border: '1px solid #ffccc7',
                  fontFamily: 'monospace'
                }}>
                  <pre style={{ margin: 0 }}>{selectedLog.stackTrace}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      
    </Card>
  );
};

export default LogAggregation;