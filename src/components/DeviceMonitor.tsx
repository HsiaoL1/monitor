import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Tag, 
  Space, 
  Button, 
  Input, 
  Select, 
  Row, 
  Col, 
  Statistic, 
  Alert, 
  Pagination,
  Tooltip,
  Badge
} from 'antd';
import { 
  ReloadOutlined, 
  SearchOutlined, 
  DesktopOutlined,
  CloudOutlined,
  EyeOutlined,
  EyeInvisibleOutlined
} from '@ant-design/icons';
import { fetchDeviceMonitoring } from '../services/api';

const { Option } = Select;

interface DeviceInfo {
  dev_code: string;
  dev_name: string;
  dev_text: string;
  device_type: number;
  device_type_text: string;
  is_online_in_db: number;
  is_online_in_redis: boolean;
  online_status: string;
  merchant_id: number;
  country_code: string;
  custom_code?: number;
  last_online_time?: string;
  redis_login_time?: string;
  redis_heartbeat_time?: string;
  account_count: number;
  online_account_count: number;
  accounts?: string[];
}

interface DeviceMonitorResponse {
  success: boolean;
  devices: DeviceInfo[];
  total: number;
  page: number;
  page_size: number;
  statistics: {
    total_devices: number;
    online_devices: number;
    offline_devices: number;
    cloud_devices: number;
    box_devices: number;
    redis_only_devices: number;
    db_only_devices: number;
  };
  timestamp: string;
}

