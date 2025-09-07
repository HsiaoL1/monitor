import React, { useState, useEffect, useMemo } from 'react';
import { 
  Card, 
  Table, 
  Button, 
  Space, 
  message, 
  Tag, 
  Modal, 
  Row, 
  Col,
  Statistic,
  Descriptions,
  Alert,
  Tooltip,
  Popconfirm,
  Input,
  Select
} from 'antd';
import { 
  ReloadOutlined, 
  SyncOutlined, 
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined
} from '@ant-design/icons';
import { fetchAccountMismatch, syncAccountStatus } from '../services/api';
import { AccountStatusMismatch } from '../types';

const AccountMonitor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<{
    totalAccounts: number;
    mismatchCount: number;
    mismatches: AccountStatusMismatch[];
    timestamp: string;
  } | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<AccountStatusMismatch | null>(null);
  
  // 搜索和排序状态
  const [searchAccount, setSearchAccount] = useState<string>('');
  const [searchMerchantId, setSearchMerchantId] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await fetchAccountMismatch();
      if (result.success) {
        setData(result);
        // 清空选中项，因为数据已刷新
        setSelectedRowKeys([]);
      } else {
        message.error('获取数据失败: ' + result.error);
      }
    } catch (error: any) {
      message.error('获取数据失败: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (syncAll: boolean = false, singleAppUniqueId?: string) => {
    setSyncing(true);
    try {
      let appUniqueIds: string[] | undefined;
      if (syncAll) {
        appUniqueIds = undefined;
      } else if (singleAppUniqueId) {
        appUniqueIds = [singleAppUniqueId];
      } else {
        appUniqueIds = selectedRowKeys.map(key => key.toString());
      }
      const result = await syncAccountStatus(appUniqueIds, syncAll);
      
      if (result.success) {
        message.success(`同步完成，已同步 ${result.syncCount} 个账号`);
        if (result.errors && result.errors.length > 0) {
          message.warning(`部分同步失败: ${result.errors.slice(0, 3).join(', ')}`);
        }
        fetchData(); // 重新获取数据
        setSelectedRowKeys([]);
      } else {
        message.error('同步失败');
      }
    } catch (error: any) {
      message.error('同步失败: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  const showDetail = (record: AccountStatusMismatch) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  // 重置搜索和分页
  const resetFilters = () => {
    setSearchAccount('');
    setSearchMerchantId('');
    setSortOrder(null);
    setCurrentPage(1);
    setSelectedRowKeys([]);
  };

  // 过滤和排序数据
  const filteredAndSortedData = useMemo(() => {
    if (!data?.mismatches) return [];

    let filtered = data.mismatches.filter(item => {
      const accountMatch = !searchAccount || 
        item.social_account.account.toLowerCase().includes(searchAccount.toLowerCase());
      const merchantMatch = !searchMerchantId || 
        item.social_account.merchant_id.toString().includes(searchMerchantId);
      return accountMatch && merchantMatch;
    });

    // 按心跳时间排序（如果有Redis数据的话）
    if (sortOrder) {
      filtered.sort((a, b) => {
        const timeA = a.redis_exists ? a.redis_info.heartbeatTime : 0;
        const timeB = b.redis_exists ? b.redis_info.heartbeatTime : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      });
    }

    return filtered;
  }, [data?.mismatches, searchAccount, searchMerchantId, sortOrder]);

  const getOnlineStatusText = (status: number) => {
    const statusMap: Record<number, { text: string; color: string }> = {
      0: { text: '离线', color: 'default' },
      1: { text: '在线', color: 'success' },
      2: { text: '上线中', color: 'processing' },
      3: { text: '下线中', color: 'warning' }
    };
    return statusMap[status] || { text: '未知', color: 'error' };
  };

  const getAccountStatusText = (status: number) => {
    return status === 1 ? { text: '启用', color: 'success' } : { text: '禁用', color: 'error' };
  };

  const columns = [
    {
      title: '账号信息',
      key: 'account_info',
      width: 200,
      render: (record: AccountStatusMismatch) => (
        <div>
          <div><strong>{record.social_account.account}</strong></div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            ID: {record.social_account.id}
          </div>
          <div style={{ color: '#888', fontSize: '12px' }}>
            商户: {record.social_account.merchant_id}
          </div>
        </div>
      ),
    },
    {
      title: '数据库状态',
      key: 'db_status',
      width: 120,
      render: (record: AccountStatusMismatch) => {
        const onlineStatus = getOnlineStatusText(record.social_account.online_status);
        const accountStatus = getAccountStatusText(record.social_account.account_status);
        return (
          <div>
            <Tag color={onlineStatus.color}>{onlineStatus.text}</Tag>
            <br />
            <Tag color={accountStatus.color} style={{ marginTop: 4 }}>
              {accountStatus.text}
            </Tag>
          </div>
        );
      },
    },
    {
      title: 'Redis状态',
      key: 'redis_status',
      width: 120,
      render: (record: AccountStatusMismatch) => (
        <div>
          {record.redis_exists ? (
            <>
              <Tag color={record.redis_info.online ? 'success' : 'default'}>
                {record.redis_info.online ? '在线' : '离线'}
              </Tag>
              {record.is_hb_time_out && (
                <Tooltip title="心跳超时">
                  <Tag color="warning" icon={<ClockCircleOutlined />}>
                    超时
                  </Tag>
                </Tooltip>
              )}
              <div style={{ color: '#888', fontSize: '10px', marginTop: '2px' }}>
                {record.redis_info.heartbeatTimeFormatted}
              </div>
            </>
          ) : (
            <Tag color="default">不存在</Tag>
          )}
        </div>
      ),
    },
    {
      title: '状态匹配',
      key: 'status_match',
      width: 100,
      render: (record: AccountStatusMismatch) => (
        <Tag 
          color={record.status_match ? 'success' : 'error'}
          icon={record.status_match ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {record.status_match ? '匹配' : '不匹配'}
        </Tag>
      ),
    },
    {
      title: 'AppUniqueID',
      dataIndex: ['social_account', 'app_unique_id'],
      key: 'app_unique_id',
      width: 150,
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (record: AccountStatusMismatch) => (
        <Space>
          <Button 
            type="link" 
            size="small" 
            onClick={() => showDetail(record)}
          >
            详情
          </Button>
          <Button 
            type="link" 
            size="small"
            loading={syncing}
            onClick={() => handleSync(false, record.social_account.app_unique_id)}
          >
            同步
          </Button>
        </Space>
      ),
    },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Card 
      title="账号状态监控"
      extra={
        <Space>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={fetchData} 
            loading={loading}
          >
            刷新
          </Button>
          <Popconfirm
            title="确认同步所有不匹配的账号？"
            description="将根据Redis中的真实状态更新数据库"
            onConfirm={() => handleSync(true)}
            okText="确认"
            cancelText="取消"
          >
            <Button 
              type="primary"
              icon={<SyncOutlined />} 
              loading={syncing}
            >
              同步全部
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      {data && (
        <>
          {/* 搜索和排序控件 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>按账号搜索:</label>
                  <Input
                    placeholder="输入账号名称"
                    prefix={<SearchOutlined />}
                    value={searchAccount}
                    onChange={(e) => {
                      setSearchAccount(e.target.value);
                      setCurrentPage(1); // 重置到第一页
                    }}
                    allowClear
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>按商户ID搜索:</label>
                  <Input
                    placeholder="输入商户ID"
                    prefix={<SearchOutlined />}
                    value={searchMerchantId}
                    onChange={(e) => {
                      setSearchMerchantId(e.target.value);
                      setCurrentPage(1); // 重置到第一页
                    }}
                    allowClear
                  />
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>按心跳时间排序:</label>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择排序方式"
                    value={sortOrder}
                    onChange={(value) => setSortOrder(value)}
                    allowClear
                  >
                    <Select.Option value="desc">
                      <SortDescendingOutlined /> 最新优先
                    </Select.Option>
                    <Select.Option value="asc">
                      <SortAscendingOutlined /> 最旧优先
                    </Select.Option>
                  </Select>
                </Space>
              </Col>
              <Col span={6}>
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <label>&nbsp;</label>
                  <Button onClick={resetFilters} style={{ width: '100%' }}>
                    重置筛选
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic 
                title="总账号数" 
                value={data.totalAccounts} 
                prefix={<CheckCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="不匹配数" 
                value={data.mismatchCount} 
                valueStyle={{ color: '#cf1322' }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="当前显示" 
                value={filteredAndSortedData.length} 
                suffix={`/ ${data.mismatchCount}`}
                valueStyle={{ color: filteredAndSortedData.length === data.mismatchCount ? '#3f8600' : '#1890ff' }}
              />
            </Col>
            <Col span={6}>
              <Statistic 
                title="已选择" 
                value={selectedRowKeys.length} 
              />
            </Col>
          </Row>

          {data.mismatchCount > 0 && (
            <Alert
              message="发现状态不匹配的账号"
              description={`共有 ${data.mismatchCount} 个账号的数据库状态与Redis状态不一致，建议及时同步`}
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {selectedRowKeys.length > 0 && (
            <Alert
              message={`已选择 ${selectedRowKeys.length} 个账号`}
              type="info"
              action={
                <Space>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>
                    清空选择
                  </Button>
                  <Button 
                    size="small" 
                    type="primary"
                    loading={syncing}
                    onClick={() => handleSync(false)}
                  >
                    同步选中
                  </Button>
                </Space>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            columns={columns}
            dataSource={filteredAndSortedData}
            rowKey={(record) => record.social_account.app_unique_id}
            loading={loading}
            size="small"
            scroll={{ x: 800 }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
            }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredAndSortedData.length,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total, range) => 
                `第 ${range[0]}-${range[1]} 条，共 ${total} 条记录`,
              onChange: (page, size) => {
                setCurrentPage(page);
                if (size !== pageSize) {
                  setPageSize(size);
                  setCurrentPage(1); // 改变页面大小时重置到第一页
                }
              },
              onShowSizeChange: (current, size) => {
                setPageSize(size);
                setCurrentPage(1); // 改变页面大小时重置到第一页
              },
            }}
          />
        </>
      )}

      <Modal
        title="账号状态详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>
        ]}
        width={800}
      >
        {selectedRecord && (
          <div>
            <Descriptions title="数据库信息" bordered size="small">
              <Descriptions.Item label="账号ID">
                {selectedRecord.social_account.id}
              </Descriptions.Item>
              <Descriptions.Item label="商户ID">
                {selectedRecord.social_account.merchant_id}
              </Descriptions.Item>
              <Descriptions.Item label="账号名称">
                {selectedRecord.social_account.account}
              </Descriptions.Item>
              <Descriptions.Item label="AppUniqueID">
                {selectedRecord.social_account.app_unique_id}
              </Descriptions.Item>
              <Descriptions.Item label="平台ID">
                {selectedRecord.social_account.platform_id}
              </Descriptions.Item>
              <Descriptions.Item label="账号状态">
                <Tag color={getAccountStatusText(selectedRecord.social_account.account_status).color}>
                  {getAccountStatusText(selectedRecord.social_account.account_status).text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="在线状态">
                <Tag color={getOnlineStatusText(selectedRecord.social_account.online_status).color}>
                  {getOnlineStatusText(selectedRecord.social_account.online_status).text}
                </Tag>
              </Descriptions.Item>
            </Descriptions>

            {selectedRecord.redis_exists && (
              <Descriptions title="Redis信息" bordered size="small" style={{ marginTop: 16 }}>
                <Descriptions.Item label="在线状态">
                  <Tag color={selectedRecord.redis_info.online ? 'success' : 'default'}>
                    {selectedRecord.redis_info.online ? '在线' : '离线'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="服务器">
                  {selectedRecord.redis_info.server}
                </Descriptions.Item>
                <Descriptions.Item label="端口">
                  {selectedRecord.redis_info.http_port}
                </Descriptions.Item>
                <Descriptions.Item label="登录时间">
                  {selectedRecord.redis_info.loginTimeFormatted}
                </Descriptions.Item>
                <Descriptions.Item label="心跳时间">
                  {selectedRecord.redis_info.heartbeatTimeFormatted}
                </Descriptions.Item>
                <Descriptions.Item label="心跳超时">
                  <Tag color={selectedRecord.is_hb_time_out ? 'warning' : 'success'}>
                    {selectedRecord.is_hb_time_out ? '是' : '否'}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="平台ID">
                  {selectedRecord.redis_info.platformId}
                </Descriptions.Item>
                <Descriptions.Item label="第三方应用">
                  {selectedRecord.redis_info.thirdApp}
                </Descriptions.Item>
              </Descriptions>
            )}

            {!selectedRecord.redis_exists && (
              <Alert
                message="Redis中无此账号信息"
                description="该账号在Redis中不存在记录，可能已经离线或从未登录"
                type="info"
                style={{ marginTop: 16 }}
              />
            )}
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default AccountMonitor;