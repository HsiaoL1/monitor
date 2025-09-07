import React, { useState, useEffect, useRef } from 'react';
import { Card, Tabs, Button, Space, Input, Row, Col, message } from 'antd';
import { 
  FullscreenOutlined,
  FullscreenExitOutlined,
  ClearOutlined
} from '@ant-design/icons';
import { executeRealCommand } from '../../services/api';
import { TerminalSession } from '../../types';

const { TabPane } = Tabs;

interface TerminalTabProps {
  session: TerminalSession;
  active: boolean;
  output: string[];
  onCommand: (command: string) => void;
  onUpdateOutput: (sessionId: string, newOutput: string[]) => void;
}

const TerminalTab: React.FC<TerminalTabProps> = ({ session, active, output, onCommand, onUpdateOutput }) => {
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [currentDir, setCurrentDir] = useState('~');
  const terminalRef = useRef<HTMLDivElement>(null);

  const handleCommand = (command: string) => {
    if (!command.trim()) return;

    // 添加到命令历史
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);

    // 添加到输出
    onUpdateOutput(session.id, [...output, `$ ${command}`]);

    // 模拟命令执行
    executeCommand(command);
    onCommand(command);
    setInput('');
  };

  const executeCommand = async (command: string) => {
    if (command.toLowerCase() === 'clear') {
      onUpdateOutput(session.id, []);
      return;
    }

    try {
      console.log(`Executing real command: ${command}`);
      onUpdateOutput(session.id, [...output, '执行中...']);
      
      const result = await executeRealCommand(command, session.id);
      console.log('Command result:', result);
      
      // 移除"执行中..."消息
      let newOutput = output.slice(0, -1);
      
      // 更新当前目录（如果返回了workingDir）
      if (result.workingDir) {
        setCurrentDir(result.workingDir.replace(/^\/root$/, '~').replace(/^\/root\//, '~/'));
      }
      
      // 添加命令结果
      if (result.stdout) {
        newOutput = [...newOutput, result.stdout];
      }
      
      if (result.stderr) {
        newOutput = [...newOutput, `Error: ${result.stderr}`];
      }
      
      if (result.exitCode !== 0 && !result.stdout && !result.stderr) {
        newOutput = [...newOutput, `Command failed with exit code: ${result.exitCode}`];
      }
      
      onUpdateOutput(session.id, newOutput);
      
    } catch (error: any) {
      console.error('Command execution failed:', error);
      
      // 移除"执行中..."消息并添加错误信息
      const newOutput = [...output.slice(0, -1), `Error: ${error.message || '命令执行失败'}`];
      onUpdateOutput(session.id, newOutput);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommand(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = Math.min(commandHistory.length - 1, historyIndex + 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Terminal output area - scrollable */}
      <div 
        ref={terminalRef}
        style={{ 
          flex: 1,
          backgroundColor: '#1e1e1e',
          color: '#d4d4d4',
          padding: '16px',
          fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
          fontSize: '14px',
          overflow: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          minHeight: 0 // 重要：允许flex子元素缩小
        }}
      >
        <div>Welcome to Terminal Session: {session.title}</div>
        <div>Type 'help' for available commands.</div>
        <div>---</div>
        {output.map((line, index) => (
          <div key={index} style={{ 
            margin: '2px 0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere' // 长行自动换行
          }}>
            {line}
          </div>
        ))}
      </div>
      
      {/* Terminal input area - fixed at bottom */}
      <div style={{ 
        backgroundColor: '#1e1e1e',
        padding: '8px 16px',
        borderTop: '1px solid #404040',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0 // 防止被压缩
      }}>
        <span style={{ color: '#569cd6', marginRight: '8px', flexShrink: 0 }}>
          root@server:{currentDir}$
        </span>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入命令..."
          bordered={false}
          style={{ 
            backgroundColor: 'transparent',
            color: '#d4d4d4',
            fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
            fontSize: '14px',
            flex: 1
          }}
        />
      </div>
    </div>
  );
};

const Terminal: React.FC = () => {
  const [sessions, setSessions] = useState<TerminalSession[]>([
    { id: '1', title: '终端 1', active: true, connected: true }
  ]);
  const [activeKey, setActiveKey] = useState('1');
  const [fullscreen, setFullscreen] = useState(false);
  const [sessionOutputs, setSessionOutputs] = useState<Record<string, string[]>>({});

  const createNewSession = () => {
    const newId = (sessions.length + 1).toString();
    const newSession: TerminalSession = {
      id: newId,
      title: `终端 ${newId}`,
      active: true,
      connected: true
    };
    setSessions(prev => [...prev, newSession]);
    setActiveKey(newId);
  };

  const removeSession = (sessionId: string) => {
    if (sessions.length === 1) {
      message.warning('至少需要保留一个终端会话');
      return;
    }
    
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    
    if (activeKey === sessionId) {
      const remainingSessions = sessions.filter(s => s.id !== sessionId);
      setActiveKey(remainingSessions[0]?.id || '1');
    }
  };

  const updateSessionOutput = (sessionId: string, newOutput: string[]) => {
    setSessionOutputs(prev => ({
      ...prev,
      [sessionId]: newOutput
    }));
  };

  const handleCommand = (command: string) => {
    console.log('Executing command:', command);
  };

  const handleClear = () => {
    setSessionOutputs(prev => ({
      ...prev,
      [activeKey]: []
    }));
  };

  const quickCommands = [
    { label: 'ps aux', command: 'ps aux' },
    { label: 'top', command: 'top' },
    { label: 'df -h', command: 'df -h' },
    { label: 'free -m', command: 'free -m' },
    { label: 'ls -la', command: 'ls -la' },
    { label: 'systemctl status', command: 'systemctl --type=service --state=active' }
  ];

  return (
    <Card 
      title="终端操作"
      extra={
        <Space>
          <Button 
            size="small" 
            onClick={handleClear}
            icon={<ClearOutlined />}
            ghost
          >
            清空
          </Button>
          {quickCommands.map(cmd => (
            <Button 
              key={cmd.command}
              size="small" 
              onClick={() => handleCommand(cmd.command)}
            >
              {cmd.label}
            </Button>
          ))}
          <Button
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={() => setFullscreen(!fullscreen)}
            size="small"
          />
        </Space>
      }
      style={{ 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column' 
      }}
      bodyStyle={{ flex: 1, padding: 0 }}
    >
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        type="editable-card"
        onEdit={(targetKey, action) => {
          if (action === 'add') {
            createNewSession();
          } else if (action === 'remove') {
            removeSession(targetKey as string);
          }
        }}
        style={{ height: '100%' }}
        tabBarStyle={{ margin: 0, padding: '0 16px' }}
      >
        {sessions.map(session => (
          <TabPane
            tab={
              <span>
                <span 
                  style={{ 
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: session.connected ? '#52c41a' : '#ff4d4f',
                    marginRight: '6px'
                  }}
                />
                {session.title}
              </span>
            }
            key={session.id}
            style={{ height: 'calc(100% - 40px)' }}
          >
            <TerminalTab
              session={session}
              active={activeKey === session.id}
              output={sessionOutputs[session.id] || []}
              onCommand={handleCommand}
              onUpdateOutput={updateSessionOutput}
            />
          </TabPane>
        ))}
      </Tabs>
    </Card>
  );
};

export default Terminal;