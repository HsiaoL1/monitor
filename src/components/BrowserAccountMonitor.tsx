import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Card,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Row,
  Col,
  message,
  Pagination,
  Popconfirm,
  Modal,
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  MonitorOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import {
  getBrowserAccounts,
  getBrowserServers,
  reloginBrowserAccounts,
} from "../services/api";
import { BrowserAccountInfo, BrowserServer } from "../types";
import dayjs from "dayjs";

const { Option } = Select;

const BrowserAccountMonitor: React.FC = () => {
  const [accounts, setAccounts] = useState<BrowserAccountInfo[]>([]);
  const [servers, setServers] = useState<BrowserServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [reloginLoading, setReloginLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const [filters, setFilters] = useState({
    web_client_no: searchParams.get("serverName") || "",
    web_online_status: searchParams.get("onlineStatus") || "",
    merchant_id: "",
    dev_code: "",
    page: 1,
    page_size: 20,
  });

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        page: filters.page,
        page_size: filters.page_size,
      };
      // Remove empty filters
      Object.keys(params).forEach((key) => {
        if (params[key as keyof typeof params] === "") {
          delete params[key as keyof typeof params];
        }
      });

      const res = await getBrowserAccounts(params);
      if (res.success) {
        setAccounts(res.data);
        setTotal(res.total);
      } else {
        message.error("获取账号列表失败");
      }
    } catch (error) {
      message.error("获取账号列表失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchServers = async () => {
    try {
      const res = await getBrowserServers();
      if (res.success) {
        setServers(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch servers");
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleReset = () => {
    setFilters({
      web_client_no: "",
      web_online_status: "",
      merchant_id: "",
      dev_code: "",
      page: 1,
      page_size: 20,
    });
    setSearchParams({});
  };

  const handlePageChange = (page: number, pageSize?: number) => {
    setFilters((prev) => ({
      ...prev,
      page,
      page_size: pageSize || prev.page_size,
    }));
  };

  const handleRelogin = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请至少选择一个账号");
      return;
    }
    setReloginLoading(true);
    try {
      const res = await reloginBrowserAccounts(selectedRowKeys as number[]);
      if (res.success) {
        message.success(
          res.message || `成功将 ${res.queued_count} 个账号加入重新登录队列`,
        );
        setSelectedRowKeys([]);
      } else {
        message.error(res.message || "操作失败", 10);
        if (res.errors && res.errors.length > 0) {
          // Display detailed errors in a modal or expandable message
          Modal.error({
            title: "批量重新登录时发生错误",
            content: (
              <ul style={{ maxHeight: "200px", overflowY: "auto" }}>
                {res.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ),
          });
        }
      }
    } catch (error) {
      message.error("请求失败，请检查网络");
    } finally {
      setReloginLoading(false);
    }
  };

  const getOnlineStatusTag = (status: number) => {
    const statusMap: Record<number, { text: string; color: string }> = {
      0: { text: "离线", color: "default" },
      1: { text: "在线", color: "success" },
      2: { text: "上线中", color: "processing" },
      3: { text: "下线中", color: "warning" },
    };
    const s = statusMap[status] || { text: "未知", color: "error" };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const getAccountStatusTag = (status: number) => {
    const statusMap: Record<number, { text: string; color: string }> = {
      1: { text: "正常", color: "success" },
      2: { text: "封号", color: "error" },
      3: { text: "注销", color: "warning" },
    };
    const s = statusMap[status] || { text: "未知", color: "default" };
    return <Tag color={s.color}>{s.text}</Tag>;
  };

  const getDeviceTypeTag = (type: number) => {
    return type === 1 ? (
      <Tag color="blue">盒子云机</Tag>
    ) : (
      <Tag color="green">百度云机</Tag>
    );
  };

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 80 },
    { title: "账号", dataIndex: "account", key: "account" },
    { title: "商户ID", dataIndex: "merchant_id", key: "merchant_id" },
    { title: "服务器", dataIndex: "web_client_no", key: "web_client_no" },
    {
      title: "在线状态",
      dataIndex: "web_online_status",
      key: "web_online_status",
      render: getOnlineStatusTag,
    },
    {
      title: "账号状态",
      dataIndex: "account_status",
      key: "account_status",
      render: getAccountStatusTag,
    },
    { title: "设备编码", dataIndex: "dev_code", key: "dev_code" },
    {
      title: "设备类型",
      dataIndex: "device_type",
      key: "device_type",
      render: getDeviceTypeTag,
    },
    { title: "国家", dataIndex: "country_code", key: "country_code" },
    {
      title: "心跳时间",
      dataIndex: "web_heart_time",
      key: "web_heart_time",
      render: (text: string) =>
        dayjs(text).isValid() && text !== "0001-01-01T00:00:00Z"
          ? dayjs(text).format("YYYY-MM-DD HH:mm:ss")
          : "-",
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys: React.Key[]) => setSelectedRowKeys(keys),
  };

  const hasSelected = selectedRowKeys.length > 0;

  return (
    <Card
      title={
        <Space>
          <MonitorOutlined />
          账号在线监控
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchAccounts()}
          loading={loading}
        >
          刷新
        </Button>
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={6}>
            <Select
              placeholder="选择服务器"
              style={{ width: "100%" }}
              value={filters.web_client_no}
              onChange={(value) => handleFilterChange("web_client_no", value)}
              showSearch
            >
              <Option value="">全部</Option>
              {servers.map((s) => (
                <Option key={s.id} value={s.name}>
                  {s.name}
                </Option>
              ))}
            </Select>
          </Col>
          <Col span={5}>
            <Select
              placeholder="在线状态"
              style={{ width: "100%" }}
              value={filters.web_online_status}
              onChange={(value) =>
                handleFilterChange("web_online_status", value)
              }
            >
              <Option value="">全部</Option>
              <Option value="1">在线</Option>
              <Option value="0">离线</Option>
            </Select>
          </Col>
          <Col span={5}>
            <Input
              placeholder="商户ID"
              value={filters.merchant_id}
              onChange={(e) =>
                handleFilterChange("merchant_id", e.target.value)
              }
            />
          </Col>
          <Col span={5}>
            <Input
              placeholder="云机编码"
              value={filters.dev_code}
              onChange={(e) => handleFilterChange("dev_code", e.target.value)}
            />
          </Col>
          <Col span={3}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => fetchAccounts()}
              >
                搜索
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <div style={{ marginBottom: 16 }}>
        <Space>
          <Popconfirm
            title={`确认要重新登录选中的 ${selectedRowKeys.length} 个账号吗？`}
            onConfirm={handleRelogin}
            okText="确认"
            cancelText="取消"
            disabled={!hasSelected}
          >
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              disabled={!hasSelected}
              loading={reloginLoading}
            >
              批量重新登录
            </Button>
          </Popconfirm>
          {hasSelected && (
            <span style={{ marginLeft: 8 }}>
              已选择 {selectedRowKeys.length} 个账号
            </span>
          )}
        </Space>
      </div>

      <Table
        rowSelection={rowSelection}
        columns={columns}
        dataSource={accounts}
        rowKey="id"
        loading={loading}
        pagination={false}
        scroll={{ x: 1300 }}
      />
      <Pagination
        current={filters.page}
        pageSize={filters.page_size}
        total={total}
        onChange={handlePageChange}
        showSizeChanger
        showTotal={(t) => `共 ${t} 条`}
        style={{ marginTop: 16, textAlign: "right" }}
      />
    </Card>
  );
};

export default BrowserAccountMonitor;
