import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
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
  Tooltip,
  Modal,
  Typography,
  Tree,
  Timeline,
  Progress,
  Descriptions,
  Divider,
  Empty
} from 'antd';
import { 
  SearchOutlined,
  ReloadOutlined,
  NodeIndexOutlined,
  ClockCircleOutlined,
  BranchesOutlined,
  EyeOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  DatabaseOutlined,
  GlobalOutlined,
  ExpandOutlined,
  CompressOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';

const { Text, Title } = Typography;

// 链路追踪相关类型定义
interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  duration: number; // 毫秒
  status: 'success' | 'error' | 'timeout';
  tags: Record<string, string>;
  logs: SpanLog[];
  childSpans?: Span[];
}

interface SpanLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any>;
}

interface TraceData {
  traceId: string;
  startTime: number;
  duration: number;
  totalSpans: number;
  errorCount: number;
  services: string[];
  rootSpan: Span;
  spans: Span[];
}

const TraceAnalysis: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [traceId, setTraceId] = useState('');
  const [traceData, setTraceData] = useState<TraceData | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [spanDetailVisible, setSpanDetailVisible] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [viewMode, setViewMode] = useState<'tree' | 'timeline' | 'flamegraph'>('tree');

  // 模拟生成链路追踪数据
  const generateMockTrace = (traceId: string): TraceData => {
    const services = [
      'api-gateway',
      'user-service', 
      'order-service',
      'payment-service',
      'inventory-service',
      'notification-service',
      'auth-service',
      'analytics-service'
    ];

    const operations = [
      'GET /api/users/{id}',
      'POST /api/orders',
      'PUT /api/payments/process',
      'GET /api/inventory/check',
      'POST /api/notifications/send',
      'POST /api/auth/validate',
      'POST /api/analytics/track'
    ];

    let spanIdCounter = 1;
    const startTime = Date.now() - Math.random() * 3600000; // 最近1小时内
    
    const createSpan = (
      serviceName: string, 
      operationName: string, 
      parentSpanId?: string,
      depth = 0
    ): Span => {
      const spanId = `span-${spanIdCounter++}`;
      const duration = Math.random() * (depth === 0 ? 5000 : 1000) + 50; // 根span更慢
      const hasError = Math.random() < 0.1; // 10%的错误率
      
      const span: Span = {
        traceId,
        spanId,
        parentSpanId,
        serviceName,
        operationName,
        startTime: startTime + Math.random() * 1000,
        duration,
        status: hasError ? 'error' : (duration > 3000 ? 'timeout' : 'success'),
        tags: {
          'http.method': operationName.split(' ')[0] || 'GET',
          'http.url': operationName.split(' ')[1] || '/api/unknown',
          'http.status_code': hasError ? '500' : '200',
          'component': serviceName,
          'span.kind': depth === 0 ? 'server' : 'client'
        },
        logs: [
          {
            timestamp: startTime + 10,
            level: 'info',
            message: `Started ${operationName}`,
            fields: { event: 'start' }
          },
          ...(hasError ? [{
            timestamp: startTime + duration - 50,
            level: 'error' as const,
            message: 'Database connection failed',
            fields: { error: 'connection_timeout' }
          }] : []),
          {
            timestamp: startTime + duration,
            level: hasError ? 'error' as const : 'info' as const,
            message: `Completed ${operationName}`,
            fields: { event: 'finish' }
          }
        ]
      };

      // 递归创建子span
      if (depth < 3 && Math.random() < 0.7) {
        const childServices = services.filter(s => s !== serviceName);
        const childCount = Math.floor(Math.random() * 3) + 1;
        
        for (let i = 0; i < childCount && i < childServices.length; i++) {
          const childService = childServices[i];
          const childOperation = operations[Math.floor(Math.random() * operations.length)];
          const childSpan = createSpan(childService, childOperation, spanId, depth + 1);
          
          if (!span.childSpans) span.childSpans = [];
          span.childSpans.push(childSpan);
        }
      }

      return span;
    };

    const rootSpan = createSpan('api-gateway', 'GET /api/orders/123');
    
    // 收集所有spans
    const collectSpans = (span: Span): Span[] => {
      const spans = [span];
      if (span.childSpans) {
        span.childSpans.forEach(child => {
          spans.push(...collectSpans(child));
        });
      }
      return spans;
    };

    const allSpans = collectSpans(rootSpan);
    const errorCount = allSpans.filter(s => s.status === 'error').length;
    const uniqueServices = Array.from(new Set(allSpans.map(s => s.serviceName)));

    return {
      traceId,
      startTime: rootSpan.startTime,
      duration: rootSpan.duration,
      totalSpans: allSpans.length,
      errorCount,
      services: uniqueServices,
      rootSpan,
      spans: allSpans
    };
  };

  const searchTrace = async () => {
    if (!traceId.trim()) {
      message.warning('请输入TraceID');
      return;
    }

    setLoading(true);
    try {
      // 模拟API延迟
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockData = generateMockTrace(traceId.trim());
      setTraceData(mockData);
      
      // 默认展开所有节点
      const allKeys = mockData.spans.map(span => span.spanId);
      setExpandedKeys(allKeys);
      
      message.success('链路追踪数据加载成功');
    } catch (error) {
      message.error('查询失败');
      setTraceData(null);
    } finally {
      setLoading(false);
    }
  };

  const generateSampleTraceId = () => {
    const sampleId = `trace-${Math.random().toString(36).substring(2, 15)}`;
    setTraceId(sampleId);
  };

  const getStatusTag = (status: string) => {
    const configs: { [key: string]: { color: string; icon: React.ReactNode } } = {
      success: { color: 'success', icon: <CheckCircleOutlined /> },
      error: { color: 'error', icon: <CloseCircleOutlined /> },
      timeout: { color: 'warning', icon: <ClockCircleOutlined /> }
    };
    const config = configs[status] || { color: 'default', icon: null };
    return (
      <Tag color={config.color} icon={config.icon}>
        {status.toUpperCase()}
      </Tag>
    );
  };

  const getServiceIcon = (serviceName: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      'api-gateway': <ApiOutlined />,
      'user-service': <NodeIndexOutlined />,
      'order-service': <BranchesOutlined />,
      'payment-service': <ThunderboltOutlined />,
      'inventory-service': <DatabaseOutlined />,
      'notification-service': <GlobalOutlined />,
      'auth-service': <InfoCircleOutlined />,
      'analytics-service': <NodeIndexOutlined />
    };
    return iconMap[serviceName] || <NodeIndexOutlined />;
  };

  const showSpanDetail = (span: Span) => {
    setSelectedSpan(span);
    setSpanDetailVisible(true);
  };

  // 构建树形数据结构
  const buildTreeData = (span: Span): DataNode => {
    const duration = `${span.duration.toFixed(2)}ms`;
    const percentage = traceData ? ((span.duration / traceData.duration) * 100).toFixed(1) : '0';
    
    return {
      title: (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ marginRight: 8 }}>{getServiceIcon(span.serviceName)}</span>
            <span style={{ fontWeight: 'bold', marginRight: 8 }}>{span.serviceName}</span>
            <span style={{ color: '#666' }}>{span.operationName}</span>
            {getStatusTag(span.status)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Text type="secondary">{duration}</Text>
            <Text type="secondary">({percentage}%)</Text>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                showSpanDetail(span);
              }}
            >
              详情
            </Button>
          </div>
        </div>
      ),
      key: span.spanId,
      children: span.childSpans?.map(child => buildTreeData(child))
    };
  };

  // 渲染时间线视图
  const renderTimelineView = () => {
    if (!traceData) return null;

    const sortedSpans = [...traceData.spans].sort((a, b) => a.startTime - b.startTime);
    const traceStartTime = traceData.startTime;

    return (
      <Timeline mode="left">
        {sortedSpans.map(span => {
          const relativeStartTime = span.startTime - traceStartTime;
          return (
            <Timeline.Item
              key={span.spanId}
              color={span.status === 'error' ? 'red' : span.status === 'timeout' ? 'orange' : 'blue'}
              label={
                <div style={{ textAlign: 'right' }}>
                  <div>{relativeStartTime.toFixed(0)}ms</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    +{span.duration.toFixed(2)}ms
                  </div>
                </div>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {getServiceIcon(span.serviceName)}
                <strong>{span.serviceName}</strong>
                <span>{span.operationName}</span>
                {getStatusTag(span.status)}
                <Button
                  type="link"
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => showSpanDetail(span)}
                >
                  详情
                </Button>
              </div>
            </Timeline.Item>
          );
        })}
      </Timeline>
    );
  };

  // 渲染火焰图视图（简化版）
  const renderFlamegraphView = () => {
    if (!traceData) return null;

    const renderSpanBar = (span: Span, depth: number = 0) => {
      const width = (span.duration / traceData.duration) * 100;
      const color = span.status === 'error' ? '#ff4d4f' : 
                   span.status === 'timeout' ? '#faad14' : '#52c41a';
      
      return (
        <div key={span.spanId} style={{ marginLeft: depth * 20, marginBottom: 4 }}>
          <div
            style={{
              height: 24,
              backgroundColor: color,
              borderRadius: 4,
              width: `${Math.max(width, 5)}%`,
              display: 'flex',
              alignItems: 'center',
              padding: '0 8px',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'white'
            }}
            onClick={() => showSpanDetail(span)}
          >
            <Tooltip title={`${span.serviceName} - ${span.operationName} (${span.duration.toFixed(2)}ms)`}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {span.serviceName}: {span.operationName}
              </span>
            </Tooltip>
          </div>
          {span.childSpans?.map(child => renderSpanBar(child, depth + 1))}
        </div>
      );
    };

    return (
      <div style={{ padding: '16px', background: '#f5f5f5', borderRadius: 4 }}>
        <div style={{ marginBottom: 16, fontSize: '14px', fontWeight: 'bold' }}>
          链路火焰图 (总耗时: {traceData.duration.toFixed(2)}ms)
        </div>
        {renderSpanBar(traceData.rootSpan)}
      </div>
    );
  };

  return (
    <Card 
      title={
        <Space>
          <BranchesOutlined />
          链路追踪分析
        </Space>
      }
      extra={
        <Space>
          <Button onClick={generateSampleTraceId}>
            生成示例TraceID
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={searchTrace}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      {/* 搜索区域 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={16}>
          <Input.Search
            placeholder="请输入TraceID进行链路追踪查询"
            value={traceId}
            onChange={(e) => setTraceId(e.target.value)}
            onSearch={searchTrace}
            enterButton="查询链路"
            size="large"
            loading={loading}
          />
        </Col>
        <Col span={8}>
          <div style={{ fontSize: '12px', color: '#666', lineHeight: '32px' }}>
            提示: TraceID通常是一个长度为16-32位的十六进制字符串
          </div>
        </Col>
      </Row>

      {traceData ? (
        <>
          {/* 链路概览统计 */}
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col span={4}>
              <Statistic 
                title="总耗时" 
                value={traceData.duration.toFixed(2)} 
                suffix="ms"
                prefix={<ClockCircleOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic 
                title="Span总数" 
                value={traceData.totalSpans} 
                prefix={<NodeIndexOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic 
                title="错误数" 
                value={traceData.errorCount} 
                valueStyle={{ color: traceData.errorCount > 0 ? '#cf1322' : '#3f8600' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={4}>
              <Statistic 
                title="服务数" 
                value={traceData.services.length} 
                prefix={<ApiOutlined />}
              />
            </Col>
            <Col span={8}>
              <div style={{ padding: '8px 0' }}>
                <div style={{ fontSize: '14px', color: '#666', marginBottom: '4px' }}>涉及服务:</div>
                <Space wrap>
                  {traceData.services.map(service => (
                    <Tag key={service} color="blue">
                      {getServiceIcon(service)} {service}
                    </Tag>
                  ))}
                </Space>
              </div>
            </Col>
          </Row>

          {traceData.errorCount > 0 && (
            <Alert
              message="链路中发现错误"
              description={`检测到 ${traceData.errorCount} 个错误Span，请重点关注`}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 视图切换 */}
          <div style={{ marginBottom: 16 }}>
            <Space>
              <Button 
                type={viewMode === 'tree' ? 'primary' : 'default'}
                icon={<BranchesOutlined />}
                onClick={() => setViewMode('tree')}
              >
                树形视图
              </Button>
              <Button 
                type={viewMode === 'timeline' ? 'primary' : 'default'}
                icon={<ClockCircleOutlined />}
                onClick={() => setViewMode('timeline')}
              >
                时间线视图
              </Button>
              <Button 
                type={viewMode === 'flamegraph' ? 'primary' : 'default'}
                icon={<ThunderboltOutlined />}
                onClick={() => setViewMode('flamegraph')}
              >
                火焰图视图
              </Button>
              <Button
                icon={expandedKeys.length > 0 ? <CompressOutlined /> : <ExpandOutlined />}
                onClick={() => {
                  if (expandedKeys.length > 0) {
                    setExpandedKeys([]);
                  } else {
                    setExpandedKeys(traceData.spans.map(span => span.spanId));
                  }
                }}
              >
                {expandedKeys.length > 0 ? '折叠全部' : '展开全部'}
              </Button>
            </Space>
          </div>

          {/* 链路详情展示 */}
          <Card>
            {viewMode === 'tree' && (
              <Tree
                treeData={[buildTreeData(traceData.rootSpan)]}
                expandedKeys={expandedKeys}
                onExpand={setExpandedKeys}
                showLine={{ showLeafIcon: false }}
                defaultExpandAll
              />
            )}

            {viewMode === 'timeline' && renderTimelineView()}

            {viewMode === 'flamegraph' && renderFlamegraphView()}
          </Card>
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="请输入TraceID开始分析链路追踪"
        >
          <Button type="primary" onClick={generateSampleTraceId}>
            生成示例TraceID
          </Button>
        </Empty>
      )}

      {/* Span详情模态框 */}
      <Modal
        title={`Span详情 - ${selectedSpan?.serviceName}`}
        open={spanDetailVisible}
        onCancel={() => setSpanDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setSpanDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={900}
      >
        {selectedSpan && (
          <div>
            <Descriptions title="基本信息" bordered size="small">
              <Descriptions.Item label="SpanID">
                <Text code>{selectedSpan.spanId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="ParentSpanID">
                <Text code>{selectedSpan.parentSpanId || '无'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="TraceID">
                <Text code>{selectedSpan.traceId}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="服务名">
                {getServiceIcon(selectedSpan.serviceName)} {selectedSpan.serviceName}
              </Descriptions.Item>
              <Descriptions.Item label="操作名" span={2}>
                {selectedSpan.operationName}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(selectedSpan.status)}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(selectedSpan.startTime).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="耗时">
                {selectedSpan.duration.toFixed(2)}ms
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <div>
              <Title level={5}>标签 (Tags)</Title>
              <Row gutter={[8, 8]}>
                {Object.entries(selectedSpan.tags).map(([key, value]) => (
                  <Col key={key}>
                    <Tag>
                      <strong>{key}:</strong> {value}
                    </Tag>
                  </Col>
                ))}
              </Row>
            </div>

            {selectedSpan.logs.length > 0 && (
              <>
                <Divider />
                <div>
                  <Title level={5}>日志 (Logs)</Title>
                  <Timeline>
                    {selectedSpan.logs.map((log, index) => (
                      <Timeline.Item
                        key={index}
                        color={log.level === 'error' ? 'red' : log.level === 'warn' ? 'orange' : 'blue'}
                      >
                        <div>
                          <strong>{log.message}</strong>
                          <div style={{ fontSize: '12px', color: '#666' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </div>
                          {log.fields && (
                            <div style={{ marginTop: 4, fontSize: '12px' }}>
                              <Text code>{JSON.stringify(log.fields)}</Text>
                            </div>
                          )}
                        </div>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default TraceAnalysis;