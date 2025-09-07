import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import { FileTextOutlined, CodeOutlined, InfoCircleOutlined } from '@ant-design/icons';
import LogViewer from './ops/LogViewer';
import Terminal from './ops/Terminal';
import SystemInfo from './ops/SystemInfo';

const { Sider, Content } = Layout;

type TabKey = 'logs' | 'terminal' | 'system';

const SystemOps: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('logs');

  const menuItems = [
    {
      key: 'logs',
      icon: <FileTextOutlined />,
      label: '服务日志',
    },
    {
      key: 'terminal',
      icon: <CodeOutlined />,
      label: '终端操作',
    },
    {
      key: 'system',
      icon: <InfoCircleOutlined />,
      label: '系统信息',
    },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'logs':
        return <LogViewer />;
      case 'terminal':
        return <Terminal />;
      case 'system':
        return <SystemInfo />;
      default:
        return null;
    }
  };

  return (
    <div style={{ height: 'calc(100vh - 112px)' }}>
      <div style={{ marginBottom: 16 }}>
        <h2>系统运维控制台</h2>
      </div>
      
      <Layout style={{ height: 'calc(100% - 50px)', background: '#fff' }}>
        <Sider width={200} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
          <Menu
            mode="inline"
            selectedKeys={[activeTab]}
            items={menuItems}
            onClick={({ key }) => setActiveTab(key as TabKey)}
            style={{ borderRight: 0, height: '100%' }}
          />
        </Sider>
        
        <Content style={{ padding: '0 24px', overflow: 'hidden' }}>
          {renderContent()}
        </Content>
      </Layout>
    </div>
  );
};

export default SystemOps;