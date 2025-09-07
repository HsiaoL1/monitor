import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Button, message } from 'antd';
import { DashboardOutlined, ControlOutlined, CodeOutlined, DatabaseOutlined, UserOutlined, GlobalOutlined, LogoutOutlined, BarChartOutlined, LineChartOutlined, HistoryOutlined, MonitorOutlined, RocketOutlined, BranchesOutlined, FileTextOutlined, ToolOutlined, LaptopOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import ResourceMonitor from './components/ResourceMonitor';
import ResourceChart from './components/ResourceChart';
import ServiceManager from './components/ServiceManager';
import SystemOps from './components/SystemOps';
import RedisMonitor from './components/RedisMonitor';
import AccountMonitor from './components/AccountMonitor';
import AccountSyncLog from './components/AccountSyncLog';
import ProxyMonitor from './components/ProxyMonitor';
import ProxyReplaceLog from './components/ProxyReplaceLog';
import CICDManager from './components/CICDManager';
import TraceAnalysis from './components/TraceAnalysis';
import LogAggregation from './components/ops/LogAggregation';
import DeviceMonitor from './components/DeviceMonitor';
import Login from './components/Login';
import { checkAuth, logout } from './services/api';

const { Header, Sider, Content } = Layout;

const AppContent: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  // 根据当前路径初始化 openKeys
  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path === '/resource-chart') {
      setOpenKeys(['resource']);
    } else if (path === '/account-monitor' || path === '/account-sync-log') {
      setOpenKeys(['account']);
    } else if (path === '/ops' || path === '/ops/log-aggregation') {
      setOpenKeys(['ops']);
    } else if (path === '/proxy-monitor' || path === '/proxy-replace-log') {
      setOpenKeys(['proxy']);
    }
  }, [location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      message.success('登出成功');
      onLogout();
    } catch (error) {
      message.error('登出失败');
    }
  };

  const menuItems: MenuProps['items'] = [
    {
      key: 'resource',
      icon: <DashboardOutlined />,
      label: '资源监控',
      children: [
        {
          key: '/',
          icon: <BarChartOutlined />,
          label: '实时资源',
        },
        {
          key: '/resource-chart',
          icon: <LineChartOutlined />,
          label: '资源曲线',
        }
      ]
    },
    {
      key: '/services',
      icon: <ControlOutlined />,
      label: '服务管理',
    },
    {
      key: 'ops',
      icon: <CodeOutlined />,
      label: '系统运维',
      children: [
        {
          key: '/ops',
          icon: <ToolOutlined />,
          label: '运维工具',
        },
        {
          key: '/ops/log-aggregation',
          icon: <FileTextOutlined />,
          label: '日志聚合',
        }
      ]
    },
    {
      key: '/redis-monitor',
      icon: <DatabaseOutlined />,
      label: 'Redis监控',
    },
    {
      key: '/device-monitor',
      icon: <LaptopOutlined />,
      label: '设备监控',
    },
    {
      key: 'account',
      icon: <UserOutlined />,
      label: '账号监控',
      children: [
        {
          key: '/account-monitor',
          icon: <MonitorOutlined />,
          label: '状态监控',
        },
        {
          key: '/account-sync-log',
          icon: <HistoryOutlined />,
          label: '同步记录',
        }
      ]
    },
    {
      key: 'proxy',
      icon: <GlobalOutlined />,
      label: '代理监控',
      children: [
        {
          key: '/proxy-monitor',
          icon: <MonitorOutlined />,
          label: '状态监控',
        },
        {
          key: '/proxy-replace-log',
          icon: <HistoryOutlined />,
          label: '更换记录',
        }
      ]
    },
    {
      key: '/ci-cd',
      icon: <RocketOutlined />,
      label: 'CI/CD管理',
    },
    {
      key: '/trace-analysis',
      icon: <BranchesOutlined />,
      label: '链路追踪',
    },
  ];

  const getSelectedKeys = () => {
    const path = location.pathname;
    return [path];
  };

  const handleOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
        服务器管理控制台
        <Button type="primary" icon={<LogoutOutlined />} onClick={handleLogout}>
          登出
        </Button>
      </Header>
      <Layout>
        <Sider width={200} theme="light">
          <Menu
            mode="inline"
            selectedKeys={getSelectedKeys()}
            openKeys={openKeys}
            onOpenChange={handleOpenChange}
            style={{ height: '100%', borderRight: 0 }}
            items={menuItems}
            onClick={({ key }) => {
              navigate(key);
            }}
          />
        </Sider>
        <Layout style={{ padding: '24px' }}>
          <Content style={{ background: '#fff', padding: 24, margin: 0, minHeight: 280 }}>
            <Routes>
              <Route path="/" element={<ResourceMonitor />} />
              <Route path="/resource-chart" element={<ResourceChart />} />
              <Route path="/services" element={<ServiceManager />} />
              <Route path="/ops" element={<SystemOps />} />
              <Route path="/ops/log-aggregation" element={<LogAggregation />} />
              <Route path="/redis-monitor" element={<RedisMonitor />} />
              <Route path="/device-monitor" element={<DeviceMonitor />} />
              <Route path="/account-monitor" element={<AccountMonitor />} />
              <Route path="/account-sync-log" element={<AccountSyncLog />} />
              <Route path="/proxy-monitor" element={<ProxyMonitor />} />
              <Route path="/proxy-replace-log" element={<ProxyReplaceLog />} />
              <Route path="/ci-cd" element={<CICDManager />} />
              <Route path="/trace-analysis" element={<TraceAnalysis />} />
            </Routes>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const verifyAuth = async () => {
      const { isAuthenticated } = await checkAuth();
      setIsAuthenticated(isAuthenticated);
    };
    verifyAuth();
  }, []);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  if (isAuthenticated === null) {
    return null; // 或者一个加载中的组件
  }

  return (
    <Router>
      {isAuthenticated ? <AppContent onLogout={handleLogout} /> : <Login onLoginSuccess={handleLoginSuccess} />}
    </Router>
  );
};

export default App;
