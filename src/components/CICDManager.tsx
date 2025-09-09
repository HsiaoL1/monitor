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
  Descriptions,
  Tabs,
  Form,
  Badge
} from 'antd';
import { 
  RocketOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  CodeOutlined,
  DeploymentUnitOutlined,
  SearchOutlined,
  HistoryOutlined,
  CloudUploadOutlined,
  ArrowUpOutlined,
  PauseCircleOutlined
} from '@ant-design/icons';
import api from '../services/api';

const { TabPane } = Tabs;

// API data types matching backend models
interface Deployment {
  id: number;
  serviceName: string;
  environment: 'test' | 'production';
  version: string;
  commitHash: string;
  commitMessage?: string;
  branch: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'rollback' | 'cancelled';
  startTime: string;
  endTime?: string;
  duration?: number;
  deployedBy: string;
  buildLog?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface ServiceEnvironment {
  id: number;
  serviceName: string;
  environment: 'test' | 'production';
  currentVersion?: string;
  currentCommit?: string;
  deploymentId?: number;
  lastDeployedAt?: string;
  isHealthy: boolean;
  createdAt: string;
  updatedAt: string;
}

const CICDManager: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('deployments');
  const [deploymentData, setDeploymentData] = useState<Deployment[]>([]);
  const [serviceEnvironments, setServiceEnvironments] = useState<ServiceEnvironment[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<Deployment | null>(null);
  const [deploymentDetailVisible, setDeploymentDetailVisible] = useState(false);
  const [deployModalVisible, setDeployModalVisible] = useState(false);
  const [promoteModalVisible, setPromoteModalVisible] = useState(false);
  const [form] = Form.useForm();
  
  // 搜索和筛选状态
  const [searchService, setSearchService] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('all');

  // Load data from API
  const loadData = async () => {
    setLoading(true);
    try {
      // Load deployment history
      const deploymentRes = await api.get('/api/cicd/deployments?limit=100');
      setDeploymentData(deploymentRes.data.deployments || []);
      
      // Load service environments
      const envRes = await api.get('/api/cicd/environments');
      setServiceEnvironments(envRes.data.environments || []);
      
    } catch (error) {
      console.error('Failed to load CI/CD data:', error);
      message.error('加载CI/CD数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // 每30秒刷新一次数据
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusTag = (status: string) => {
    const configs: { [key: string]: { color: string; icon: React.ReactNode; text: string } } = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '等待中' },
      running: { color: 'processing', icon: <PlayCircleOutlined />, text: '部署中' },
      success: { color: 'success', icon: <CheckCircleOutlined />, text: '成功' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' },
      rollback: { color: 'warning', icon: <HistoryOutlined />, text: '回滚' },
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
      test: { color: 'orange', text: '测试环境' },
      production: { color: 'red', text: '生产环境' }
    };
    const config = configs[env] || { color: 'default', text: env };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // 部署到测试环境
  const deployToTest = async (values: any) => {
    try {
      const request = {
        serviceName: values.serviceName,
        environment: 'test',
        branch: values.branch || 'test',
        commitHash: values.commitHash,
        deployedBy: 'admin',
        force: values.force || false
      };
      
      await api.post('/api/cicd/deploy/test', request);
      message.success('测试环境部署已启动');
      setDeployModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '部署失败');
    }
  };

  // 提升到生产环境
  const promoteToProduction = async (values: any) => {
    try {
      const request = {
        serviceName: values.serviceName,
        version: values.version,
        commitHash: values.commitHash,
        promotedBy: 'admin'
      };
      
      await api.post('/api/cicd/promote', request);
      message.success('生产环境提升已启动');
      setPromoteModalVisible(false);
      form.resetFields();
      loadData();
    } catch (error: any) {
      message.error(error.response?.data?.error || '提升失败');
    }
  };

  const showDeploymentDetail = (deployment: Deployment) => {
    setSelectedDeployment(deployment);
    setDeploymentDetailVisible(true);
  };

  // 过滤数据
  const filteredDeployments = useMemo(() => {
    return deploymentData.filter(item => {
      const serviceMatch = !searchService || item.serviceName.toLowerCase().includes(searchService.toLowerCase());
      const statusMatch = statusFilter === 'all' || item.status === statusFilter;
      const envMatch = environmentFilter === 'all' || item.environment === environmentFilter;
      return serviceMatch && statusMatch && envMatch;
    });
  }, [deploymentData, searchService, statusFilter, environmentFilter]);

  const deploymentColumns = [
    {
      title: '服务名称',
      dataIndex: 'serviceName',
      key: 'serviceName',
      width: 150,
    },
    {
      title: '环境',
      key: 'environment',
      width: 100,
      render: (record: Deployment) => getEnvironmentTag(record.environment),
    },
    {
      title: '版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (version: string) => version || '-',
    },
    {
      title: '分支',
      dataIndex: 'branch',
      key: 'branch',
      width: 100,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (record: Deployment) => getStatusTag(record.status),
    },
    {
      title: '提交信息',
      key: 'commit',
      width: 250,
      render: (record: Deployment) => (
        <div>
          <div>{record.commitMessage || '无提交信息'}</div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            <CodeOutlined /> {record.commitHash?.substring(0, 8)}
          </div>
        </div>
      ),
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 150,
      render: (time: string) => new Date(time).toLocaleString(),
    },
    {
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (record: Deployment) => {
        if (record.duration) {
          return `${Math.floor(record.duration / 60)}m${record.duration % 60}s`;
        }
        return '-';
      },
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
          <Button 
            type="link" 
            size="small" 
            icon={<EyeOutlined />}
            onClick={() => showDeploymentDetail(record)}
          >
            详情
          </Button>
        </Space>
      ),
    },
  ];

  const environmentColumns = [
    {
      title: '服务名称',
      dataIndex: 'serviceName',
      key: 'serviceName',
      width: 150,
    },
    {
      title: '环境',
      key: 'environment',
      width: 100,
      render: (record: ServiceEnvironment) => getEnvironmentTag(record.environment),
    },
    {
      title: '当前版本',
      dataIndex: 'currentVersion',
      key: 'currentVersion',
      width: 120,
      render: (version: string) => version || '-',
    },
    {
      title: '当前提交',
      key: 'currentCommit',
      width: 120,
      render: (record: ServiceEnvironment) => (
        record.currentCommit ? 
        <><CodeOutlined /> {record.currentCommit.substring(0, 8)}</> : 
        '-'
      ),
    },
    {
      title: '健康状态',
      key: 'isHealthy',
      width: 100,
      render: (record: ServiceEnvironment) => (
        <Badge 
          status={record.isHealthy ? 'success' : 'error'} 
          text={record.isHealthy ? '健康' : '异常'} 
        />
      ),
    },
    {
      title: '最后部署时间',
      dataIndex: 'lastDeployedAt',
      key: 'lastDeployedAt',
      width: 150,
      render: (time: string) => time ? new Date(time).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      render: (record: ServiceEnvironment) => (
        <Space>
          {record.environment === 'test' ? (
            <Button 
              type="primary" 
              size="small" 
              icon={<ArrowUpOutlined />}
              onClick={() => {
                form.setFieldsValue({
                  serviceName: record.serviceName,
                  version: record.currentVersion,
                  commitHash: record.currentCommit
                });
                setPromoteModalVisible(true);
              }}
              disabled={!record.isHealthy || !record.currentVersion}
            >
              提升到生产
            </Button>
          ) : (
            <Button type="link" size="small">
              回滚
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const runningDeployments = deploymentData.filter(d => d.status === 'running').length;
  const successDeployments = deploymentData.filter(d => d.status === 'success').length;
  const failedDeployments = deploymentData.filter(d => d.status === 'failed').length;

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
          <Button 
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={() => setDeployModalVisible(true)}
          >
            部署到测试
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadData}
            loading={loading}
          >
            刷新
          </Button>
        </Space>
      }
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        <TabPane tab={<><DeploymentUnitOutlined />部署记录</>} key="deployments">
          {/* 搜索控件 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Input
                placeholder="搜索服务名称"
                prefix={<SearchOutlined />}
                value={searchService}
                onChange={(e) => setSearchService(e.target.value)}
                allowClear
              />
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="状态筛选"
                value={statusFilter}
                onChange={setStatusFilter}
              >
                <Select.Option value="all">全部状态</Select.Option>
                <Select.Option value="running">部署中</Select.Option>
                <Select.Option value="success">成功</Select.Option>
                <Select.Option value="failed">失败</Select.Option>
                <Select.Option value="pending">等待中</Select.Option>
              </Select>
            </Col>
            <Col span={4}>
              <Select
                style={{ width: '100%' }}
                placeholder="环境筛选"
                value={environmentFilter}
                onChange={setEnvironmentFilter}
              >
                <Select.Option value="all">全部环境</Select.Option>
                <Select.Option value="test">测试环境</Select.Option>
                <Select.Option value="production">生产环境</Select.Option>
              </Select>
            </Col>
          </Row>

          {/* 统计信息 */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic 
                title="总部署" 
                value={deploymentData.length} 
                prefix={<RocketOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="部署中" 
                value={runningDeployments} 
                valueStyle={{ color: '#1890ff' }}
                prefix={<PlayCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="成功" 
                value={successDeployments} 
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="失败" 
                value={failedDeployments} 
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
          </Row>

          {runningDeployments > 0 && (
            <Alert
              message="有正在运行的部署"
              description={`当前有 ${runningDeployments} 个部署正在执行中`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            columns={deploymentColumns}
            dataSource={filteredDeployments}
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

        <TabPane tab="环境状态" key="environments">
          <Table
            columns={environmentColumns}
            dataSource={serviceEnvironments}
            rowKey="id"
            loading={loading}
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条，共 ${total} 个环境`,
            }}
          />
        </TabPane>
      </Tabs>

      {/* 部署详情模态框 */}
      <Modal
        title={`部署详情 - ${selectedDeployment?.serviceName}`}
        open={deploymentDetailVisible}
        onCancel={() => setDeploymentDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDeploymentDetailVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedDeployment && (
          <div>
            <Descriptions title="基本信息" bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="服务名称">
                {selectedDeployment.serviceName}
              </Descriptions.Item>
              <Descriptions.Item label="环境">
                {getEnvironmentTag(selectedDeployment.environment)}
              </Descriptions.Item>
              <Descriptions.Item label="版本">
                {selectedDeployment.version || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="分支">
                {selectedDeployment.branch}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getStatusTag(selectedDeployment.status)}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {new Date(selectedDeployment.startTime).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="提交哈希" span={2}>
                <CodeOutlined /> {selectedDeployment.commitHash}
              </Descriptions.Item>
              <Descriptions.Item label="提交信息" span={2}>
                {selectedDeployment.commitMessage || '无提交信息'}
              </Descriptions.Item>
              <Descriptions.Item label="部署者">
                {selectedDeployment.deployedBy}
              </Descriptions.Item>
            </Descriptions>

            {selectedDeployment.buildLog && (
              <div style={{ marginTop: 16 }}>
                <h4>构建日志</h4>
                <pre style={{ 
                  background: '#f5f5f5', 
                  padding: '12px', 
                  borderRadius: '4px',
                  maxHeight: '300px',
                  overflow: 'auto',
                  fontSize: '12px'
                }}>
                  {selectedDeployment.buildLog}
                </pre>
              </div>
            )}

            {selectedDeployment.errorMessage && (
              <div style={{ marginTop: 16 }}>
                <Alert
                  message="错误信息"
                  description={selectedDeployment.errorMessage}
                  type="error"
                  showIcon
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 部署到测试环境模态框 */}
      <Modal
        title="部署到测试环境"
        open={deployModalVisible}
        onCancel={() => setDeployModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={deployToTest} layout="vertical">
          <Form.Item
            label="服务名称"
            name="serviceName"
            rules={[{ required: true, message: '请输入服务名称' }]}
          >
            <Select placeholder="选择服务">
              <Select.Option value="ims_server_web">ims_server_web</Select.Option>
              <Select.Option value="ims_server_ws">ims_server_ws</Select.Option>
              <Select.Option value="ims_server_mq">ims_server_mq</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="分支"
            name="branch"
            rules={[{ required: true, message: '请输入分支名称' }]}
          >
            <Input placeholder="例如: test, develop" />
          </Form.Item>
          <Form.Item
            label="提交哈希"
            name="commitHash"
          >
            <Input placeholder="可选，留空则使用最新提交" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                开始部署
              </Button>
              <Button onClick={() => setDeployModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* 提升到生产环境模态框 */}
      <Modal
        title="提升到生产环境"
        open={promoteModalVisible}
        onCancel={() => setPromoteModalVisible(false)}
        footer={null}
      >
        <Form form={form} onFinish={promoteToProduction} layout="vertical">
          <Form.Item
            label="服务名称"
            name="serviceName"
            rules={[{ required: true, message: '请输入服务名称' }]}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="版本"
            name="version"
            rules={[{ required: true, message: '请输入版本' }]}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            label="提交哈希"
            name="commitHash"
            rules={[{ required: true, message: '请输入提交哈希' }]}
          >
            <Input disabled />
          </Form.Item>
          <Alert
            message="注意"
            description="此操作将把测试环境验证通过的版本部署到生产环境，请确认测试通过后再执行。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" danger>
                确认提升到生产
              </Button>
              <Button onClick={() => setPromoteModalVisible(false)}>
                取消
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default CICDManager;