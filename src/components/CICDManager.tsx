import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  message, 
  Tag, 
  Modal, 
  Row, 
  Col,
  Statistic,
  Alert,
  Input,
  Select,
  Timeline,
  Progress,
  Descriptions,
  Tabs,
  Badge,
  Tooltip
} from 'antd';
import { 
  RocketOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  BranchesOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  SettingOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SearchOutlined,
  HistoryOutlined
} from '@ant-design/icons';

const { TabPane } = Tabs;

// Mock data types
interface Pipeline {
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

interface PipelineStage {
  name: string;
  status: 'running' | 'success' | 'failed' | 'pending' | 'skipped';
  startTime?: string;
  duration?: string;
  logs?: string;
}

interface Deployment {
  id: string;
  service: string;
  version: string;
  environment: 'dev' | 'staging' | 'prod';
  status: 'deploying' | 'deployed' | 'failed' | 'rolled-back';
  deployTime: string;
  deployedBy: string;
}

const CICDManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('pipelines');
  const [pipelineData, setPipelineData] = useState<Pipeline[]>([]);
  const [deploymentData, setDeploymentData] = useState<Deployment[]>([]);
  const [selectedPipeline, setSelectedPipeline] = useState<Pipeline | null>(null);
  const [pipelineDetailVisible, setPipelineDetailVisible] = useState(false);
  
  // 搜索和筛选状态
  const [searchService, setSearchService] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Mock data
  useEffect(() => {
    const mockPipelines: Pipeline[] = [
      {
        id: 'pipe-001',
        name: 'user-service-build',
        service: 'user-service',
        branch: 'main',
        status: 'running',
        progress: 65,
        startTime: '2024-01-15 14:30:00',
        duration: '5m 23s',
        commitId: 'a1b2c3d',
        commitMessage: 'feat: add user authentication',
        author: 'developer',
        stages: [
          { name: 'Code Checkout', status: 'success', startTime: '14:30:00', duration: '12s' },
          { name: 'Build', status: 'success', startTime: '14:30:12', duration: '2m 15s' },
          { name: 'Test', status: 'running', startTime: '14:32:27', duration: '1m 30s' },
          { name: 'Package', status: 'pending' },
          { name: 'Deploy', status: 'pending' }
        ]
      },
      {
        id: 'pipe-002',
        name: 'api-gateway-build',
        service: 'api-gateway',
        branch: 'develop',
        status: 'success',
        progress: 100,
        startTime: '2024-01-15 14:25:00',
        duration: '4m 45s',
        commitId: 'e4f5g6h',
        commitMessage: 'fix: rate limiting issue',
        author: 'developer2',
        stages: [
          { name: 'Code Checkout', status: 'success', startTime: '14:25:00', duration: '8s' },
          { name: 'Build', status: 'success', startTime: '14:25:08', duration: '1m 45s' },
          { name: 'Test', status: 'success', startTime: '14:26:53', duration: '2m 15s' },
          { name: 'Package', status: 'success', startTime: '14:29:08', duration: '25s' },
          { name: 'Deploy', status: 'success', startTime: '14:29:33', duration: '12s' }
        ]
      },
      {
        id: 'pipe-003',
        name: 'order-service-build',
        service: 'order-service',
        branch: 'feature/payment',
        status: 'failed',
        progress: 30,
        startTime: '2024-01-15 14:20:00',
        duration: '2m 18s',
        commitId: 'i7j8k9l',
        commitMessage: 'feat: implement payment integration',
        author: 'developer3',
        stages: [
          { name: 'Code Checkout', status: 'success', startTime: '14:20:00', duration: '10s' },
          { name: 'Build', status: 'failed', startTime: '14:20:10', duration: '2m 08s' },
          { name: 'Test', status: 'skipped' },
          { name: 'Package', status: 'skipped' },
          { name: 'Deploy', status: 'skipped' }
        ]
      }
    ];

    const mockDeployments: Deployment[] = [
      {
        id: 'deploy-001',
        service: 'user-service',
        version: 'v1.2.3',
        environment: 'prod',
        status: 'deployed',
        deployTime: '2024-01-15 14:00:00',
        deployedBy: 'admin'
      },
      {
        id: 'deploy-002',
        service: 'api-gateway',
        version: 'v2.1.0',
        environment: 'staging',
        status: 'deploying',
        deployTime: '2024-01-15 14:30:00',
        deployedBy: 'developer'
      },
      {
        id: 'deploy-003',
        service: 'order-service',
        version: 'v1.1.5',
        environment: 'dev',
        status: 'failed',
        deployTime: '2024-01-15 13:45:00',
        deployedBy: 'developer2'
      }
    ];

    setPipelineData(mockPipelines);
    setDeploymentData(mockDeployments);
  }, []);

