import React, { useState, useEffect, useMemo } from "react";
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
  Badge,
  Typography,
  List,
  Input,
  Select,
  Progress,
} from "antd";
import {
  ReloadOutlined,
  BellOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  GlobalOutlined,
  DesktopOutlined,
  SwapOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import {
  fetchProxyStatus,
  notifyMerchants,
  findReplacementProxy,
  replaceProxy,
  startAsyncProxyCheck,
  getAsyncCheckStatus,
} from "../services/api";
import { ProxyStatus, DeviceInfo } from "../types";
import AutoReplaceManager from './AutoReplaceManager';

const { Text } = Typography;

const ProxyMonitor: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [data, setData] = useState<{
    totalProxies: number;
    unavailableCount: number;
    proxyStatuses: ProxyStatus[];
    timestamp: string;
    cached?: boolean;
    cacheTime?: string;
  } | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<ProxyStatus | null>(
    null,
  );
  
  // 异步检测状态
  const [asyncCheckStatus, setAsyncCheckStatus] = useState<{
    taskId?: string;
    status?: string;
    progress?: number;
    total?: number;
    completed?: number;
  } | null>(null);
  const [asyncChecking, setAsyncChecking] = useState(false);

  // 搜索和分页状态
  const [searchMerchantId, setSearchMerchantId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "available" | "unavailable"
  >("all");
  const [pageSize, setPageSize] = useState<number>(20);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchData = async (forceRefresh: boolean = false) => {
    setLoading(true);
    try {
      const result = await fetchProxyStatus(true, forceRefresh);
      if (result.success) {
        setData(result);
        if (result.cached) {
          message.info(`已加载缓存数据 (缓存时间: ${new Date(result.cacheTime).toLocaleString()})`);
        }
        // 清空选中项，因为数据已刷新
        setSelectedRowKeys([]);
      } else {
        const errorMsg = result.message || result.error || "获取代理状态失败";
        message.error(errorMsg);
      }
    } catch (error: any) {
      // 处理HTTP错误响应
      if (error.response && error.response.data) {
        const errorData = error.response.data;
        const errorMsg = errorData.message || errorData.error || error.message;
        message.error("获取代理状态失败: " + errorMsg);
      } else {
        message.error("获取代理状态失败: " + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // 启动异步检测
  const startAsyncCheck = async () => {
    try {
      setAsyncChecking(true);
      const result = await startAsyncProxyCheck();
      if (result.success) {
        setAsyncCheckStatus({
          taskId: result.task_id,
          status: 'running',
          progress: 0,
          total: 0,
          completed: 0,
        });
        message.success('后台检测任务已启动，请等待完成');
        
        // 开始轮询检测状态
        pollAsyncStatus(result.task_id);
      }
    } catch (error: any) {
      message.error('启动异步检测失败: ' + error.message);
      setAsyncChecking(false);
    }
  };

  // 轮询异步检测状态
  const pollAsyncStatus = async (taskId: string) => {
    const checkStatus = async () => {
      try {
        const result = await getAsyncCheckStatus(taskId);
        if (result.success) {
          setAsyncCheckStatus(result.task);
          
          if (result.task.status === 'completed') {
            message.success(`代理检测完成！共检测 ${result.task.total} 个代理`);
            setAsyncChecking(false);
            // 刷新数据显示最新结果
            fetchData();
            return;
          } else if (result.task.status === 'failed') {
            message.error('代理检测失败: ' + result.task.error_message);
            setAsyncChecking(false);
            return;
          }
          
          // 如果还在运行，继续轮询
          setTimeout(checkStatus, 2000);
        }
      } catch (error: any) {
        console.error('Failed to get async status:', error);
        setTimeout(checkStatus, 5000); // 错误时减少轮询频率
      }
    };
    
    checkStatus();
  };

  // 重置搜索和分页
  const resetFilters = () => {
    setSearchMerchantId("");
    setStatusFilter("all");
    setCurrentPage(1);
    setSelectedRowKeys([]);
  };

  // 过滤和排序数据
  const filteredData = useMemo(() => {
    if (!data?.proxyStatuses) return [];

    let filtered = data.proxyStatuses.filter((item) => {
      const merchantMatch =
        !searchMerchantId ||
        item.proxy_info.merchant_id.toString().includes(searchMerchantId);

      const statusMatch =
        statusFilter === "all" ||
        (statusFilter === "available" && item.is_available) ||
        (statusFilter === "unavailable" && !item.is_available);

      return merchantMatch && statusMatch;
    });

    return filtered;
  }, [data?.proxyStatuses, searchMerchantId, statusFilter]);

  const handleNotify = async (notifyAll: boolean = false) => {
    setNotifying(true);
    try {
      const proxyIds = notifyAll
        ? data?.proxyStatuses
            .filter((p) => !p.is_available)
            .map((p) => p.proxy_info.id)
        : selectedRowKeys.map((key) => Number(key));

      const result = await notifyMerchants(proxyIds, undefined, notifyAll);

      if (result.success) {
        message.success(result.message);
        setSelectedRowKeys([]);
      } else {
        message.error("通知发送失败");
      }
    } catch (error: any) {
      message.error("通知发送失败: " + error.message);
    } finally {
      setNotifying(false);
    }
  };

  const handleReplaceProxy = async (proxyId: number) => {
    setReplacing(true);
    try {
      // 首先查找替代代理
      const replacementResult = await findReplacementProxy(proxyId);
      if (!replacementResult.success) {
        message.error(replacementResult.message || "未找到可用的替代代理");
        return;
      }

      // 确认替换
      Modal.confirm({
        title: "确认替换代理",
        content: (
          <div>
            <p>将要替换的代理信息：</p>
            <p>
              <strong>当前代理:</strong> {replacementResult.currentProxy.ip}:
              {replacementResult.currentProxy.port}
            </p>
            <p>
              <strong>替代代理:</strong> {replacementResult.replacementProxy.ip}
              :{replacementResult.replacementProxy.port}
            </p>
            <p>
              <strong>影响设备:</strong>{" "}
              {
                data?.proxyStatuses.find((p) => p.proxy_info.id === proxyId)
                  ?.device_count
              }{" "}
              个
            </p>
          </div>
        ),
        onOk: async () => {
          try {
            const replaceResult = await replaceProxy(
              proxyId,
              replacementResult.replacementProxy.id,
            );
            if (replaceResult.success) {
              message.success(
                `代理更换成功，共更新 ${replaceResult.updatedDevices} 个设备`,
              );
              fetchData(); // 刷新数据
            } else {
              message.error("代理更换失败: " + replaceResult.error);
            }
          } catch (error: any) {
            message.error("代理更换失败: " + error.message);
          }
        },
      });
    } catch (error: any) {
      message.error("查找替代代理失败: " + error.message);
    } finally {
      setReplacing(false);
    }
  };

  const showDetail = (record: ProxyStatus) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  const getProxyStatusTag = (status: ProxyStatus) => {
    if (status.is_available) {
      return (
        <Tag color="success" icon={<CheckCircleOutlined />}>
          可用 ({status.response_time}ms)
        </Tag>
      );
    } else {
      return (
        <Tag color="error" icon={<CloseCircleOutlined />}>
          不可用
        </Tag>
      );
    }
  };

  const getDeviceTypeTag = (deviceType: string) => {
    return deviceType === "ai_box" ? (
      <Tag color="blue">盒子</Tag>
    ) : (
      <Tag color="green">云机</Tag>
    );
  };

  const getDeviceOnlineTag = (isOnline: number, deviceType: string) => {
    if (deviceType === "ai_box") {
      // AI盒子: 0下线，1在线
      return isOnline === 1 ? (
        <Tag color="success">在线</Tag>
      ) : (
        <Tag color="default">离线</Tag>
      );
    } else {
      // 云设备: 0下线，1在线，2初始化中，3上线中
      const statusMap: Record<number, { text: string; color: string }> = {
        0: { text: "下线", color: "default" },
        1: { text: "在线", color: "success" },
        2: { text: "初始化中", color: "processing" },
        3: { text: "上线中", color: "warning" },
      };
      const status = statusMap[isOnline] || { text: "未知", color: "error" };
      return <Tag color={status.color}>{status.text}</Tag>;
    }
  };

  const columns = [
    {
      title: "代理信息",
      key: "proxy_info",
      width: 200,
      render: (record: ProxyStatus) => (
        <div>
          <div>
            <strong>
              {record.proxy_info.ip}:{record.proxy_info.port}
            </strong>
          </div>
          <div style={{ color: "#888", fontSize: "12px" }}>
            ID: {record.proxy_info.id} |{" "}
            {record.proxy_info.protocol?.toUpperCase()}
          </div>
          {record.proxy_info.proxy_text && (
            <div style={{ color: "#888", fontSize: "12px" }}>
              {record.proxy_info.proxy_text}
            </div>
          )}
        </div>
      ),
    },
    {
      title: "状态",
      key: "status",
      width: 150,
      render: (record: ProxyStatus) => getProxyStatusTag(record),
    },
    {
      title: "使用设备",
      key: "device_count",
      width: 120,
      render: (record: ProxyStatus) => (
        <div>
          <Badge count={record.device_count} showZero>
            <DesktopOutlined style={{ fontSize: 16 }} />
          </Badge>
          <div style={{ color: "#888", fontSize: "12px", marginTop: 4 }}>
            设备数量
          </div>
        </div>
      ),
    },
    {
      title: "商户ID",
      dataIndex: ["proxy_info", "merchant_id"],
      key: "merchant_id",
      width: 100,
    },
    {
      title: "检测时间",
      key: "check_time",
      width: 180,
      render: (record: ProxyStatus) => (
        <div>
          <div>{new Date(record.check_time).toLocaleString()}</div>
          {!record.is_available && record.error_message && (
            <Text type="danger" style={{ fontSize: "12px" }}>
              {record.error_message}
            </Text>
          )}
        </div>
      ),
    },
    {
      title: "操作",
      key: "action",
      width: 160,
      render: (record: ProxyStatus) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showDetail(record)}
          >
            详情
          </Button>
          {!record.is_available && (
            <Button
              type="link"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => handleReplaceProxy(record.proxy_info.id)}
              loading={replacing}
              style={{ color: "#1890ff" }}
            >
              更换
            </Button>
          )}
        </Space>
      ),
    },
  ];

  useEffect(() => {
    fetchData();
    // 自动刷新：每30秒检查一次代理状态
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card
      title={
        <Space>
          <GlobalOutlined />
          代理状态监控
        </Space>
      }
      extra={
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchData(false)}
            loading={loading}
          >
            快速刷新
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchData(true)}
            loading={loading}
            type="primary"
          >
            强制刷新
          </Button>
          <Button
            icon={<CheckCircleOutlined />}
            onClick={startAsyncCheck}
            loading={asyncChecking}
            disabled={asyncChecking}
          >
            后台全量检测
          </Button>
          <Popconfirm
            title="确认通知所有使用不可用代理的商户？"
            description="将向相关商户发送代理不可用的通知"
            onConfirm={() => handleNotify(true)}
            okText="确认"
            cancelText="取消"
          >
            <Button
              type="primary"
              icon={<BellOutlined />}
              loading={notifying}
              danger={!!(data && data.unavailableCount > 0)}
            >
              通知全部
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <AutoReplaceManager />
      {data && (
        <>
          {/* 搜索和筛选控件 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Row gutter={16} align="middle">
              <Col span={6}>
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: "100%" }}
                >
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
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: "100%" }}
                >
                  <label>状态筛选:</label>
                  <Select
                    style={{ width: "100%" }}
                    value={statusFilter}
                    onChange={(value) => {
                      setStatusFilter(value);
                      setCurrentPage(1); // 重置到第一页
                    }}
                  >
                    <Select.Option value="all">全部状态</Select.Option>
                    <Select.Option value="available">
                      <CheckCircleOutlined style={{ color: "#52c41a" }} /> 可用
                    </Select.Option>
                    <Select.Option value="unavailable">
                      <CloseCircleOutlined style={{ color: "#ff4d4f" }} />{" "}
                      不可用
                    </Select.Option>
                  </Select>
                </Space>
              </Col>
              <Col span={6}>
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: "100%" }}
                >
                  <label>当前显示:</label>
                  <div
                    style={{
                      padding: "6px 12px",
                      background: "#f5f5f5",
                      borderRadius: "6px",
                      textAlign: "center",
                    }}
                  >
                    <Text strong>{filteredData.length}</Text> /{" "}
                    {data.totalProxies} 个代理
                  </div>
                </Space>
              </Col>
              <Col span={6}>
                <Space
                  direction="vertical"
                  size="small"
                  style={{ width: "100%" }}
                >
                  <label>&nbsp;</label>
                  <Button onClick={resetFilters} style={{ width: "100%" }}>
                    重置筛选
                  </Button>
                </Space>
              </Col>
            </Row>
          </Card>

          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Statistic
                title="总代理数"
                value={data.totalProxies}
                prefix={<GlobalOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="不可用代理"
                value={data.unavailableCount}
                valueStyle={{ color: "#cf1322" }}
                prefix={<ExclamationCircleOutlined />}
              />
            </Col>
            <Col span={6}>
              <Statistic
                title="可用率"
                value={(
                  ((data.totalProxies - data.unavailableCount) /
                    data.totalProxies) *
                  100
                ).toFixed(1)}
                suffix="%"
                valueStyle={{
                  color: data.unavailableCount === 0 ? "#3f8600" : "#cf1322",
                }}
              />
            </Col>
            <Col span={6}>
              <Statistic title="已选择" value={selectedRowKeys.length} />
            </Col>
          </Row>

          {/* 异步检测进度显示 */}
          {asyncChecking && asyncCheckStatus && (
            <Card style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong>后台检测进行中...</Text>
                  <Text type="secondary">
                    {asyncCheckStatus.completed || 0} / {asyncCheckStatus.total || 0}
                  </Text>
                </div>
                <Progress
                  percent={asyncCheckStatus.progress || 0}
                  status={asyncCheckStatus.status === 'running' ? 'active' : 'normal'}
                  strokeColor={{
                    from: '#108ee9',
                    to: '#87d068',
                  }}
                />
              </Space>
            </Card>
          )}

          {/* 缓存提示 */}
          {data.cached && (
            <Alert
              message="正在显示缓存数据"
              description={`缓存时间: ${new Date(data.cacheTime || '').toLocaleString()}。点击"强制刷新"或"后台全量检测"获取最新数据。`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {data.unavailableCount > 0 && (
            <Alert
              message="发现不可用的代理"
              description={`共有 ${data.unavailableCount} 个代理无法正常访问，可能影响相关设备的网络连接`}
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {selectedRowKeys.length > 0 && (
            <Alert
              message={`已选择 ${selectedRowKeys.length} 个代理`}
              type="info"
              action={
                <Space>
                  <Button size="small" onClick={() => setSelectedRowKeys([])}>
                    清空选择
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<BellOutlined />}
                    loading={notifying}
                    onClick={() => handleNotify(false)}
                  >
                    通知选中
                  </Button>
                </Space>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Table
            columns={columns}
            dataSource={filteredData}
            rowKey={(record) => record.proxy_info.id}
            loading={loading}
            size="small"
            scroll={{ x: 800 }}
            rowSelection={{
              selectedRowKeys,
              onChange: setSelectedRowKeys,
              getCheckboxProps: (record) => ({
                disabled: record.is_available, // 可用的代理不需要通知
              }),
            }}
            pagination={{
              current: currentPage,
              pageSize: pageSize,
              total: filteredData.length,
              showSizeChanger: true,
              showQuickJumper: true,
              pageSizeOptions: ["10", "20", "50", "100"],
              showTotal: (total, range) =>
                `第 ${range[0]}-${range[1]} 条，共 ${total} 个代理`,
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
        title="代理详细信息"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={900}
      >
        {selectedRecord && (
          <div>
            <Descriptions title="代理信息" bordered size="small">
              <Descriptions.Item label="代理ID">
                {selectedRecord.proxy_info.id}
              </Descriptions.Item>
              <Descriptions.Item label="IP地址">
                {selectedRecord.proxy_info.ip}
              </Descriptions.Item>
              <Descriptions.Item label="端口">
                {selectedRecord.proxy_info.port}
              </Descriptions.Item>
              <Descriptions.Item label="协议">
                {selectedRecord.proxy_info.protocol?.toUpperCase()}
              </Descriptions.Item>
              <Descriptions.Item label="类型">
                {selectedRecord.proxy_info.proxy_type}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {getProxyStatusTag(selectedRecord)}
              </Descriptions.Item>
              <Descriptions.Item label="商户ID">
                {selectedRecord.proxy_info.merchant_id}
              </Descriptions.Item>
              <Descriptions.Item label="自定义编号">
                {selectedRecord.proxy_info.custom_code}
              </Descriptions.Item>
              <Descriptions.Item label="备注">
                {selectedRecord.proxy_info.proxy_text || "无"}
              </Descriptions.Item>
              <Descriptions.Item label="测试URL">
                <a
                  href={selectedRecord.test_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {selectedRecord.test_url}
                </a>
              </Descriptions.Item>
              <Descriptions.Item label="响应时间">
                {selectedRecord.response_time}ms
              </Descriptions.Item>
              <Descriptions.Item label="检测时间">
                {new Date(selectedRecord.check_time).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            {!selectedRecord.is_available && selectedRecord.error_message && (
              <Alert
                message="错误信息"
                description={selectedRecord.error_message}
                type="error"
                style={{ marginTop: 16 }}
              />
            )}

            <div style={{ marginTop: 16 }}>
              <h4>使用此代理的设备 ({selectedRecord.device_count}个)</h4>
              <List
                dataSource={selectedRecord.using_devices}
                renderItem={(device: DeviceInfo) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                          }}
                        >
                          <DesktopOutlined style={{ fontSize: 20 }} />
                          {getDeviceTypeTag(device.device_type)}
                        </div>
                      }
                      title={
                        <Space>
                          <Text strong>{device.dev_code}</Text>
                          {getDeviceOnlineTag(
                            device.is_online,
                            device.device_type,
                          )}
                        </Space>
                      }
                      description={
                        <div>
                          <div>设备ID: {device.id}</div>
                          <div>商户ID: {device.merchant_id}</div>
                          {device.dev_text && (
                            <div>备注: {device.dev_text}</div>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
                size="small"
                style={{
                  maxHeight: 300,
                  overflow: "auto",
                  border: "1px solid #f0f0f0",
                  borderRadius: 4,
                  padding: 8,
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default ProxyMonitor;
