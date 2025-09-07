import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  message, 
  Tag, 
  Row, 
  Col,
  Statistic,
  Alert,
  Input,
  Select,
  DatePicker,
  Typography,
  Tooltip
} from 'antd';
import { 
  ReloadOutlined, 
  HistoryOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SyncOutlined,
  SearchOutlined,
  CalendarOutlined,
  DownloadOutlined,
  UserOutlined
} from '@ant-design/icons';
import { fetchAccountSyncLog, downloadAccountSyncLog } from '../services/api';
import { AccountSyncLogEntry } from '../types';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Text } = Typography;
const { RangePicker } = DatePicker;

const AccountSyncLog: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    totalRecords: number;
    successCount: number;
    failureCount: number;
    singleSyncCount: number;
    batchSyncCount: number;
    logs: AccountSyncLogEntry[];
    timeRange: {
      start: string;
      end: string;
    };
  } | null>(null);
  
  // 搜索和分页状态
  const [searchAccount, setSearchAccount] = useState<string>('');
  const [searchMerchantId, setSearchMerchantId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failure'>('all');
  const [syncTypeFilter, setSyncTypeFilter] = useState<'all' | 'single' | 'batch'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 过滤和排序数据
  const filteredData = useMemo(() => {
    if (!data?.logs) return [];
    
    let filtered = data.logs.filter(log => {
      const accountMatch = !searchAccount || 
        log.accountInfo.account.toLowerCase().includes(searchAccount.toLowerCase()) ||
        log.accountInfo.app_unique_id.toLowerCase().includes(searchAccount.toLowerCase());
      
      const merchantMatch = !searchMerchantId || 
        log.accountInfo.merchant_id.toString().includes(searchMerchantId);
      
      const statusMatch = statusFilter === 'all' || 
        (statusFilter === 'success' && log.success) ||
        (statusFilter === 'failure' && !log.success);
      
      const syncTypeMatch = syncTypeFilter === 'all' || log.syncType === syncTypeFilter;
      
      return accountMatch && merchantMatch && statusMatch && syncTypeMatch;
    });

    // 按同步时间排序（最新的在前）
    filtered.sort((a, b) => new Date(b.syncTime).getTime() - new Date(a.syncTime).getTime());
    
    return filtered;
  }, [data?.logs, searchAccount, searchMerchantId, statusFilter, syncTypeFilter]);

  // 获取日志数据
  const fetchLogs = async (startDate?: string, endDate?: string) => {
    setLoading(true);
    try {
      const params: { startDate?: string; endDate?: string } = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      
      const response = await fetchAccountSyncLog(params);
      
      // 解构后端返回的数据结构
      const processedData = {
        logs: response.logs || [],
        totalRecords: response.statistics?.totalRecords || 0,
        successCount: response.statistics?.successCount || 0,
        failureCount: response.statistics?.failureCount || 0,
        singleSyncCount: response.statistics?.singleSyncCount || 0,
        batchSyncCount: response.statistics?.batchSyncCount || 0,
        timeRange: response.timeRange || { start: '', end: '' }
      };
      
      setData(processedData);
      message.success(`加载了 ${processedData.totalRecords} 条同步记录`);
    } catch (error: any) {
      console.error('Failed to fetch account sync logs:', error);
      message.error('获取账号同步日志失败: ' + (error?.message || '网络错误'));
    } finally {
      setLoading(false);
    }
  };

  // 下载日志
  const handleDownload = async () => {
    try {
      message.info('开始准备下载文件...');
      const params: { startDate?: string; endDate?: string } = {};
      
      if (dateRange) {
        params.startDate = dateRange[0].toISOString();
        params.endDate = dateRange[1].toISOString();
      }
      
      const blob = await downloadAccountSyncLog(params);
      const url = window.URL.createObjectURL(new Blob([JSON.stringify(blob, null, 2)]));
      const link = document.createElement('a');
      link.href = url;
      
      const startStr = dateRange ? dateRange[0].format('YYYY-MM-DD') : dayjs().subtract(30, 'day').format('YYYY-MM-DD');
      const endStr = dateRange ? dateRange[1].format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD');
      link.setAttribute('download', `account_sync_log_${startStr}_to_${endStr}.json`);
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      message.success('日志下载成功');
    } catch (error: any) {
      console.error('Failed to download account sync logs:', error);
      message.error('下载日志失败: ' + (error?.message || '网络错误'));
    }
  };

  // 处理日期范围变化
  const handleDateRangeChange = (dates: any) => {
    setDateRange(dates);
    if (dates && dates.length === 2) {
      fetchLogs(dates[0].toISOString(), dates[1].toISOString());
    } else {
      fetchLogs(); // 使用默认时间范围
    }
  };

  // 重置搜索条件
  const handleReset = () => {
    setSearchAccount('');
    setSearchMerchantId('');
    setStatusFilter('all');
    setSyncTypeFilter('all');
    setCurrentPage(1);
    setDateRange(null);
    fetchLogs();
  };

  // 页面加载时获取数据
  useEffect(() => {
    fetchLogs();
  }, []);

  const getStatusTag = (success: boolean) => {
    return success ? (
      <Tag color="success" icon={<CheckCircleOutlined />}>
        成功
      </Tag>
    ) : (
      <Tag color="error" icon={<ExclamationCircleOutlined />}>
        失败
      </Tag>
    );
  };

  const getSyncTypeTag = (syncType: string) => {
    return syncType === 'single' ? (
      <Tag color="blue" icon={<UserOutlined />}>
        单个同步
      </Tag>
    ) : (
      <Tag color="purple" icon={<SyncOutlined />}>
        批量同步
      </Tag>
    );
  };

  const getStatusChangeTag = (beforeStatus: number, afterStatus: number) => {
    const getStatusText = (status: number) => {
      switch (status) {
        case 0: return '离线';
        case 1: return '在线';
        case 2: return '上线中';
        case 3: return '下线中';
        default: return '未知';
      }
    };

    const getStatusColor = (status: number) => {
      switch (status) {
        case 0: return '#ff4d4f'; // 红色
        case 1: return '#52c41a'; // 绿色
        case 2: return '#faad14'; // 橙色
        case 3: return '#faad14'; // 橙色
        default: return '#d9d9d9'; // 灰色
      }
    };

    return (
      <Space size={4}>
        <Tag color={getStatusColor(beforeStatus)}>{getStatusText(beforeStatus)}</Tag>
        <Text type="secondary">→</Text>
        <Tag color={getStatusColor(afterStatus)}>{getStatusText(afterStatus)}</Tag>
      </Space>
    );
  };

  const columns = [
    {
      title: '同步时间',
      dataIndex: 'syncTime',
      key: 'syncTime',
      width: 180,
      render: (syncTime: string) => {
        const date = dayjs(syncTime);
        return (
          <Tooltip title={date.format('YYYY-MM-DD HH:mm:ss')}>
            <Space direction="vertical" size={0}>
              <Text strong>{date.format('MM-DD HH:mm')}</Text>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                {date.fromNow()}
              </Text>
            </Space>
          </Tooltip>
        );
      }
    },
    {
      title: '账号信息',
      key: 'accountInfo',
      width: 250,
      render: (record: AccountSyncLogEntry) => (
        <Space direction="vertical" size={0}>
          <Text strong>{record.accountInfo.account}</Text>
          <Text type="secondary" copyable style={{ fontSize: '12px' }}>
            {record.accountInfo.app_unique_id}
          </Text>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            商户ID: {record.accountInfo.merchant_id}
          </Text>
        </Space>
      )
    },
    {
      title: '同步类型',
      dataIndex: 'syncType',
      key: 'syncType',
      width: 120,
      render: (syncType: string) => getSyncTypeTag(syncType)
    },
    {
      title: '状态变化',
      key: 'statusChange',
      width: 150,
      render: (record: AccountSyncLogEntry) => getStatusChangeTag(record.beforeStatus, record.afterStatus)
    },
    {
      title: '结果',
      dataIndex: 'success',
      key: 'success',
      width: 80,
      render: (success: boolean) => getStatusTag(success)
    },
    {
      title: '同步原因',
      dataIndex: 'reason',
      key: 'reason',
      width: 200,
      render: (reason: string) => (
        <Tooltip title={reason}>
          <Text ellipsis style={{ maxWidth: 180 }}>
            {reason}
          </Text>
        </Tooltip>
      )
    },
    {
      title: '操作员',
      key: 'operator',
      width: 120,
      render: (record: AccountSyncLogEntry) => (
        <Space direction="vertical" size={0}>
          <Text>{record.operator || '系统'}</Text>
          <Tag color={record.operatorType === 'manual' ? 'blue' : 'green'}>
            {record.operatorType === 'manual' ? '手动' : '自动'}
          </Tag>
        </Space>
      )
    }
  ];

  // 如果有错误信息，显示在展开行中
  const expandedRowRender = (record: AccountSyncLogEntry) => {
    if (!record.errorMessage && record.success) return null;
    
    return (
      <Card size="small" style={{ margin: '8px 0' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text strong>详细信息:</Text>
          {!record.success && record.errorMessage && (
            <Alert
              message="错误信息"
              description={record.errorMessage}
              type="error"
              showIcon
              style={{ marginBottom: 8 }}
            />
          )}
          <Text type="secondary">
            平台ID: {record.accountInfo.platform_id} | 
            账号数量: {record.accountsCount} | 
            同步时间: {dayjs(record.syncTime).format('YYYY-MM-DD HH:mm:ss')}
          </Text>
        </Space>
      </Card>
    );
  };

  return (
    <div>
      {/* 标题区域 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Card>
            <Space align="center">
              <HistoryOutlined style={{ fontSize: 24, color: '#1890ff' }} />
              <div>
                <Text strong style={{ fontSize: 18 }}>账号同步记录</Text>
                <br />
                <Text type="secondary">查看和管理账号状态同步操作日志</Text>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 统计信息 */}
      {data && (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="总记录数"
                value={data.totalRecords}
                prefix={<HistoryOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="成功同步"
                value={data.successCount}
                valueStyle={{ color: '#3f8600' }}
                prefix={<CheckCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="失败同步"
                value={data.failureCount}
                valueStyle={{ color: '#cf1322' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="单个同步"
                value={data.singleSyncCount}
                prefix={<UserOutlined />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* 搜索和筛选 */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[16, 16]}>
          <Col span={6}>
            <Input
              placeholder="搜索账号或AppUniqueID"
              prefix={<SearchOutlined />}
              value={searchAccount}
              onChange={(e) => setSearchAccount(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Input
              placeholder="商户ID"
              value={searchMerchantId}
              onChange={(e) => setSearchMerchantId(e.target.value)}
              allowClear
            />
          </Col>
          <Col span={4}>
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: '100%' }}
            >
              <Select.Option value="all">全部状态</Select.Option>
              <Select.Option value="success">成功</Select.Option>
              <Select.Option value="failure">失败</Select.Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              value={syncTypeFilter}
              onChange={setSyncTypeFilter}
              style={{ width: '100%' }}
            >
              <Select.Option value="all">全部类型</Select.Option>
              <Select.Option value="single">单个同步</Select.Option>
              <Select.Option value="batch">批量同步</Select.Option>
            </Select>
          </Col>
          <Col span={6}>
            <Space>
              <RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                placeholder={['开始日期', '结束日期']}
              />
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 操作按钮 */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={() => fetchLogs()}
            loading={loading}
          >
            刷新数据
          </Button>
          <Button 
            icon={<DownloadOutlined />} 
            onClick={handleDownload}
          >
            导出日志
          </Button>
          <Button icon={<CalendarOutlined />}>
            定期清理日志
          </Button>
        </Space>
      </Card>

      {/* 主表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey={(record) => `${record.syncTime}-${record.accountInfo.app_unique_id}-${record.syncType}`}
          loading={loading}
          expandable={{
            expandedRowRender,
            rowExpandable: (record) => !record.success || !!record.errorMessage
          }}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: filteredData.length,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => 
              `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
            onChange: (page, size) => {
              setCurrentPage(page);
              if (size !== pageSize) {
                setPageSize(size);
              }
            },
          }}
          scroll={{ x: 1200 }}
        />
      </Card>
    </div>
  );
};

export default AccountSyncLog;