const DeviceMonitor: React.FC = () => {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  
  // 搜索状态
  const [searchForm, setSearchForm] = useState({
    dev_code: '',
    device_type: '',
    online_status: ''
  });
  
  // 统计状态
  const [statistics, setStatistics] = useState({
    total_devices: 0,
    online_devices: 0,
    offline_devices: 0,
    cloud_devices: 0,
    box_devices: 0,
    redis_only_devices: 0,
    db_only_devices: 0
  });

  const fetchDevices = async (isInitial = false) => {
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      console.log('Fetching device monitoring data...');
      const params = {
        page: currentPage,
        page_size: pageSize,
        dev_code: searchForm.dev_code,
        device_type: searchForm.device_type,
        online_status: searchForm.online_status
      };
      
      const data: DeviceMonitorResponse = await fetchDeviceMonitoring(params);
      console.log('Received device data:', data);
      
      if (data.success) {
        setDevices(data.devices);
        setTotal(data.total);
        setStatistics(data.statistics);
      } else {
        setError('获取设备监控数据失败');
      }
    } catch (err: any) {
      console.error('Failed to fetch device monitoring data:', err);
      setError('获取设备监控数据失败，请检查网络连接或服务器状态');
    } finally {
      setLoading(false);
      if (isInitial) {
        setInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchDevices(true);
  }, [currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearch = () => {
    setCurrentPage(1);
    fetchDevices(false);
  };

  const handleReset = () => {
    setSearchForm({
      dev_code: '',
      device_type: '',
      online_status: ''
    });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number, size?: number) => {
    setCurrentPage(page);
    if (size && size !== pageSize) {
      setPageSize(size);
    }
  };

  const getOnlineStatusTag = (device: DeviceInfo) => {
    const { is_online_in_db, is_online_in_redis } = device;
    
    if (is_online_in_db === 1 && is_online_in_redis) {
      return <Tag color="green" icon={<EyeOutlined />}>在线</Tag>;
    } else if (is_online_in_db === 1) {
      return <Tag color="blue">数据库在线</Tag>;
    } else if (is_online_in_redis) {
      return <Tag color="orange">Redis在线</Tag>;
    } else {
      return <Tag color="red" icon={<EyeInvisibleOutlined />}>离线</Tag>;
    }
  };

  const getDeviceTypeIcon = (deviceType: number) => {
    return deviceType === 2 ? <CloudOutlined /> : <DesktopOutlined />;
  };

  const columns = [
    {
      title: '设备编码',
      dataIndex: 'dev_code',
      key: 'dev_code',
      width: 150,
      render: (text: string) => (
        <Tooltip title={text}>
          <code style={{ background: '#f5f5f5', padding: '2px 6px', fontSize: '12px' }}>
            {text}
          </code>
        </Tooltip>
      )
    },
    {
      title: '设备名称',
      dataIndex: 'dev_name',
      key: 'dev_name',
      width: 120,
      render: (text: string, record: DeviceInfo) => (
        <Space>
          {getDeviceTypeIcon(record.device_type)}
          <span>{text || '-'}</span>
        </Space>
      )
    },
    {
      title: '设备类型',
      dataIndex: 'device_type_text',
      key: 'device_type_text',
      width: 100,
      render: (text: string, record: DeviceInfo) => (
        <Tag color={record.device_type === 2 ? 'blue' : 'green'}>
          {text}
        </Tag>
      )
    },
    {
      title: '在线状态',
      key: 'online_status',
      width: 120,
      render: (record: DeviceInfo) => getOnlineStatusTag(record)
    },
    {
      title: '账号统计',
      key: 'accounts_summary',
      width: 120,
      render: (record: DeviceInfo) => (
        <Space direction="vertical" size="small">
          <div>
            <Badge count={record.account_count} color="#1890ff" title="总账号数" />
            <span style={{ fontSize: '11px', marginLeft: '4px' }}>总数</span>
          </div>
          <div>
            <Badge count={record.online_account_count} color="#52c41a" title="在线账号数" />
            <span style={{ fontSize: '11px', marginLeft: '4px' }}>在线</span>
          </div>
        </Space>
      )
    },
    {
      title: '关联账号',
      key: 'accounts_detail',
      width: 200,
      render: (record: DeviceInfo) => {
        if (!record.accounts || record.accounts.length === 0) {
          return <span style={{ color: '#999' }}>暂无账号</span>;
        }
        
        if (record.accounts.length <= 3) {
          return (
            <Space direction="vertical" size="small">
              {record.accounts.map((account, index) => (
                <Tooltip key={index} title={account}>
                  <Tag color="blue" style={{ fontSize: '10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 6px' }}>
                    {account.length > 20 ? account.substring(0, 20) + '...' : account}
                  </Tag>
                </Tooltip>
              ))}
            </Space>
          );
        } else {
          return (
            <Space direction="vertical" size="small">
              {record.accounts.slice(0, 2).map((account, index) => (
                <Tooltip key={index} title={account}>
                  <Tag color="blue" style={{ fontSize: '10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', padding: '2px 6px' }}>
                    {account.length > 20 ? account.substring(0, 20) + '...' : account}
                  </Tag>
                </Tooltip>
              ))}
              <Tooltip title={`还有 ${record.accounts.length - 2} 个账号：${record.accounts.slice(2).join(', ')}`}>
                <Tag color="orange" style={{ fontSize: '10px', padding: '2px 6px' }}>
                  +{record.accounts.length - 2} 更多
                </Tag>
              </Tooltip>
            </Space>
          );
        }
      }
    },
    {
      title: '商户ID',
      dataIndex: 'merchant_id',
      key: 'merchant_id',
      width: 80
    },
    {
      title: '国家/地区',
      dataIndex: 'country_code',
      key: 'country_code',
      width: 100,
      render: (text: string) => text || '-'
    },
    {
      title: '自定义编号',
      dataIndex: 'custom_code',
      key: 'custom_code',
      width: 100,
      render: (code: number | null) => code || '-'
    },
    {
      title: '最后在线',
      key: 'last_online_info',
      width: 150,
      render: (record: DeviceInfo) => (
        <Space direction="vertical" size="small">
          {record.last_online_time && (
            <span style={{ fontSize: '12px' }}>
              DB: {new Date(record.last_online_time).toLocaleString()}
            </span>
          )}
          {record.redis_heartbeat_time && (
            <span style={{ fontSize: '12px' }}>
              Redis: {record.redis_heartbeat_time}
            </span>
          )}
        </Space>
      )
    },
    {
      title: '设备备注',
      dataIndex: 'dev_text',
      key: 'dev_text',
      width: 150,
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ 
            display: 'inline-block', 
            maxWidth: '130px', 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            whiteSpace: 'nowrap' 
          }}>
            {text || '-'}
          </span>
        </Tooltip>
      )
    }
  ];

  if (initialLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '16px' }}>正在加载设备监控数据...</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>设备监控</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={() => fetchDevices(false)}
          loading={loading}
        >
          刷新数据
        </Button>
      </div>

      {error && (
        <Alert 
          message="错误" 
          description={error} 
          type="error" 
          showIcon 
          style={{ marginBottom: 16 }} 
        />
      )}

      {/* 统计信息 */}
      <Card title="设备统计概览" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={4}>
            <Statistic 
              title="总设备数" 
              value={statistics.total_devices} 
              valueStyle={{ color: '#1890ff' }}
              prefix={<DesktopOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic 
              title="在线设备" 
              value={statistics.online_devices} 
              valueStyle={{ color: '#52c41a' }}
              prefix={<EyeOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic 
              title="离线设备" 
              value={statistics.offline_devices} 
              valueStyle={{ color: '#f5222d' }}
              prefix={<EyeInvisibleOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic 
              title="云机" 
              value={statistics.cloud_devices} 
              valueStyle={{ color: '#1890ff' }}
              prefix={<CloudOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic 
              title="盒子" 
              value={statistics.box_devices} 
              valueStyle={{ color: '#52c41a' }}
              prefix={<DesktopOutlined />}
            />
          </Col>
          <Col span={4}>
            <Statistic 
              title="状态不一致" 
              value={statistics.redis_only_devices + statistics.db_only_devices} 
              valueStyle={{ color: '#faad14' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 搜索表单 */}
      <Card title="搜索筛选" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="设备编码"
              value={searchForm.dev_code}
              onChange={(e) => setSearchForm({ ...searchForm, dev_code: e.target.value })}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="设备类型"
              value={searchForm.device_type}
              onChange={(value) => setSearchForm({ ...searchForm, device_type: value })}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="">全部</Option>
              <Option value="1">盒子</Option>
              <Option value="2">云机</Option>
            </Select>
          </Col>
          <Col span={5}>
            <Select
              placeholder="在线状态"
              value={searchForm.online_status}
              onChange={(value) => setSearchForm({ ...searchForm, online_status: value })}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="">全部</Option>
              <Option value="online">完全在线</Option>
              <Option value="offline">完全离线</Option>
              <Option value="db_only">仅数据库在线</Option>
              <Option value="redis_only">仅Redis在线</Option>
            </Select>
          </Col>
          <Col span={6}>
            <Space>
              <Button 
                type="primary" 
                icon={<SearchOutlined />} 
                onClick={handleSearch}
                loading={loading}
              >
                搜索
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 设备列表 */}
      <Card title={`设备列表 (共${total}台设备)`}>
        <Table
          columns={columns}
          dataSource={devices}
          rowKey="dev_code"
          loading={loading}
          pagination={false}
          size="middle"
          scroll={{ x: 1400 }}
          style={{ opacity: loading ? 0.6 : 1 }}
        />
        
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <Pagination
            current={currentPage}
            total={total}
            pageSize={pageSize}
            showSizeChanger
            showQuickJumper
            showTotal={(total, range) => `第 ${range[0]}-${range[1]} 条 / 共 ${total} 条`}
            onChange={handlePageChange}
            pageSizeOptions={['10', '20', '50', '100']}
            style={{ textAlign: 'right' }}
          />
        </div>
      </Card>
    </div>
  );
};

export default DeviceMonitor;