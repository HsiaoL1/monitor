# 服务器管理控制台

这是一个基于React + Node.js的服务器管理控制台，用于监控和管理远程服务器上的服务。

## 功能特性

### 1. 资源监控面板
- 实时监控各服务的CPU使用率
- 内存使用情况监控
- Goroutine数量统计
- 通过pprof接口获取性能指标
- 可视化图表展示
- 自动刷新（30秒间隔）

### 2. 服务管理界面
- 查看所有服务状态（运行中/已停止/未知）
- 单个服务启动/停止操作
- 批量服务启停管理
- SSH远程执行服务脚本
- 实时状态更新（15秒间隔）

## 技术栈

### 前端
- React 18 + TypeScript
- Ant Design UI组件库
- ECharts图表库
- Axios HTTP客户端
- React Router路由

### 后端
- Node.js + Express
- node-ssh SSH客户端
- Axios HTTP客户端
- CORS跨域支持

## 项目结构

```
control/
├── src/                    # React前端源码
│   ├── components/         # React组件
│   │   ├── ResourceMonitor.tsx  # 资源监控组件
│   │   └── ServiceManager.tsx   # 服务管理组件
│   ├── config/            # 配置文件
│   │   └── services.ts    # 服务配置
│   ├── services/          # API服务层
│   │   └── api.ts         # API接口
│   ├── types/             # TypeScript类型定义
│   │   └── index.ts       # 类型定义
│   ├── App.tsx            # 主应用组件
│   ├── index.tsx          # 应用入口
│   └── index.css          # 样式文件
├── server/                # Node.js后端
│   ├── server.js          # Express服务器
│   └── package.json       # 后端依赖
├── public/                # 静态资源
│   └── index.html         # HTML模板
├── package.json           # 前端依赖
├── tsconfig.json          # TypeScript配置
└── start.sh               # 启动脚本
```

## 服务器配置

目标服务器信息：
- IP地址: 47.242.170.252
- 登录用户: root
- 登录密码: ppG3U%3AKVCL

## 监控的服务

1. **ims_agent_api** - `/opt/ims_agent_api`
2. **ims_server_api** - `/opt/ims_server_api`
3. **ims_server_active** - `/opt/ims_server_active`
4. **ims_server_send** - `/opt/ims_server_send/cmd/ims_server_send`
5. **ims_server_task** - `/opt/ims_server_task/cmd/ims_server_task`
6. **ims_server_web** - `/opt/new_ims/ims_server_web/cmd/server` (有pprof)
7. **ims_server_ws** - `/opt/new_ims/ims_server_ws/cmd/server` (有pprof)
8. **ims_server_mq** - `/opt/new_ims/ims_server_mq/cmd/mq` (有pprof)

## 快速开始

### 1. 一键启动（推荐）
```bash
./start.sh
```

### 2. 分别启动

#### 启动后端服务
```bash
cd server
npm install
npm run dev
```

#### 启动前端服务
```bash
npm install
npm start
```

## 访问地址

- **前端控制台**: http://localhost:3000
- **后端API**: http://localhost:3001
- **健康检查**: http://localhost:3001/api/health

## API接口

### 获取pprof监控数据
```
GET /api/pprof-metrics?url=<pprof_url>
```

### 获取单个服务状态
```
GET /api/service-status?serviceName=<service_name>
```

### 获取所有服务状态
```
GET /api/services-status
```

### 启动服务
```
POST /api/service/start
{
  "serviceName": "service_name",
  "servicePath": "/path/to/service",
  "deployScript": "./deploy.sh"
}
```

### 停止服务
```
POST /api/service/stop
{
  "serviceName": "service_name"
}
```

## 注意事项

1. 确保目标服务器SSH可以正常连接
2. 服务器上的部署脚本需要有执行权限
3. pprof接口需要服务正常运行才能访问
4. 建议在生产环境中加强安全认证
5. 监控数据为实时获取，网络延迟会影响响应时间

## 安全建议

1. 不要将服务器密码硬编码在生产环境中
2. 考虑使用SSH密钥而非密码认证
3. 添加用户认证和权限控制
4. 使用HTTPS加密传输
5. 定期更换服务器密码

## 扩展功能

后续可以考虑添加：
- 日志查看功能
- 服务性能历史趋势
- 告警通知功能
- 多服务器支持
- 用户权限管理
- 配置文件管理