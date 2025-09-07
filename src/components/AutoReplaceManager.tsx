import React, { useState, useEffect } from 'react';
import { Button, Tag, Spin, notification, Card, Typography } from 'antd';
import {
  getAutoReplaceStatus,
  startAutoReplace,
  stopAutoReplace,
} from '../services/api';

const { Text } = Typography;

const AutoReplaceManager: React.FC = () => {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('正在获取状态...');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchStatus = async () => {
    try {
      const response = await getAutoReplaceStatus();
      if (response.success) {
        setIsRunning(response.isRunning);
        setStatusMessage(response.statusMessage);
      }
    } catch (error) {
      setStatusMessage('获取状态失败');
      console.error('Failed to fetch status', error);
      // Stop polling on error to avoid spamming
      if (intervalId) clearInterval(intervalId);
    } finally {
      setIsLoading(false);
    }
  };

  let intervalId: NodeJS.Timeout;

  useEffect(() => {
    fetchStatus();
    intervalId = setInterval(fetchStatus, 15000); // Poll every 15 seconds
    return () => clearInterval(intervalId);
  }, []);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await startAutoReplace();
      notification.success({ message: '任务已启动' });
      await fetchStatus();
    } catch (error) {
      notification.error({ message: '启动失败' });
      console.error('Failed to start task', error);
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await stopAutoReplace();
      notification.success({ message: '任务已停止' });
      await fetchStatus();
    } catch (error) {
      notification.error({ message: '停止失败' });
      console.error('Failed to stop task', error);
      setIsLoading(false);
    }
  };

  return (
    <Card title="代理自动检测与更换" style={{ marginBottom: '20px' }}>
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
          启动自动更换
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
    </Card>
  );
};

export default AutoReplaceManager;
