import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  Typography, 
  Tag, 
  Alert, 
  Modal, 
  message,
  Spin,
  Row,
  Col,
  Statistic
} from 'antd';
import { 
  ReloadOutlined, 
  DeleteOutlined, 
  ExclamationCircleOutlined,
  UserOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';
import { fetchStaleUsers, cleanupStaleUsers } from '../services/api';

const { Title, Text } = Typography;
const { confirm } = Modal;

interface UserOnlineInfo {
  userKey: string;
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
  timeoutSeconds: number;
}

const RedisMonitor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [staleUsers, setStaleUsers] = useState<UserOnlineInfo[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');

  // 获取异常用户数据
  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching stale users from Redis...');
      const response = await fetchStaleUsers();
      console.log('Received stale users data:', response);
      
      setStaleUsers(response.staleUsers || []);
      setTotalUsers(response.totalUsers || 0);
      setLastUpdateTime(new Date().toLocaleString());
      
    } catch (error: any) {
      console.error('Failed to fetch stale users:', error);
      message.error(`获取数据失败: ${error.message || '网络错误'}`);
    } finally {
      setLoading(false);
    }
  };

  // 一键清理异常用户
  const handleCleanup = () => {
    if (staleUsers.length === 0) {
      message.info('没有需要清理的异常用户');
      return;
    }

    confirm({
      title: '确认清理异常用户',
      icon: <ExclamationCircleOutlined />,
      content: `即将清理 ${staleUsers.length} 个心跳超时的异常用户，将其在线状态设置为离线。此操作不可撤销，是否继续？`,
      okText: '确认清理',
      okType: 'danger',
      cancelText: '取消',
      async onOk() {
        setCleaning(true);
        try {
          console.log('Starting cleanup of stale users...');
          const response = await cleanupStaleUsers();
          console.log('Cleanup result:', response);
          
          message.success(`成功清理 ${response.cleanedCount || 0} 个异常用户`);
          // 清理完成后重新获取数据
          await fetchData();
          
        } catch (error: any) {
          console.error('Failed to cleanup stale users:', error);
          message.error(`清理失败: ${error.message || '网络错误'}`);
        } finally {
          setCleaning(false);
        }
      },
    });
  };

  // 格式化时间差
  const formatTimeDiff = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}分${remainingSeconds}秒`;
    }
    return `${remainingSeconds}秒`;
  };

  // 表格列定义
  const columns = [
    {
      title: '用户标识',
      dataIndex: 'userKey',
      key: 'userKey',
      width: 200,
      render: (text: string) => <Text code style={{ fontSize: '12px' }}>{text}</Text>
    },
    {
      title: '平台信息',
      key: 'platform',
      width: 150,
      render: (_: any, record: UserOnlineInfo) => (
        <div>
          <div><Text strong>{record.platformId}</Text></div>
          <div><Text type="secondary" style={{ fontSize: '12px' }}>{record.thirdApp}</Text></div>
        </div>
      )
    },
    {
      title: '设备号',
      dataIndex: 'bdClientNo',
      key: 'bdClientNo',
      width: 150,
      render: (text: string) => <Text style={{ fontSize: '12px' }}>{text || '-'}</Text>
    },
    {
      title: '心跳时间',
      key: 'heartbeat',
      width: 180,
      render: (_: any, record: UserOnlineInfo) => (
        <div>
          <div>{record.heartbeatTimeFormatted}</div>
          <Tag color="red" style={{ fontSize: '11px' }}>
            超时 {formatTimeDiff(record.timeoutSeconds)}
          </Tag>
        </div>
      )
    },
    {
      title: '登录时间',
      dataIndex: 'loginTimeFormatted',
      key: 'loginTime',
      width: 160
    },
    {
      title: '服务器',
      key: 'server',
      width: 130,
      render: (_: any, record: UserOnlineInfo) => (
        <Text style={{ fontSize: '12px' }}>{record.server}:{record.http_port}</Text>
      )
    },
    {
      title: '在线状态',
      key: 'status',
      width: 80,
      render: (_: any, record: UserOnlineInfo) => (
        <Tag color={record.online ? 'red' : 'default'}>
          {record.online ? '异常在线' : '已离线'}
        </Tag>
      )
    }
  ];

  // 组件挂载时获取数据
  useEffect(() => {
    fetchData();
    // 设置定时刷新（可选）
    const interval = setInterval(fetchData, 5 * 60 * 1000); // 每5分钟刷新一次
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ height: 'calc(100vh - 112px)', overflow: 'auto' }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2}>Redis 异常账号监控</Title>
        <Text type="secondary">
          监控心跳超时（超过60秒）但仍标记为在线状态的异常用户账号
        </Text>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="总用户数"
              value={totalUsers}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="异常用户数"
              value={staleUsers.length}
              prefix={<ExclamationCircleOutlined />}
              valueStyle={{ color: staleUsers.length > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="异常占比"
              value={totalUsers > 0 ? ((staleUsers.length / totalUsers) * 100).toFixed(1) : '0'}
              suffix="%"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: staleUsers.length > 0 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary">最后更新</Text>
            </div>
            <Text strong style={{ fontSize: '12px' }}>{lastUpdateTime}</Text>
          </Card>
        </Col>
      </Row>

      {/* 操作按钮 */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button 
            type="primary"
            icon={<ReloadOutlined />}
            onClick={fetchData}
            loading={loading}
          >
            刷新数据
          </Button>
          <Button 
            danger
            icon={<DeleteOutlined />}
            onClick={handleCleanup}
            loading={cleaning}
            disabled={staleUsers.length === 0}
          >
            一键清理异常用户 ({staleUsers.length})
          </Button>
        </Space>
      </div>

      {/* 状态提示 */}
      {staleUsers.length === 0 && !loading ? (
        <Alert
          message="系统状态正常"
          description="当前没有发现心跳超时的异常在线用户"
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : staleUsers.length > 0 ? (
        <Alert
          message={`发现 ${staleUsers.length} 个异常用户`}
          description="这些用户心跳已超时60秒但仍标记为在线状态，建议及时清理"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      ) : null}

      {/* 数据表格 */}
      <Card>
        <Spin spinning={loading}>
          <Table
            dataSource={staleUsers}
            columns={columns}
            rowKey="userKey"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条异常记录`
            }}
            size="small"
            scroll={{ x: 1200 }}
            locale={{
              emptyText: loading ? '加载中...' : '暂无异常用户数据'
            }}
          />
        </Spin>
      </Card>
    </div>
  );
};

export default RedisMonitor;