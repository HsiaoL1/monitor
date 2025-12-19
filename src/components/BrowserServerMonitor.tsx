import React, { useState, useEffect, useCallback } from "react";
import { Table, Button, Space, message, Card, Progress } from "antd";
import { MonitorOutlined, ReloadOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { getBrowserServerStats } from "../services/api";
import { BrowserServerStat } from "../types";

const BrowserServerMonitor: React.FC = () => {
  const [stats, setStats] = useState<BrowserServerStat[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBrowserServerStats();
      if (res.success) {
        setStats(res.data);
      } else {
        message.error("获取服务器统计数据失败");
      }
    } catch (error) {
      message.error("获取服务器统计数据失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleViewAccounts = (server: BrowserServerStat) => {
    navigate(`/browser-account-monitor?serverName=${server.name}`);
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
      title: "在线/最大数量",
      key: "usage",
      render: (_: any, record: BrowserServerStat) => (
        <Space>
          <span>{`${record.online_account_count} / ${record.max_browser_count}`}</span>
        </Space>
      ),
    },
    {
      title: "使用率",
      key: "progress",
      render: (_: any, record: BrowserServerStat) => {
        const percent =
          record.max_browser_count > 0
            ? Math.round(
                (record.online_account_count / record.max_browser_count) * 100,
              )
            : 0;
        return <Progress percent={percent} size="small" />;
      },
    },
    {
      title: "操作",
      key: "action",
      render: (_: any, record: BrowserServerStat) => (
        <Button type="link" onClick={() => handleViewAccounts(record)}>
          查看账号
        </Button>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <MonitorOutlined />
          服务器集群监控
        </Space>
      }
      extra={
        <Button
          icon={<ReloadOutlined />}
          onClick={() => fetchStats()}
          loading={loading}
        />
      }
    >
      <Table
        columns={columns}
        dataSource={stats}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </Card>
  );
};

export default BrowserServerMonitor;