  const getStatusTag = (status: string, isDeployment = false) => {
    const configs: { [key: string]: { color: string; icon: React.ReactNode; text: string } } = isDeployment ? {
      deploying: { color: 'processing', icon: <ClockCircleOutlined />, text: '部署中' },
      deployed: { color: 'success', icon: <CheckCircleOutlined />, text: '已部署' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
      'rolled-back': { color: 'warning', icon: <HistoryOutlined />, text: '已回滚' }
    } : {
      running: { color: 'processing', icon: <PlayCircleOutlined />, text: '运行中' },
      success: { color: 'success', icon: <CheckCircleOutlined />, text: '成功' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '等待中' },
      cancelled: { color: 'warning', icon: <PauseCircleOutlined />, text: '已取消' }
    };
    
    const config = configs[status] || { color: 'default', icon: null, text: status };
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  const getEnvironmentTag = (env: string) => {
    const configs: { [key: string]: { color: string; text: string } } = {
      dev: { color: 'blue', text: '开发环境' },
      staging: { color: 'orange', text: '测试环境' },
      prod: { color: 'red', text: '生产环境' }
    };
    const config = configs[env] || { color: 'default', text: env };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  const showPipelineDetail = (pipeline: Pipeline) => {
    setSelectedPipeline(pipeline);
    setPipelineDetailVisible(true);
  };

  // 过滤数据
  const filteredPipelines = useMemo(() => {
    return pipelineData.filter(item => {
      const serviceMatch = !searchService || item.service.toLowerCase().includes(searchService.toLowerCase());
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      return serviceMatch && statusMatch;
    });
  }, [pipelineData, searchService, statusFilter]);

  const pipelineColumns = [
    {
      title: '流水线名称',
      key: 'name',
      width: 200,
      render: (record: Pipeline) => (
        <div>
          <div><strong>{record.name}</strong></div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            <BranchesOutlined /> {record.branch}
          </div>
        </div>
      ),
    },
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
      width: 120,
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (record: Pipeline) => (
        <div>
          {getStatusTag(record.status)}
          {record.status === 'running' && (
            <div style={{ marginTop: 4 }}>
              <Progress percent={record.progress} size="small" />
            </div>
          )}
        </div>
      ),
    },
    {
      title: '提交信息',
      key: 'commit',
      width: 300,
      render: (record: Pipeline) => (
        <div>
          <div>{record.commitMessage}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            <CodeOutlined /> {record.commitId} · {record.author}
          </div>
        </div>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 150,
    },
    {
      title: '持续时间',
      dataIndex: 'duration',
      key: 'duration',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (record: Pipeline) => (
        <Space>
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => showPipelineDetail(record)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  const deploymentColumns = [
    {
      title: '服务',
      dataIndex: 'service',
      key: 'service',
      width: 150,
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
    },
    {
      title: '环境',
      key: 'environment',
      width: 120,
      render: (record: Deployment) => getEnvironmentTag(record.environment),
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (record: Deployment) => getStatusTag(record.status, true),
    },
    {
      title: '部署时间',
      dataIndex: 'deployTime',
      key: 'deployTime',
      width: 150,
    },
    {
      title: '部署者',
      dataIndex: 'deployedBy',
      key: 'deployedBy',
      width: 100,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (record: Deployment) => (
        <Space>
          <Button type="link" size="small">日志</Button>
          {record.status === 'deployed' && (
            <Button type="link" size="small" danger>回滚</Button>
          )}
        </Space>
      ),
    },
  ];

  const renderPipelineStages = (stages: PipelineStage[]) => {
    return (
      <Timeline>
        {stages.map((stage, index) => (
          <Timeline.Item
            key={index}
            color={stage.status === 'success' ? 'green' : 
                   stage.status === 'failed' ? 'red' :
                   stage.status === 'running' ? 'blue' :
                   stage.status === 'skipped' ? 'gray' : 'gray'}
            dot={stage.status === 'running' ? <ClockCircleOutlined className="timeline-clock-icon" /> : null}
          >
            <div>
              <strong>{stage.name}</strong>
              <span style={{ marginLeft: 8 }}>
                {getStatusTag(stage.status)}
              </span>
            </div>
            {stage.startTime && (
              <div style={{ color: '#888', fontSize: '12px' }}>
                开始时间: {stage.startTime}
                {stage.duration && ` · 耗时: ${stage.duration}`}
              </div>
            )}
          </Timeline.Item>
        ))}
      </Timeline>
    );
  };

  const runningPipelines = pipelineData.filter(p => p.status === 'running').length;
  const successPipelines = pipelineData.filter(p => p.status === 'success').length;
  const failedPipelines = pipelineData.filter(p => p.status === 'failed').length;

  return (
    <Card 
      title={
        <Space>
          <RocketOutlined />
          CI/CD 管理
        </Space>
      }
      extra={
        <Space>
          <Button icon={<SettingOutlined />}>配置</Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => setLoading(!loading)}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<><RocketOutlined />流水线</>} key="pipelines">
          {/* 搜索控件 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>按服务搜索:</label>
                  <Input
                    placeholder="输入服务名称"
                    prefix={<SearchOutlined />}
                    value={searchService}
                    onChange={(e) => {
                      setSearchService(e.target.value);
                      setCurrentPage(1);
                    }}
                    allowClear
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>状态筛选:</label>
                  <Select
                    style={{ width: '100%' }}
                    value={statusFilter}
                    onChange={(value) => {
                      setStatusFilter(value);
                      setCurrentPage(1);
                    }}
                  >
                    <Select.Option value="all">全部状态</Select.Option>
                    <Select.Option value="running">运行中</Select.Option>
                    <Select.Option value="success">成功</Select.Option>
                    <Select.Option value="failed">失败</Select.Option>
                    <Select.Option value="pending">等待中</Select.Option>
                  </Select>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>当前显示:</label>
                  <div style={{ 
                    padding: '6px 12px', 
                    background: '#f5f5f5', 
                    borderRadius: '6px',
                    textAlign: 'center' 
                  }}>
                    <strong>{filteredPipelines.length}</strong> 个流水线
                  </div>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>&nbsp;</label>
                  <Button 
                    onClick={() => {
                      setSearchService('');
                      setStatusFilter('all');
                      setCurrentPage(1);
                    }} 
                    style={{ width: '100%' }}
                  >
                    重置筛选
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* 统计信息 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic 
                title="总流水线" 
                value={pipelineData.length} 
                prefix={<RocketOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="运行中" 
                value={runningPipelines} 
                valueStyle={{ color: '#1890ff' }}
                prefix={<PlayCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="成功" 
                value={successPipelines} 
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="失败" 
                value={failedPipelines} 
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
          </Row>

          {runningPipelines > 0 && (
            <Alert
              message="有正在运行的流水线"
              description={`当前有 ${runningPipelines} 个流水线正在执行中`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            columns={pipelineColumns}
            dataSource={filteredPipelines}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredPipelines.length,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条，共 ${total} 个流水线`,
              onChange: (page, size) => {
                setCurrentPage(page);
                if (size !== pageSize) {
                  setPageSize(size);
                  setCurrentPage(1);
                }
              },
            }}
          />
        </TabPane>

        <TabPane tab={<><DeploymentUnitOutlined />部署记录</>} key="deployments">
          <Table
            columns={deploymentColumns}
            dataSource={deploymentData}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条，共 ${total} 条部署记录`,
            }}
          />
        </TabPane>
      </Tabs>

      {/* 流水线详情模态框 */}
      <Modal
        title={`流水线详情 - ${selectedPipeline?.name}`}
        open={pipelineDetailVisible}
        onCancel={() => setPipelineDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPipelineDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedPipeline && (
          <div>
            <Descriptions title="基本信息" bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="流水线名称">
                {selectedPipeline.name}
              </Descriptions.Item>
              <Descriptions.Item label="服务">
                {selectedPipeline.service}
              </Descriptions.Item>
              <Descriptions.Item label="分支">
                <BranchesOutlined /> {selectedPipeline.branch}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(selectedPipeline.status)}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {selectedPipeline.startTime}
              </Descriptions.Item>
              <Descriptions.Item label="持续时间">
                {selectedPipeline.duration}
              </Descriptions.Item>
              <Descriptions.Item label="提交ID" span={2}>
                <CodeOutlined /> {selectedPipeline.commitId}
              </Descriptions.Item>
              <Descriptions.Item label="提交信息" span={2}>
                {selectedPipeline.commitMessage}
              </Descriptions.Item>
              <Descriptions.Item label="作者">
                {selectedPipeline.author}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ marginTop: 16 }}>
              <h4>执行阶段</h4>
              {renderPipelineStages(selectedPipeline.stages)}
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default CICDManager;