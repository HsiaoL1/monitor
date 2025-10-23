import React, { useState, useEffect } from 'react';
import {
  Card,
  Switch,
  Button,
  Alert,
  Spin,
  Typography,
  Space,
  Divider,
  Tag,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import api from '../services/api';

const { Title, Text } = Typography;

interface AutoRestartStatus {
  success: boolean;
  isRunning: boolean;
  statusMessage: string;
  timestamp: string;
}

const AutoAccountRestartManager: React.FC = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('已停止');
  const [loading, setLoading] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [error, setError] = useState<string>('');

  // 获取自动重启状态
  const fetchStatus = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await api.get<AutoRestartStatus>('/account/auto-restart/status');
      
      if (response.data.success) {
        setIsRunning(response.data.isRunning);
        setStatusMessage(response.data.statusMessage);
        setLastUpdate(response.data.timestamp);
      } else {
        setError('获取状态失败');
      }
    } catch (err: any) {
      console.error('获取自动重启状态失败:', err);
      setError(err.response?.data?.message || '获取状态失败');
    } finally {
      setLoading(false);
    }
  };

  // 启动自动重启任务
  const startAutoRestart = async () => {
    try {
      setActionLoading(true);
      setError('');
      
      const response = await api.post('/account/auto-restart/start');
      
      if (response.data.success) {
        setIsRunning(true);
        setStatusMessage('正在启动...');
        // 延迟获取最新状态
        setTimeout(fetchStatus, 1000);
      } else {
        setError(response.data.message || '启动失败');
      }
    } catch (err: any) {
      console.error('启动自动重启失败:', err);
      setError(err.response?.data?.message || '启动失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 停止自动重启任务
  const stopAutoRestart = async () => {
    try {
      setActionLoading(true);
      setError('');
      
      const response = await api.post('/account/auto-restart/stop');
      
      if (response.data.success) {
        setIsRunning(false);
        setStatusMessage('已停止');
        // 延迟获取最新状态
        setTimeout(fetchStatus, 1000);
      } else {
        setError(response.data.message || '停止失败');
      }
    } catch (err: any) {
      console.error('停止自动重启失败:', err);
      setError(err.response?.data?.message || '停止失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 切换开关处理
  const handleToggle = async (checked: boolean) => {
    if (checked) {
      await startAutoRestart();
    } else {
      await stopAutoRestart();
    }
  };

  // 手动刷新状态
  const handleRefresh = () => {
    fetchStatus();
  };

  // 获取状态标签
  const getStatusTag = () => {
    if (isRunning) {
      if (statusMessage.includes('正在检测') || statusMessage.includes('正在重启')) {
        return <Tag color="processing">运行中</Tag>;
      } else if (statusMessage.includes('错误') || statusMessage.includes('失败')) {
        return <Tag color="error">运行异常</Tag>;
      } else {
        return <Tag color="success">运行中</Tag>;
      }
    } else {
      return <Tag color="default">已停止</Tag>;
    }
  };

  // 格式化时间
  const formatTime = (timestamp: string) => {
    if (!timestamp) return '未知';
    
    try {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return timestamp;
    }
  };

  // 组件挂载时获取状态
  useEffect(() => {
    fetchStatus();
    
    // 设置定时器，每30秒刷新一次状态
    const interval = setInterval(fetchStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <Card
      title={
        <Space>
          <PlayCircleOutlined />
          <span>账号自动重启管理</span>
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={handleRefresh}
          loading={loading}
          size="small"
        >
          刷新状态
        </Button>
      }
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* 错误提示 */}
        {error && (
          <Alert
            message="操作失败"
            description={error}
            type="error"
            showIcon
            closable
            onClose={() => setError('')}
          />
        )}

        {/* 功能说明 */}
        <Alert
          message="功能说明"
          description={
            <div>
              <p>• 自动检测有设备绑定、状态正常、心跳在3分钟内但在线状态为离线的账号</p>
              <p>• 对符合条件的账号执行强制停止并重新启动操作</p>
              <p>• 检测频率：每30分钟执行一次</p>
              <p>• 并发限制：最多同时重启5个账号，避免系统过载</p>
            </div>
          }
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
        />

        {/* 控制面板 */}
        <Card size="small" title="控制面板">
          <Row gutter={24} align="middle">
            <Col span={8}>
              <Space>
                <Text strong>自动重启任务:</Text>
                <Switch
                  checked={isRunning}
                  onChange={handleToggle}
                  loading={actionLoading}
                  checkedChildren="开启"
                  unCheckedChildren="关闭"
                />
              </Space>
            </Col>
            <Col span={8}>
              <Space>
                <Text>当前状态:</Text>
                {getStatusTag()}
              </Space>
            </Col>
            <Col span={8}>
              <Space>
                {isRunning ? (
                  <Button
                    type="primary"
                    danger
                    icon={<PauseCircleOutlined />}
                    onClick={stopAutoRestart}
                    loading={actionLoading}
                    size="small"
                  >
                    停止任务
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={startAutoRestart}
                    loading={actionLoading}
                    size="small"
                  >
                    启动任务
                  </Button>
                )}
              </Space>
            </Col>
          </Row>
        </Card>

        {/* 状态信息 */}
        <Card size="small" title="运行状态">
          <Spin spinning={loading}>
            <Row gutter={24}>
              <Col span={12}>
                <Statistic
                  title="任务状态"
                  value={isRunning ? '运行中' : '已停止'}
                  valueStyle={{
                    color: isRunning ? '#3f8600' : '#cf1322',
                  }}
                />
              </Col>
              <Col span={12}>
                <Statistic
                  title="最后更新时间"
                  value={formatTime(lastUpdate)}
                  valueStyle={{ fontSize: '14px' }}
                />
              </Col>
            </Row>
            
            <Divider />
            
            <div>
              <Text strong>详细状态:</Text>
              <br />
              <Text 
                type={statusMessage.includes('错误') || statusMessage.includes('失败') ? 'danger' : 'secondary'}
              >
                {statusMessage || '无状态信息'}
              </Text>
            </div>
          </Spin>
        </Card>

        {/* 操作说明 */}
        <Card size="small" title="操作说明">
          <Space direction="vertical" size="small">
            <Text>
              <Text strong>重启条件:</Text> 账号有dev_code绑定 + 账号状态正常 + 心跳3分钟内 + 在线状态为离线
            </Text>
            <Text>
              <Text strong>设备类型:</Text> 自动识别云机(大写字母开头)和盒子(小写字母开头)
            </Text>
            <Text>
              <Text strong>应用包名:</Text> 根据平台ID自动选择(WhatsApp/WhatsApp Business)
            </Text>
            <Text>
              <Text strong>重启流程:</Text> 强制停止 → 等待5秒 → 重新启动 → 等待15秒完全启动
            </Text>
          </Space>
        </Card>
      </Space>
    </Card>
  );
};

export default AutoAccountRestartManager;