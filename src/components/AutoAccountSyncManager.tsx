import React, { useState, useEffect } from 'react';
import { Button, Tag, Spin, notification, Card, Typography } from 'antd';
import {
  getAutoAccountSyncStatus,
  startAutoAccountSync,
  stopAutoAccountSync,
} from '../services/api';

const { Text } = Typography;

const AutoAccountSyncManager: React.FC = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('正在获取状态...');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchStatus = async () => {
    try {
      const response = await getAutoAccountSyncStatus();
      if (response.success) {
        setIsRunning(response.isRunning);
        setStatusMessage(response.statusMessage);
      }
    } catch (error) {
      setStatusMessage('获取状态失败');
      console.error('Failed to fetch auto account sync status', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 15000); // Poll every 15 seconds
    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startAutoAccountSync();
      notification.success({ message: '账号自动同步任务已启动' });
      await fetchStatus();
    } catch (error) {
      notification.error({ message: '启动失败' });
      console.error('Failed to start auto account sync task', error);
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stopAutoAccountSync();
      notification.success({ message: '账号自动同步任务已停止' });
      await fetchStatus();
    } catch (error) {
      notification.error({ message: '停止失败' });
      console.error('Failed to stop auto account sync task', error);
      setIsLoading(false);
    }
  };

  return (
    <Card title="账号状态自动同步" style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
        <Text strong>当前状态:</Text>
        {isLoading && <Spin size="small" />}
        <Tag color={isRunning ? 'green' : 'red'}>
          {isRunning ? '运行中' : '已停止'}
        </Tag>
        <Text type="secondary">{statusMessage}</Text>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Button
          type="primary"
          onClick={handleStart}
          disabled={isRunning || isLoading}
          loading={isLoading && !isRunning}
        >
          启动自动同步
        </Button>
        <Button
          type="dashed"
          danger
          onClick={handleStop}
          disabled={!isRunning || isLoading}
          loading={isLoading && isRunning}
        >
          停止
        </Button>
      </div>
      <div style={{ marginTop: '15px' }}>
        <Text type="secondary" style={{ fontSize: '12px' }}>
          自动同步功能会定期检查Redis和数据库中的账号在线状态，并同步BdClientNo、设备类型和云设备ID等信息。
          检查频率为每5分钟一次，避免过度消耗系统资源。
        </Text>
      </div>
    </Card>
  );
};

export default AutoAccountSyncManager;