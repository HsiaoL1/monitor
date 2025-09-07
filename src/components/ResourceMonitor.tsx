import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Spin, Alert, Divider, Button, Tag } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchSystemMetrics } from '../services/api';
import { ServiceMetrics } from '../types';

const ResourceMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<Record<string, ServiceMetrics>>({});
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllMetrics = async (isInitial = false) => {
    // 只在初次加载时显示全屏加载
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      console.log('Fetching system metrics...');
      const metricsData = await fetchSystemMetrics();
      console.log('Received metrics data:', metricsData);
      setMetrics(metricsData);
    } catch (err: any) {
      console.error('Failed to fetch system metrics:', err);
      setError('获取系统资源监控数据失败，请检查网络连接或服务器状态');
    } finally {
      setLoading(false);
      if (isInitial) {
        setInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAllMetrics(true);
    const interval = setInterval(() => fetchAllMetrics(false), 30000);
    return () => clearInterval(interval);
  }, []);

  const getStatusTag = (status: string, processes: number) => {
    switch (status) {
      case 'running':
        return <Tag color="green" icon={<PlayCircleOutlined />}>运行中 ({processes} 进程)</Tag>;
      case 'stopped':
        return <Tag color="red" icon={<StopOutlined />}>已停止</Tag>;
      default:
        return <Tag color="gray">状态未知</Tag>;
    }
  };

  const generateChartOption = (title: string, data: any[], unit: string) => ({
    title: {
      text: title,
      left: 'center',
      textStyle: { fontSize: 14 }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0];
        return `${item.name}: ${item.value}${unit}`;
      }
    },
    xAxis: {
      type: 'category',
      data: data.map(item => item.name),
      axisLabel: {
        rotate: 45,
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: `{value}${unit}`
      }
    },
    series: [{
      data: data.map(item => ({
        name: item.name,
        value: item.value,
        itemStyle: {
          color: item.status === 'running' ? '#52c41a' : item.status === 'stopped' ? '#ff4d4f' : '#d9d9d9'
        }
      })),
      type: 'bar',
      barWidth: '60%'
    }]
  });

  const runningServices = Object.values(metrics).filter(m => m.status === 'running').length;
  const stoppedServices = Object.values(metrics).filter(m => m.status === 'stopped').length;
  const totalServices = Object.keys(metrics).length;

  const chartData = Object.values(metrics).map(metric => ({
    name: metric.serviceName,
    status: metric.status
  }));

  const cpuData = chartData.map(item => ({
    ...item,
    value: metrics[item.name]?.cpu || 0
  }));

  const memoryData = chartData.map(item => ({
    ...item,
    value: metrics[item.name]?.memory || 0
  }));

  const processData = chartData.map(item => ({
    ...item,
    value: metrics[item.name]?.processes || 0
  }));

  if (initialLoading) {
    return <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: '50px' }} />;
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>系统资源监控</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={() => fetchAllMetrics(false)}
            loading={loading}
          >
            手动刷新
          </Button>
          <span style={{ color: '#666' }}>
            自动刷新间隔: 30秒
          </span>
        </div>
      </div>

      <Alert
        message="服务概览"
        description={`共 ${totalServices} 个服务，${runningServices} 个运行中，${stoppedServices} 个已停止`}
        type="info"
        style={{ marginBottom: 16 }}
      />

      {error && (
        <Alert
          message="数据获取失败"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {Object.values(metrics).map((metric) => (
          <Col xs={24} sm={12} md={8} lg={6} key={metric.serviceName}>
            <Card 
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>{metric.serviceName}</span>
                  {getStatusTag(metric.status, metric.processes)}
                </div>
              }
              size="small"
              className="service-card"
              style={{ 
                borderColor: metric.status === 'running' ? '#52c41a' : 
                           metric.status === 'stopped' ? '#ff4d4f' : '#d9d9d9',
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.3s ease'
              }}
            >
              {metric.status === 'stopped' ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
                  服务已停止运行
                </div>
              ) : metric.status === 'unknown' ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
                  无法获取服务状态
                </div>
              ) : (
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="CPU"
                      value={metric.cpu}
                      precision={2}
                      suffix="%"
                      className="metric-card"
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="内存"
                      value={metric.memory}
                      precision={1}
                      suffix="MB"
                      className="metric-card"
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="进程数"
                      value={metric.processes}
                      precision={0}
                      className="metric-card"
                    />
                  </Col>
                </Row>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Divider />

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          <Card title="CPU 使用率">
            <ReactECharts
              option={generateChartOption('CPU 使用率 (%)', cpuData, '%')}
              style={{ height: '300px' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="内存使用量">
            <ReactECharts
              option={generateChartOption('内存使用量 (MB)', memoryData, 'MB')}
              style={{ height: '300px' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card title="进程数量">
            <ReactECharts
              option={generateChartOption('进程数量', processData, '')}
              style={{ height: '300px' }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ResourceMonitor;