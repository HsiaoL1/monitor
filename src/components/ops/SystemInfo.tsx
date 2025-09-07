import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Progress, Table, Tag, Button, Spin } from 'antd';
import { ReloadOutlined, DesktopOutlined, DatabaseOutlined, CloudServerOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchRealSystemInfo } from '../../services/api';

interface SystemStats {
  cpu: {
    usage: number;
    cores: number;
    model: string;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  uptime: number;
  loadAverage: number[];
}

interface ProcessInfo {
  pid: number;
  name: string;
  cpu: number;
  memory: number;
  status: string;
}

const SystemInfo: React.FC = () => {
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSystemInfo = async () => {
    setLoading(true);
    try {
      console.log('Fetching real system information...');
      
      const realSystemInfo = await fetchRealSystemInfo();
      console.log('Received system info:', realSystemInfo);
      
      if (realSystemInfo) {
        setSystemStats(realSystemInfo);
        setProcesses(realSystemInfo.processes || []);
      } else {
        throw new Error('No system information received');
      }
      
    } catch (error: any) {
      console.error('Failed to fetch real system info:', error);
      
      // 显示错误状态但不阻塞界面
      const errorStats: SystemStats = {
        cpu: { usage: 0, cores: 0, model: '获取失败' },
        memory: { total: 0, used: 0, free: 0, usage: 0 },
        disk: { total: 0, used: 0, free: 0, usage: 0 },
        network: { bytesIn: 0, bytesOut: 0 },
        uptime: 0,
        loadAverage: [0, 0, 0]
      };
      
      setSystemStats(errorStats);
      setProcesses([{
        pid: 0,
        name: `系统信息获取失败: ${error.message}`,
        cpu: 0,
        memory: 0,
        status: 'error'
      }]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystemInfo();
    const interval = setInterval(fetchSystemInfo, 30000);
    return () => clearInterval(interval);
  }, []);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}天 ${hours}小时 ${mins}分钟`;
  };

  const cpuChartOption = {
    title: {
      text: 'CPU 使用率',
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    series: [{
      type: 'gauge',
      radius: '80%',
      axisLine: {
        lineStyle: {
          width: 20,
          color: [
            [0.3, '#67e0e3'],
            [0.7, '#37a2da'],
            [1, '#fd666d']
          ]
        }
      },
      pointer: {
        itemStyle: {
          color: 'inherit'
        }
      },
      axisTick: {
        distance: -20,
        length: 8,
        lineStyle: {
          color: '#fff',
          width: 2
        }
      },
      splitLine: {
        distance: -20,
        length: 20,
        lineStyle: {
          color: '#fff',
          width: 4
        }
      },
      axisLabel: {
        color: 'inherit',
        distance: 30,
        fontSize: 12
      },
      detail: {
        valueAnimation: true,
        formatter: '{value}%',
        color: 'inherit',
        fontSize: 16
      },
      data: [{ value: systemStats?.cpu.usage?.toFixed(1) || 0 }]
    }]
  };

  const processColumns = [
    {
      title: 'PID',
      dataIndex: 'pid',
      key: 'pid',
      width: 80
    },
    {
      title: '进程名',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => <strong>{name}</strong>
    },
    {
      title: 'CPU %',
      dataIndex: 'cpu',
      key: 'cpu',
      width: 100,
      render: (cpu: number) => `${cpu.toFixed(1)}%`,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.cpu - b.cpu
    },
    {
      title: '内存 (MB)',
      dataIndex: 'memory',
      key: 'memory',
      width: 120,
      render: (memory: number) => `${memory.toFixed(1)} MB`,
      sorter: (a: ProcessInfo, b: ProcessInfo) => a.memory - b.memory
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={status === 'running' ? 'green' : status === 'sleeping' ? 'blue' : 'default'}>
          {status}
        </Tag>
      )
    }
  ];

  if (loading && !systemStats) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3>系统信息监控</h3>
        <Button icon={<ReloadOutlined />} onClick={fetchSystemInfo} loading={loading}>
          刷新
        </Button>
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="系统运行时间"
              value={systemStats ? formatUptime(systemStats.uptime) : '-'}
              prefix={<DesktopOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="CPU 核心数"
              value={systemStats?.cpu.cores || 0}
              prefix={<DesktopOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="负载平均值"
              value={systemStats?.loadAverage[0]?.toFixed(2) || '-'}
              prefix={<CloudServerOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="活跃进程"
              value={processes.filter(p => p.status === 'running').length}
              prefix={<DatabaseOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card title="CPU 使用率" size="small">
            <ReactECharts option={cpuChartOption} style={{ height: '200px' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card title="内存使用情况" size="small">
            <div style={{ padding: '20px 0' }}>
              <Progress
                type="circle"
                percent={systemStats?.memory.usage || 0}
                format={() => `${(systemStats?.memory.usage || 0).toFixed(1)}%`}
                size={120}
              />
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div>已使用: {formatBytes((systemStats?.memory.used || 0) * 1024 * 1024)}</div>
                <div>总计: {formatBytes((systemStats?.memory.total || 0) * 1024 * 1024)}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card title="磁盘使用情况" size="small">
            <div style={{ padding: '20px 0' }}>
              <Progress
                type="circle"
                percent={systemStats?.disk.usage || 0}
                format={() => `${(systemStats?.disk.usage || 0).toFixed(1)}%`}
                size={120}
              />
              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <div>已使用: {(systemStats?.disk.used || 0).toFixed(1)} GB</div>
                <div>总计: {(systemStats?.disk.total || 0).toFixed(1)} GB</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      <Card title="进程列表" size="small">
        <Table
          columns={processColumns}
          dataSource={processes}
          rowKey="pid"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false }}
          loading={loading}
        />
      </Card>
    </div>
  );
};

export default SystemInfo;