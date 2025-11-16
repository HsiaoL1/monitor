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
} from "antd";
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { fetchDeviceVersions } from "../services/api";
import { DeviceVersion, DeviceVersionResponse } from "../types";

const { Option } = Select;

const DeviceVersionMonitor: React.FC = () => {
  const [data, setData] = useState<DeviceVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const [filters, setFilters] = useState({
    search_query: "",
    device_type: 0,
    version_status: "all",
    app_version: "",
    plugin_version: "",
    page: 1,
    page_size: 20,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { ...filters };
      // Remove empty filters to have a cleaner URL
      Object.keys(params).forEach((key) => {
        if (params[key] === "" || params[key] === 0 || params[key] === "all") {
          delete params[key];
        }
      });

      const res: DeviceVersionResponse = await fetchDeviceVersions(params);
      if (res.success) {
        setData(res.data);
        setTotal(res.total);
      } else {
        message.error("获取版本数据失败");
      }
    } catch (error) {
      message.error("获取版本数据失败");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleReset = () => {
    setFilters({
      search_query: "",
      device_type: 0,
      version_status: "all",
      app_version: "",
      plugin_version: "",
      page: 1,
      page_size: 20,
    });
  };

  const handlePageChange = (page: number, pageSize?: number) => {
    setFilters((prev) => ({
      ...prev,
      page,
      page_size: pageSize || prev.page_size,
    }));
  };

  const getVersionTag = (version: string, isLatest: boolean) => {
    if (!version) return <Tag>-</Tag>;
    return (
      <Tag
        icon={isLatest ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        color={isLatest ? "success" : "error"}
      >
        {version}
      </Tag>
    );
  };

  const columns = [
    {
      title: "设备编码",
      dataIndex: "dev_code",
      key: "dev_code",
      width: 180,
    },
    {
      title: "商户ID",
      dataIndex: "merchant_id",
      key: "merchant_id",
      width: 100,
    },
    {
      title: "设备类型",
      dataIndex: "device_type",
      key: "device_type",
      width: 100,
      render: (type: number) =>
        type === 1 ? (
          <Tag color="blue">盒子</Tag>
        ) : (
          <Tag color="green">云机</Tag>
        ),
    },
    {
      title: "个人版App",
      dataIndex: "personal_app_version",
      key: "personal_app_version",
      render: (text: string, record: DeviceVersion) =>
        getVersionTag(text, record.is_personal_app_latest),
    },
    {
      title: "商业版App",
      dataIndex: "business_app_version",
      key: "business_app_version",
      render: (text: string, record: DeviceVersion) =>
        getVersionTag(text, record.is_business_app_latest),
    },
    {
      title: "个人版插件",
      dataIndex: "personal_plugin_version",
      key: "personal_plugin_version",
      render: (text: string, record: DeviceVersion) =>
        getVersionTag(text, record.is_personal_plugin_latest),
    },
    {
      title: "商业版插件",
      dataIndex: "business_plugin_version",
      key: "business_plugin_version",
      render: (text: string, record: DeviceVersion) =>
        getVersionTag(text, record.is_business_plugin_latest),
    },
  ];

  return (
    <Card
      title="设备App/插件版本监控"
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchData()}
          loading={loading}
        >
          刷新
        </Button>
      }
    >
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col span={5}>
            <Input
              placeholder="设备编码或商户ID"
              value={filters.search_query}
              onChange={(e) =>
                handleFilterChange("search_query", e.target.value)
              }
            />
          </Col>
          <Col span={4}>
            <Select
              style={{ width: "100%" }}
              placeholder="设备类型"
              value={filters.device_type}
              onChange={(value) => handleFilterChange("device_type", value)}
            >
              <Option value={0}>全部类型</Option>
              <Option value={1}>盒子</Option>
              <Option value={2}>云机</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              style={{ width: "100%" }}
              placeholder="版本状态"
              value={filters.version_status}
              onChange={(value) => handleFilterChange("version_status", value)}
            >
              <Option value="all">全部状态</Option>
              <Option value="app_outdated">App需更新</Option>
              <Option value="plugin_outdated">插件需更新</Option>
              <Option value="all_outdated">全部需要更新</Option>
              <Option value="all_updated">全部不需要更新</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Input
              placeholder="App版本"
              value={filters.app_version}
              onChange={(e) =>
                handleFilterChange("app_version", e.target.value)
              }
            />
          </Col>
          <Col span={4}>
            <Input
              placeholder="插件版本"
              value={filters.plugin_version}
              onChange={(e) =>
                handleFilterChange("plugin_version", e.target.value)
              }
            />
          </Col>
          <Col span={3}>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={() => fetchData()}
              >
                搜索
              </Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Table
        columns={columns}
        dataSource={data}
        rowKey="dev_code"
        loading={loading}
        pagination={false}
        scroll={{ x: 1200 }}
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

export default DeviceVersionMonitor;
