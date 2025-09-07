import React, { useState, useEffect, useRef } from 'react';
import { 
  Card, 
  Select, 
  Button, 
  Typography,
  Row,
  Col,
  Alert,
  Spin
} from 'antd';
import { 
  ReloadOutlined 
} from '@ant-design/icons';
import { services } from '../../config/services';
import { fetchRealLogs } from '../../services/api';

const { Option } = Select;
const { Text } = Typography;

const LogViewer: React.FC = () => {
  const [selectedService, setSelectedService] = useState<string>('');
  const [logLines, setLogLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [logPath, setLogPath] = useState<string>('');

  const logContainerRef = useRef<HTMLDivElement>(null);

  // 获取服务的run.log文件内容
  const fetchLogs = async (serviceName: string) => {
    setLoading(true);
    try {
      console.log(`Fetching run.log for service: ${serviceName}`);
      
      const response = await fetchRealLogs(serviceName, 100);
      console.log(`Received log response:`, response);
      
      setLogPath(response.logPath || '');
      setLogLines(response.lines || []);
      
    } catch (error: any) {
      console.error('Failed to fetch logs:', error);
      setLogLines([`获取日志失败: ${error.message || '网络错误'}`]);
      setLogPath('');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceChange = (serviceName: string) => {
    setSelectedService(serviceName);
    if (serviceName) {
      fetchLogs(serviceName);
    } else {
      setLogLines([]);
      setLogPath('');
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logLines]);

  return (
    <Card 
      title="服务日志查看器"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, padding: 0 }}
    >
      <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
        <Row gutter={16} align="middle">
          <Col span={8}>
            <Select
              placeholder="选择服务"
              value={selectedService}
              onChange={handleServiceChange}
              style={{ width: '100%' }}
            >
              {services.map(service => (
                <Option key={service.name} value={service.name}>
                  {service.name}
                </Option>
              ))}
            </Select>
          </Col>
          
          <Col span={4}>
            <Button 
              icon={<ReloadOutlined />} 
              onClick={() => selectedService && fetchLogs(selectedService)}
              loading={loading}
            >
              刷新
            </Button>
          </Col>
          
          <Col span={12}>
            <Text type="secondary">
              {logPath && `日志文件: ${logPath}`}
              {logLines.length > 0 && ` (${logLines.length} 行)`}
            </Text>
          </Col>
        </Row>
      </div>

      <div 
        ref={logContainerRef}
        style={{ 
          flex: 1, 
          padding: '16px',
          overflow: 'auto',
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '12px',
          whiteSpace: 'pre-wrap'
        }}
      >
        {!selectedService ? (
          <Alert
            message="请选择要查看日志的服务"
            type="info"
            showIcon
            style={{ margin: '50px 0' }}
          />
        ) : loading ? (
          <div style={{ textAlign: 'center', padding: '50px' }}>
            <Spin size="large" />
          </div>
        ) : logLines.length === 0 ? (
          <Alert
            message="暂无日志数据"
            description={`服务 ${selectedService} 的日志文件为空或不存在`}
            type="warning"
            showIcon
            style={{ margin: '50px 0' }}
          />
        ) : (
          <div>
            {logLines.map((line, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};

export default LogViewer;