import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Row, Col, Spin, Alert, Button, Select, Tag } from 'antd';
import { ReloadOutlined, PlayCircleOutlined, PauseCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchResourceHistory } from '../services/api';
import { ResourceHistoryResponse } from '../types';

const { Option } = Select;

const ResourceChart: React.FC = () => {
  const [historyData, setHistoryData] = useState<ResourceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
    
    if (runningServices.length === 0) {
      // 如果没有运行中的服务，直接更新数据
      setHistoryData(newData);
      return;
    }
    
    // 获取当前图表实例
    const cpuChart = cpuChartRef.current?.getEchartsInstance();
    const memoryChart = memoryChartRef.current?.getEchartsInstance();
    
    if (!cpuChart || !memoryChart) {
      // 如果图表还未初始化，直接更新数据
      setHistoryData(newData);
      return;
    }
    
    // 找到新的数据点（基于时间戳）
    const allNewTimePoints: string[] = [];
    const newDataPoints: {[serviceName: string]: {cpu: number[], memory: number[], times: string[]}} = {};
    
    // 收集所有新的时间点
    runningServices.forEach(service => {
      service.dataPoints.forEach(point => {
        if (!lastUpdateTime.current || point.timestampFormatted > lastUpdateTime.current) {
          if (!allNewTimePoints.includes(point.timestampFormatted)) {
            allNewTimePoints.push(point.timestampFormatted);
          }
        }
      });
    });
    
    if (allNewTimePoints.length === 0) {
      // 没有新数据点，只更新状态数据
      setHistoryData(newData);
      return;
    }
    
    // 按时间戳排序
    allNewTimePoints.sort();
    
    // 为每个服务收集新的数据点
    runningServices.forEach(service => {
      const serviceNewData = {cpu: [] as number[], memory: [] as number[], times: [] as string[]};
      
      allNewTimePoints.forEach(timePoint => {
        const dataPoint = service.dataPoints.find(p => p.timestampFormatted === timePoint);
        if (dataPoint) {
          serviceNewData.cpu.push(dataPoint.cpu);
          serviceNewData.memory.push(dataPoint.memory);
          serviceNewData.times.push(timePoint);
        } else {
          // 如果某个时间点没有数据，用null填充
          serviceNewData.cpu.push(null as any);
          serviceNewData.memory.push(null as any);
          serviceNewData.times.push(timePoint);
        }
      });
      
      if (serviceNewData.times.length > 0) {
        newDataPoints[service.serviceName] = serviceNewData;
      }
    });
    
    try {
      // 批量更新CPU图表
      const currentCpuOptions = cpuChart.getOption();
      const currentCpuSeries = currentCpuOptions.series || [];
      
      runningServices.forEach((service, seriesIndex) => {
        const serviceData = newDataPoints[service.serviceName];
        if (serviceData && serviceData.cpu.length > 0 && seriesIndex < currentCpuSeries.length) {
          // 构建新的数据点数组
          const newDataPoints = serviceData.times.map((time, index) => [time, serviceData.cpu[index]]).filter(point => point[1] !== null);
          
          if (newDataPoints.length > 0) {
            cpuChart.appendData({
              seriesIndex,
              data: newDataPoints,
            });
          }
        }
      });
      
      // 批量更新内存图表
      const currentMemoryOptions = memoryChart.getOption();
      const currentMemorySeries = currentMemoryOptions.series || [];
      
      runningServices.forEach((service, seriesIndex) => {
        const serviceData = newDataPoints[service.serviceName];
        if (serviceData && serviceData.memory.length > 0 && seriesIndex < currentMemorySeries.length) {
          // 构建新的数据点数组
          const newDataPoints = serviceData.times.map((time, index) => [time, serviceData.memory[index]]).filter(point => point[1] !== null);
          
          if (newDataPoints.length > 0) {
            memoryChart.appendData({
              seriesIndex,
              data: newDataPoints,
            });
          }
        }
      });
      
      // 更新最后更新时间
      lastUpdateTime.current = allNewTimePoints[allNewTimePoints.length - 1];
      
    } catch (error) {
      console.warn('Incremental chart update failed, falling back to full update:', error);
      // 如果增量更新失败，回退到完全更新
      lastUpdateTime.current = null; // 重置时间戳
      setHistoryData(newData);
      return;
    }
    
    // 更新状态数据（用于状态显示和其他UI元素）
    setHistoryData(newData);
  }, []);

  const fetchHistoryData = useCallback(async (isFullRefresh: boolean = false) => {
    if (isFullRefresh || isInitialLoad || !historyData) {
      setLoading(true);
    } else {
      setIsRefreshing(true);
    }
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
      setIsRefreshing(false);
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
        animationDelay: (idx: number) => idx * 50, // 逐个显示动画
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3,
          }
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
      animation: true, // 启用平滑动画
      animationDuration: 300, // 动画持续时间
      animationEasing: 'cubicOut', // 缓动效果
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

      {loading && !historyData ? (
        <Spin size="large" style={{ display: 'block', textAlign: 'center', marginTop: '50px' }} />
      ) : (
        <Row gutter={[16, 16]}>
          <Col span={24}>
            <Card 
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>CPU 使用率趋势</span>
                  {isRefreshing && (
                    <span style={{ fontSize: 12, color: '#1890ff' }}>
                      <ReloadOutlined spin /> 更新中...
                    </span>
                  )}
                </div>
              }
              loading={loading && !historyData}
            >
              <ReactECharts
                ref={cpuChartRef}
                option={generateChartOption('CPU 使用率 (%)', 'cpu')}
                style={{ 
                  height: '400px',
                  transition: 'opacity 0.3s ease',
                  opacity: isRefreshing ? 0.9 : 1
                }}
                showLoading={loading && !historyData}
                notMerge={false}
                lazyUpdate={true}
              />
            </Card>
          </Col>
          <Col span={24}>
            <Card 
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>内存使用量趋势</span>
                  {isRefreshing && (
                    <span style={{ fontSize: 12, color: '#1890ff' }}>
                      <ReloadOutlined spin /> 更新中...
                    </span>
                  )}
                </div>
              }
              loading={loading && !historyData}
            >
              <ReactECharts
                ref={memoryChartRef}
                option={generateChartOption('内存使用量 (MB)', 'memory')}
                style={{ 
                  height: '400px',
                  transition: 'opacity 0.3s ease',
                  opacity: isRefreshing ? 0.9 : 1
                }}
                showLoading={loading && !historyData}
                notMerge={false}
                lazyUpdate={true}
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