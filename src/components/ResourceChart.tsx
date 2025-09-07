import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Spin, Alert, Button, Select, Tag } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchResourceHistory } from '../services/api';
import { ResourceHistoryResponse, ServiceResourceHistory, ResourceDataPoint } from '../types';

const { Option } = Select;

const ResourceChart: React.FC = () => {
  const [historyData, setHistoryData] = useState<ResourceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoRefresh, setIsAutoRefresh] = useState(true);
  const [timeRange, setTimeRange] = useState<number>(60); // 默认60分钟
  const [intervalId, setIntervalId] = useState<NodeJS.Timeout | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  
  // 保存图表实例的引用
  const cpuChartRef = useRef<any>(null);
  const memoryChartRef = useRef<any>(null);
  const lastUpdateTime = useRef<string | null>(null);

  // 增量更新图表数据
  const updateChartsIncrementally = useCallback((newData: ResourceHistoryResponse) => {
    const services = Object.values(newData.services);
    const runningServices = services.filter(service => service.status === 'running');
    
    if (runningServices.length === 0) return;
    
    // 找到新的数据点（基于时间戳）
    const newTimePoints: string[] = [];
    const newDataPoints: {[serviceName: string]: {cpu: number[], memory: number[]}} = {};
    
    runningServices.forEach(service => {
      service.dataPoints.forEach(point => {
        if (!lastUpdateTime.current || point.timestampFormatted > lastUpdateTime.current) {
          if (!newTimePoints.includes(point.timestampFormatted)) {
            newTimePoints.push(point.timestampFormatted);
          }
          if (!newDataPoints[service.serviceName]) {
            newDataPoints[service.serviceName] = {cpu: [], memory: []};
          }
        }
      });
    });
    
    if (newTimePoints.length === 0) return;
    
    // 按时间戳排序新数据点
    newTimePoints.sort();
    
    // 为每个服务收集对应时间点的数据
    runningServices.forEach(service => {
      newTimePoints.forEach(timePoint => {
        const dataPoint = service.dataPoints.find(p => p.timestampFormatted === timePoint);
        if (dataPoint) {
          if (!newDataPoints[service.serviceName]) {
            newDataPoints[service.serviceName] = {cpu: [], memory: []};
          }
          newDataPoints[service.serviceName].cpu.push(dataPoint.cpu);
          newDataPoints[service.serviceName].memory.push(dataPoint.memory);
        }
      });
    });
    
    try {
      // 更新CPU图表
      if (cpuChartRef.current) {
        const cpuChart = cpuChartRef.current.getEchartsInstance();
        runningServices.forEach((service, seriesIndex) => {
          const serviceData = newDataPoints[service.serviceName];
          if (serviceData && serviceData.cpu.length > 0) {
            serviceData.cpu.forEach((cpuValue, dataIndex) => {
              const timePoint = newTimePoints[dataIndex];
              cpuChart.appendData({
                seriesIndex,
                data: [[timePoint, cpuValue]],
              });
            });
          }
        });
      }
      
      // 更新内存图表
      if (memoryChartRef.current) {
        const memoryChart = memoryChartRef.current.getEchartsInstance();
        runningServices.forEach((service, seriesIndex) => {
          const serviceData = newDataPoints[service.serviceName];
          if (serviceData && serviceData.memory.length > 0) {
            serviceData.memory.forEach((memoryValue, dataIndex) => {
              const timePoint = newTimePoints[dataIndex];
              memoryChart.appendData({
                seriesIndex,
                data: [[timePoint, memoryValue]],
              });
            });
          }
        });
      }
    } catch (error) {
      console.warn('Failed to append data to charts, falling back to full update:', error);
      // 如果增量更新失败，回退到完全更新
      setHistoryData(newData);
      return;
    }
    
    // 更新最后更新时间
    if (newTimePoints.length > 0) {
      lastUpdateTime.current = newTimePoints[newTimePoints.length - 1];
    }
    
    // 更新状态数据（用于状态显示）
    setHistoryData(newData);
  }, []);

  const fetchHistoryData = useCallback(async (isFullRefresh: boolean = false) => {
    setLoading(true);
    setError(null);

    try {
      console.log('Fetching resource history...');
      const data = await fetchResourceHistory(timeRange);
      console.log('Received history data:', data);
      
      if (isFullRefresh || isInitialLoad || !historyData) {
        // 初次加载或手动刷新时，完全更新数据
        setHistoryData(data);
        setIsInitialLoad(false);
        lastUpdateTime.current = null;
      } else {
        // 自动刷新时，只更新新的数据点
        updateChartsIncrementally(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch resource history:', err);
      setError('获取资源历史数据失败，请检查后端服务是否支持历史数据接口');
    } finally {
      setLoading(false);
    }
  }, [timeRange, historyData, isInitialLoad, updateChartsIncrementally]);

  useEffect(() => {
    setIsInitialLoad(true);
    fetchHistoryData(true); // 时间范围变更时完全刷新
  }, [timeRange]);

  useEffect(() => {
    if (isAutoRefresh) {
      const id = setInterval(() => fetchHistoryData(false), 10000); // 每10秒增量刷新
      setIntervalId(id);
      return () => clearInterval(id);
    } else if (intervalId) {
      clearInterval(intervalId);
      setIntervalId(null);
    }
  }, [isAutoRefresh, fetchHistoryData]);

  const toggleAutoRefresh = () => {
    setIsAutoRefresh(!isAutoRefresh);
  };
  
  const handleManualRefresh = () => {
    fetchHistoryData(true); // 手动刷新时完全重绘
  };

  const generateChartOption = (title: string, dataType: 'cpu' | 'memory') => {
    if (!historyData) return {};

    const services = Object.values(historyData.services);
    const runningServices = services.filter(service => service.status === 'running');
    
    // 获取所有时间点（使用第一个运行中的服务的时间点）
    const timePoints = runningServices.length > 0 ? 
      runningServices[0].dataPoints.map(point => point.timestampFormatted) : [];

    // 为每个服务创建数据系列
    const series = runningServices.map((service, index) => {
      const colors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f'];
      return {
        name: service.serviceName,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: colors[index % colors.length],
        },
        data: service.dataPoints.map(point => 
          dataType === 'cpu' ? point.cpu : point.memory
        ),
      };
    });

    return {
      title: {
        text: title,
        left: 'center',
        textStyle: { fontSize: 16 }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line'
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return '';
          const timeLabel = params[0].axisValueLabel;
          let result = `${timeLabel}<br/>`;
          params.forEach((param: any) => {
            const unit = dataType === 'cpu' ? '%' : 'MB';
            const value = param.value;
            result += `<span style="color:${param.color};">●</span> ${param.seriesName}: ${value}${unit}<br/>`;
          });
          return result;
        }
      },
      legend: {
        top: '8%',
        data: runningServices.map(service => service.serviceName),
        type: 'scroll',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '8%',
        top: '18%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: timePoints,
        axisLabel: {
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: `{value}${dataType === 'cpu' ? '%' : 'MB'}`
        }
      },
      series: series,
      animation: false, // 禁用动画以提高增量更新性能
    };
  };

  const runningServicesCount = historyData ? 
    Object.values(historyData.services).filter(s => s.status === 'running').length : 0;

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>服务资源曲线图</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Select 
            value={timeRange} 
            onChange={setTimeRange}
            style={{ width: 120 }}
          >
            <Option value={30}>30分钟</Option>
            <Option value={60}>1小时</Option>
            <Option value={180}>3小时</Option>
            <Option value={360}>6小时</Option>
            <Option value={720}>12小时</Option>
            <Option value={1440}>24小时</Option>
          </Select>
          <Button 
            icon={isAutoRefresh ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
            onClick={toggleAutoRefresh}
            type={isAutoRefresh ? 'primary' : 'default'}
          >
            {isAutoRefresh ? '暂停自动刷新' : '开始自动刷新'}
          </Button>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={handleManualRefresh}
            loading={loading}
          >
            手动刷新
          </Button>
          {isAutoRefresh && (
            <span style={{ color: '#666' }}>
              自动刷新间隔: 10秒
            </span>
          )}
        </div>
      </div>

      <Alert
        message="数据概览"
        description={
          historyData ? 
          `时间范围: ${new Date(historyData.timeRange.start).toLocaleString()} - ${new Date(historyData.timeRange.end).toLocaleString()}，共 ${runningServicesCount} 个运行中服务` :
          '暂无数据'
        }
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

      {loading && Object.keys(historyData?.services || {}).length === 0 ? (
        <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: '50px' }} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card title="CPU 使用率趋势" loading={loading}>
              <ReactECharts
                ref={cpuChartRef}
                option={generateChartOption('CPU 使用率 (%)', 'cpu')}
                style={{ height: '400px' }}
                showLoading={loading}
              />
            </Card>
          </Col>
          <Col span={24}>
            <Card title="内存使用量趋势" loading={loading}>
              <ReactECharts
                ref={memoryChartRef}
                option={generateChartOption('内存使用量 (MB)', 'memory')}
                style={{ height: '400px' }}
                showLoading={loading}
              />
            </Card>
          </Col>
        </Row>
      )}

      {historyData && (
        <div style={{ marginTop: 16 }}>
          <Card title="服务状态" size="small">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.values(historyData.services).map(service => (
                <Tag
                  key={service.serviceName}
                  color={service.status === 'running' ? 'green' : service.status === 'stopped' ? 'red' : 'gray'}
                  icon={service.status === 'running' ? <PlayCircleOutlined /> : undefined}
                >
                  {service.serviceName} ({service.status === 'running' ? '运行中' : service.status === 'stopped' ? '已停止' : '未知'})
                </Tag>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ResourceChart;