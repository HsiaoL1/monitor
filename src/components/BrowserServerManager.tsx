import React, { useState, useEffect, useCallback } from "react";
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Space,
  message,
  Popconfirm,
  Card,
  Tooltip,
  Switch,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import {
  getBrowserServers,
  createBrowserServer,
  updateBrowserServer,
  deleteBrowserServer,
  batchUpdateBrowserServerStatus,
} from "../services/api";
import { BrowserServer } from "../types";

const BrowserServerManager: React.FC = () => {
  const [servers, setServers] = useState<BrowserServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingServer, setEditingServer] = useState<BrowserServer | null>(
    null,
  );
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [form] = Form.useForm();

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBrowserServers();
      if (res.success) {
        setServers(res.data);
      } else {
        message.error("获取服务器列表失败");
      }
    } catch (error) {
      message.error("获取服务器列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const handleAdd = () => {
    setEditingServer(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const handleEdit = (record: BrowserServer) => {
    setEditingServer(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteBrowserServer(id);
      message.success("删除成功");
      fetchServers();
    } catch (error) {
      message.error("删除失败");
    }
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingServer) {
        await updateBrowserServer(editingServer.id, values);
        message.success("更新成功");
      } else {
        await createBrowserServer(values);
        message.success("添加成功");
      }
      setIsModalVisible(false);
      fetchServers();
    } catch (error: any) {
      message.error(error?.response?.data?.error || "操作失败");
    }
  };

  const handleBatchEnable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要启用的服务器");
      return;
    }
    try {
      await batchUpdateBrowserServerStatus(
        selectedRowKeys as number[],
        true,
      );
      message.success(`成功启用 ${selectedRowKeys.length} 个服务器`);
      setSelectedRowKeys([]);
      fetchServers();
    } catch (error: any) {
      message.error(error?.response?.data?.error || "批量启用失败");
    }
  };

  const handleBatchDisable = async () => {
    if (selectedRowKeys.length === 0) {
      message.warning("请先选择要禁用的服务器");
      return;
    }
    try {
      await batchUpdateBrowserServerStatus(
        selectedRowKeys as number[],
        false,
      );
      message.success(`成功禁用 ${selectedRowKeys.length} 个服务器`);
      setSelectedRowKeys([]);
      fetchServers();
    } catch (error: any) {
      message.error(error?.response?.data?.error || "批量禁用失败");
    }
  };

  const columns = [
    {
      title: "ID",
      dataIndex: "id",
      key: "id",
      width: 80,
    },
    {
      title: "服务器名称",
      dataIndex: "name",
      key: "name",
    },
    {
      title: "最大浏览器数",
      dataIndex: "max_browser_count",
      key: "max_browser_count",
    },
    {
      title: "状态",
      dataIndex: "is_enabled",
      key: "is_enabled",
      width: 100,
      render: (enabled: boolean) => (
        <span style={{ color: enabled ? "#52c41a" : "#ff4d4f" }}>
          {enabled ? "启用" : "禁用"}
        </span>
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: "操作",
      key: "action",
      render: (_: any, record: BrowserServer) => (
        <Space size="middle">
          <Tooltip title="编辑">
            <Button
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确定删除这个服务器吗？"
            description="删除后，Redis中对应的账号集合也会被清除。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button icon={<DeleteOutlined />} danger />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          服务器集群管理
        </Space>
      }
      extra={
        <Space>
          <Button
            type="primary"
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchEnable}
          >
            批量启用
          </Button>
          <Button
            danger
            disabled={selectedRowKeys.length === 0}
            onClick={handleBatchDisable}
          >
            批量禁用
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加服务器
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => fetchServers()}
            loading={loading}
          />
        </Space>
      }
    >
      <Table
        columns={columns}
        dataSource={servers}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        rowSelection={{
          selectedRowKeys,
          onChange: setSelectedRowKeys,
        }}
      />
      <Modal
        title={editingServer ? "编辑服务器" : "添加服务器"}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={loading}
      >
        <Form form={form} layout="vertical" name="server_form">
          <Form.Item
            name="name"
            label="服务器名称"
            rules={[{ required: true, message: "请输入服务器名称" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="max_browser_count"
            label="最大浏览器数"
            rules={[{ required: true, message: "请输入最大浏览器数" }]}
          >
            <InputNumber min={1} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            name="is_enabled"
            label="是否启用"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};

export default BrowserServerManager;
