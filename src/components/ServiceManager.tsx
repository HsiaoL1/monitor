import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Tag, message, Space, Popconfirm, Alert, Divider, Dropdown } from 'antd';
import { PlayCircleOutlined, StopOutlined, ReloadOutlined, BarChartOutlined, DownOutlined } from '@ant-design/icons';
import { services as initialServices } from '../config/services';
import { startService, stopService, restartService, getAllServicesStatus, fetchSystemMetrics } from '../services/api';
import { ServiceInfo, ServiceMetrics } from '../types';

const ServiceManager: React.FC = () => {
  const [services, setServices] = useState<ServiceInfo[]>(initialServices);
  const [metrics, setMetrics] = useState<Record<string, ServiceMetrics>>({});
  const [loading, setLoading] = useState(false);
  const [operationLoading, setOperationLoading] = useState<Record<string, boolean>>({});
  const [batchLoading, setBatchLoading] = useState(false);

  const fetchServicesStatus = async () => {
    setLoading(true);
    try {
      // 同时获取状态和metrics数据，包含端口信息
      const [statusData, metricsData] = await Promise.all([
        getAllServicesStatus(),
        fetchSystemMetrics()
      ]);
      
      console.log('Fetched status data:', statusData);
      console.log('Fetched metrics data:', metricsData);
      
      setMetrics(metricsData);
      
      if (Object.keys(statusData).length > 0) {
        setServices(prev => prev.map(service => ({
          ...service,
          status: statusData[service.name] || 'unknown'
        })));
      } else {
        console.log('No status data received, using mock data for testing');
        setServices(prev => prev.map(service => ({
          ...service,
          status: Math.random() > 0.5 ? 'running' : 'stopped' as 'running' | 'stopped' | 'unknown'
        })));
      }
    } catch (error) {
      console.error('Failed to fetch services status:', error);
      message.error('获取服务状态失败，使用模拟数据');
      
      setServices(prev => prev.map(service => ({
        ...service,
        status: Math.random() > 0.5 ? 'running' : 'stopped' as 'running' | 'stopped' | 'unknown'
      })));
    } finally {
      setLoading(false);
    }
  };

  const handleStartService = async (service: ServiceInfo) => {
    setOperationLoading(prev => ({ ...prev, [service.name]: true }));
    try {
      console.log(`Starting service: ${service.name}`);
      const result = await startService(service);
      console.log(`Start service result:`, result);
      
      if (result.success === true) {
        message.success(`${service.name} 启动成功`);
        setServices(prev => prev.map(s => 
          s.name === service.name ? { ...s, status: 'running' } : s
        ));
        
        setTimeout(fetchServicesStatus, 2000);
      } else {
        let errorMsg = `${service.name} 启动失败`;
        if (result.message) {
          errorMsg += `：${result.message}`;
        }
        if (result.logs) {
          errorMsg += ` (${result.logs})`;
        }
        message.error(errorMsg, 8);
      }
    } catch (error) {
      console.error(`Start service error:`, error);
      message.error(`${service.name} 启动失败：网络错误或服务器无法连接`);
    } finally {
      setOperationLoading(prev => ({ ...prev, [service.name]: false }));
    }
  };

  const handleStopService = async (service: ServiceInfo) => {
    setOperationLoading(prev => ({ ...prev, [service.name]: true }));
    try {
      console.log(`Stopping service: ${service.name}`);
      const success = await stopService(service.name);
      console.log(`Stop service result:`, success);
      
      if (success) {
        message.success(`${service.name} 停止成功`);
        setServices(prev => prev.map(s => 
          s.name === service.name ? { ...s, status: 'stopped' } : s
        ));
        
        setTimeout(fetchServicesStatus, 2000);
      } else {
        message.error(`${service.name} 停止失败，请检查服务配置或网络连接`);
      }
    } catch (error) {
      console.error(`Stop service error:`, error);
      message.error(`${service.name} 停止失败：网络错误或服务器无法连接`);
    } finally {
      setOperationLoading(prev => ({ ...prev, [service.name]: false }));
    }
  };

  const handleRestartService = async (service: ServiceInfo) => {
    setOperationLoading(prev => ({ ...prev, [service.name]: true }));
    try {
      console.log(`Restarting service: ${service.name}`);
      const result = await restartService(service);
      console.log(`Restart service result:`, result);
      
      if (result.success === true) {
        message.success(`${service.name} 重启成功`);
        setServices(prev => prev.map(s => 
          s.name === service.name ? { ...s, status: 'running' } : s
        ));
        
        setTimeout(fetchServicesStatus, 2000);
      } else {
        let errorMsg = `${service.name} 重启失败`;
        if (result.message) {
          errorMsg += `：${result.message}`;
        }
        if (result.logs) {
          errorMsg += ` (${result.logs})`;
        }
        message.error(errorMsg, 8);
      }
    } catch (error) {
      console.error(`Restart service error:`, error);
      message.error(`${service.name} 重启失败：网络错误或服务器无法连接`);
    } finally {
      setOperationLoading(prev => ({ ...prev, [service.name]: false }));
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'running':
        return <Tag color="green">运行中</Tag>;
      case 'stopped':
        return <Tag color="red">已停止</Tag>;
      default:
        return <Tag color="gray">未知</Tag>;
    }
  };

  // 生成火焰图
  const generateFlamegraph = (serviceName: string, profileType: string = 'profile') => {
    const url = `/api/pprof/${serviceName}/flamegraph?profile=${profileType}`;
    console.log(`Opening flamegraph for ${serviceName}, profile: ${profileType}`);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // 创建火焰图菜单
  const getFlamegraphMenu = (serviceName: string) => ({
    items: [
      {
        key: 'cpu',
        label: 'CPU Profile',
        onClick: () => generateFlamegraph(serviceName, 'profile'),
      },
      {
        key: 'heap',
        label: 'Heap Profile', 
        onClick: () => generateFlamegraph(serviceName, 'heap'),
      },
      {
        key: 'goroutine',
        label: 'Goroutine Profile',
        onClick: () => generateFlamegraph(serviceName, 'goroutine'),
      },
    ]
  });

  const columns = [
    {
      title: '服务名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: '服务路径',
      dataIndex: 'path',
      key: 'path',
      render: (text: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px' }}>{text}</code>
    },
    {
      title: '部署脚本',
      dataIndex: 'deployScript',
      key: 'deployScript',
      render: (text: string) => <code style={{ background: '#f5f5f5', padding: '2px 6px' }}>{text}</code>
    },
    {
      title: '端口',
      dataIndex: 'name',
      key: 'ports',
      render: (serviceName: string) => {
        const serviceMetrics = metrics[serviceName];
        const ports = serviceMetrics?.ports || [];
        
        if (ports.length === 0) {
          return <Tag color="gray">-</Tag>;
        }
        
        return (
          <Space size={4}>
            {ports.map(port => (
              <Tag key={port} color="blue" style={{ fontFamily: 'monospace' }}>
                {port}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: 'Pprof接口',
      dataIndex: 'pprofUrl',
      key: 'pprofUrl',
      render: (url: string) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px' }}>
          {url}
        </a>
      ) : '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => getStatusTag(status)
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: ServiceInfo) => (
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            size="small"
            disabled={record.status !== 'stopped'}
            loading={operationLoading[record.name]}
            onClick={() => handleStartService(record)}
          >
            启动
          </Button>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            size="small"
            loading={operationLoading[record.name]}
            onClick={() => handleRestartService(record)}
          >
            重启
          </Button>
          <Popconfirm
            title="确定要停止该服务吗？"
            onConfirm={() => handleStopService(record)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              icon={<StopOutlined />}
              size="small"
              disabled={record.status !== 'running'}
              loading={operationLoading[record.name]}
            >
              停止
            </Button>
          </Popconfirm>
          {record.pprofUrl && (
            <Dropdown 
              menu={getFlamegraphMenu(record.name)}
              disabled={record.status !== 'running'}
              trigger={['click']}
            >
              <Button 
                size="small"
                icon={<BarChartOutlined />}
                disabled={record.status !== 'running'}
                title="生成性能分析火焰图"
              >
                火焰图 <DownOutlined />
              </Button>
            </Dropdown>
          )}
        </Space>
      )
    }
  ];

  useEffect(() => {
    fetchServicesStatus();
  }, []);

  const runningServices = services.filter(s => s.status === 'running').length;
  const stoppedServices = services.filter(s => s.status === 'stopped').length;
  const unknownServices = services.filter(s => s.status === 'unknown').length;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>服务管理</h2>
        <Button 
          icon={<ReloadOutlined />} 
          onClick={fetchServicesStatus}
          loading={loading}
        >
          刷新状态
        </Button>
      </div>

      <Alert
        message="服务器信息"
        description={`IP: 47.242.170.252 | 用户: root | 当前有 ${runningServices} 个服务运行中，${stoppedServices} 个服务已停止，${unknownServices} 个服务状态未知`}
        type="info"
        style={{ marginBottom: 16 }}
      />

      <Card title="服务列表" style={{ marginBottom: 16 }}>
        <Table
          columns={columns}
          dataSource={services}
          rowKey="name"
          loading={loading}
          pagination={false}
          size="middle"
          scroll={{ x: 800 }}
        />
      </Card>

      <Divider />

      <Card title="批量操作" size="small">
        <Space>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={batchLoading}
            onClick={async () => {
              setBatchLoading(true);
              const stoppedServicesList = services.filter(s => s.status === 'stopped');
              let successCount = 0;
              
              for (const service of stoppedServicesList) {
                try {
                  const result = await startService(service);
                  if (result.success === true) {
                    successCount++;
                    setServices(prev => prev.map(s => 
                      s.name === service.name ? { ...s, status: 'running' } : s
                    ));
                  } else {
                    console.error(`Failed to start ${service.name}:`, result.message || 'Unknown error');
                  }
                } catch (error) {
                  console.error(`Failed to start ${service.name}:`, error);
                }
              }
              
              if (successCount > 0) {
                message.success(`成功启动 ${successCount} 个服务`);
                setTimeout(fetchServicesStatus, 2000);
              } else {
                message.error('没有服务启动成功');
              }
              setBatchLoading(false);
            }}
            disabled={stoppedServices === 0 || batchLoading}
          >
            启动所有停止的服务 ({stoppedServices})
          </Button>

          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={batchLoading}
            onClick={async () => {
              setBatchLoading(true);
              const allServicesList = services; // 重启所有服务，不管状态
              let successCount = 0;
              
              for (const service of allServicesList) {
                try {
                  const result = await restartService(service);
                  if (result.success === true) {
                    successCount++;
                    setServices(prev => prev.map(s => 
                      s.name === service.name ? { ...s, status: 'running' } : s
                    ));
                  } else {
                    console.error(`Failed to restart ${service.name}:`, result.message || 'Unknown error');
                  }
                } catch (error) {
                  console.error(`Failed to restart ${service.name}:`, error);
                }
              }
              
              if (successCount > 0) {
                message.success(`成功重启 ${successCount} 个服务`);
                setTimeout(fetchServicesStatus, 2000);
              } else {
                message.error('没有服务重启成功');
              }
              setBatchLoading(false);
            }}
            disabled={batchLoading}
          >
            重启所有服务 ({services.length})
          </Button>

          <Popconfirm
            title="确定要停止所有运行中的服务吗？"
            onConfirm={async () => {
              setBatchLoading(true);
              const runningServicesList = services.filter(s => s.status === 'running');
              let successCount = 0;
              
              for (const service of runningServicesList) {
                try {
                  const success = await stopService(service.name);
                  if (success) {
                    successCount++;
                    setServices(prev => prev.map(s => 
                      s.name === service.name ? { ...s, status: 'stopped' } : s
                    ));
                  }
                } catch (error) {
                  console.error(`Failed to stop ${service.name}:`, error);
                }
              }
              
              if (successCount > 0) {
                message.success(`成功停止 ${successCount} 个服务`);
                setTimeout(fetchServicesStatus, 2000);
              } else {
                message.error('没有服务停止成功');
              }
              setBatchLoading(false);
            }}
            okText="确定"
            cancelText="取消"
          >
            <Button
              danger
              icon={<StopOutlined />}
              loading={batchLoading}
              disabled={runningServices === 0 || batchLoading}
            >
              停止所有运行中的服务 ({runningServices})
            </Button>
          </Popconfirm>
        </Space>
      </Card>
    </div>
  );
};

export default ServiceManager;