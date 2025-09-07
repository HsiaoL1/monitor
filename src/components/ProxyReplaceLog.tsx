import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  DatePicker,
  Space,
  message,
  Tag,
  Alert,
  Statistic,
  Row,
  Col,
  Tooltip,
  Typography,
  Descriptions,
  Modal
} from 'antd';
import {
  ReloadOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  EyeOutlined,
  GlobalOutlined,
  HistoryOutlined
} from '@ant-design/icons';
import { fetchProxyReplaceLog, downloadReplaceLog } from '../services/api';
import { ProxyReplaceLogEntry } from '../types';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text, Title } = Typography;

interface ProxyReplaceLogResponse {
  success: boolean;
  logs: ProxyReplaceLogEntry[];
  totalRecords: number;
  successCount: number;
  failureCount: number;
  dateRange: {
    start: string;
    end: string;
  };
}

const ProxyReplaceLog: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState<ProxyReplaceLogResponse | null>(null);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(7, 'day'),
    dayjs()
  ]);
  const [selectedRecord, setSelectedRecord] = useState<ProxyReplaceLogEntry | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      
      const result = await fetchProxyReplaceLog({ startDate, endDate });
      if (result.success) {
        setData(result);
      } else {
        message.error('获取代理更换日志失败');
      }
    } catch (error: any) {
      message.error('获取代理更换日志失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const startDate = dateRange[0].format('YYYY-MM-DD');
      const endDate = dateRange[1].format('YYYY-MM-DD');
      
      await downloadReplaceLog({ startDate, endDate });
      message.success('日志导出成功');
    } catch (error: any) {
      message.error('导出失败: ' + error.message);
    } finally {
      setDownloading(false);
    }
  };

  const showDetail = (record: ProxyReplaceLogEntry) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  useEffect(() => {
    fetchLogs();
  }, [dateRange]);

  const getStatusTag = (success: boolean) => {
    return success ? (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        成功
      </Tag>
    ) : (
      <Tag color="error" icon={<CloseCircleOutlined />}>
        失败
      </Tag>
    );
  };

  const columns = [
    {
      title: '更换时间',
      dataIndex: 'replaceTime',
      key: 'replaceTime',
      width: 180,
      render: (time: string) => new Date(time).toLocaleString(),
      sorter: (a: ProxyReplaceLogEntry, b: ProxyReplaceLogEntry) =>
        new Date(a.replaceTime).getTime() - new Date(b.replaceTime).getTime(),
      defaultSortOrder: 'descend' as any,
    },
    {
      title: '原代理',
      key: 'oldProxy',
      width: 200,
      render: (record: ProxyReplaceLogEntry) => (
        <div>
          <div>
            <strong>{record.oldProxy.ip}:{record.oldProxy.port}</strong>
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            ID: {record.oldProxy.id} | 商户: {record.oldProxy.merchant_id}
          </div>
        </div>
      ),
    },
    {
      title: '新代理',
      key: 'newProxy',
      width: 200,
      render: (record: ProxyReplaceLogEntry) => (
        <div>
          <div>
            <strong>{record.newProxy.ip}:{record.newProxy.port}</strong>
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            ID: {record.newProxy.id} | 商户: {record.newProxy.merchant_id}
          </div>
        </div>
      ),
    },
    {
      title: '状态',
      key: 'success',
      width: 100,
      render: (record: ProxyReplaceLogEntry) => getStatusTag(record.success),
      filters: [
        { text: '成功', value: true },
        { text: '失败', value: false },
      ],
      onFilter: (value: boolean | React.Key, record: ProxyReplaceLogEntry) =>
        record.success === value,
    },
    {
      title: '影响设备数',
      dataIndex: 'devicesCount',
      key: 'devicesCount',
      width: 120,
      render: (count: number) => (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{count}</div>
          <div style={{ fontSize: '12px', color: '#888' }}>个设备</div>
        </div>
      ),
      sorter: (a: ProxyReplaceLogEntry, b: ProxyReplaceLogEntry) => a.devicesCount - b.devicesCount,
    },
    {
      title: '执行者',
      dataIndex: 'operator',
      key: 'operator',
      width: 120,
      render: (operator: string) => operator || '系统',
    },
    {
      title: '更换原因',
      key: 'reason',
      width: 200,
      render: (record: ProxyReplaceLogEntry) => (
        <div>
          <div>{record.reason || '-'}</div>
          {!record.success && record.errorMessage && (
            <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: 4 }}>
              {record.errorMessage}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (record: ProxyReplaceLogEntry) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showDetail(record)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <SwapOutlined />
          代理更换记录
        </Space>
      }
      extra={
        <Space>
          <RangePicker
            value={dateRange}
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setDateRange([dates[0], dates[1]]);
              }
            }}
            format="YYYY-MM-DD"
            allowClear={false}
          />
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchLogs}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            loading={downloading}
          >
            导出日志
          </Button>
        </Space>
      }
    >
      {data && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic
                title="总记录数"
                value={data.totalRecords}
                prefix={<HistoryOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="成功次数"
                value={data.successCount}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="失败次数"
                value={data.failureCount}
                valueStyle={{ color: '#cf1322' }}
                prefix={<CloseCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="成功率"
                value={data.totalRecords > 0 ? ((data.successCount / data.totalRecords) * 100).toFixed(1) : '0'}
                suffix="%"
                valueStyle={{
                  color: data.totalRecords > 0 && data.successCount / data.totalRecords >= 0.9 ? '#3f8600' : '#cf1322'
                }}
              />
            </Col>
          </Row>

          {data.failureCount > 0 && (
            <Alert
              message="发现失败记录"
              description={`共有 ${data.failureCount} 次代理更换失败，请关注相关错误信息`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            dataSource={data.logs}
            columns={columns}
            rowKey={(record) => `${record.replaceTime}-${record.oldProxy.id}-${record.newProxy.id}`}
            loading={loading}
            pagination={{
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
              pageSize: 20,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
            scroll={{ x: 1200 }}
          />
        </>
      )}

      <Modal
        title="代理更换详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
      >
        {selectedRecord && (
          <Descriptions title="更换记录详情" bordered size="small">
            <Descriptions.Item label="更换时间" span={3}>
              {new Date(selectedRecord.replaceTime).toLocaleString()}
            </Descriptions.Item>
            <Descriptions.Item label="更换状态" span={1}>
              {getStatusTag(selectedRecord.success)}
            </Descriptions.Item>
            <Descriptions.Item label="影响设备数" span={1}>
              {selectedRecord.devicesCount} 个
            </Descriptions.Item>
            <Descriptions.Item label="执行者" span={1}>
              {selectedRecord.operator || '系统'}
            </Descriptions.Item>
            <Descriptions.Item label="更换原因" span={3}>
              {selectedRecord.reason || '-'}
            </Descriptions.Item>
            {!selectedRecord.success && selectedRecord.errorMessage && (
              <Descriptions.Item label="错误信息" span={3}>
                <Text type="danger">{selectedRecord.errorMessage}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="原代理信息" span={3}>
              <div>
                <GlobalOutlined /> {selectedRecord.oldProxy.ip}:{selectedRecord.oldProxy.port}
                <br />
                ID: {selectedRecord.oldProxy.id}, 商户ID: {selectedRecord.oldProxy.merchant_id}
              </div>
            </Descriptions.Item>
            <Descriptions.Item label="新代理信息" span={3}>
              <div>
                <GlobalOutlined /> {selectedRecord.newProxy.ip}:{selectedRecord.newProxy.port}
                <br />
                ID: {selectedRecord.newProxy.id}, 商户ID: {selectedRecord.newProxy.merchant_id}
              </div>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </Card>
  );
};

export default ProxyReplaceLog;