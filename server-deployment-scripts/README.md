# 服务器端 CI/CD 部署脚本

这个目录包含了用于在服务器端实施 CI/CD 的 Git Hook 脚本和部署脚本模板。

## 目录结构

```
server-deployment-scripts/
├── README.md                    # 说明文档
├── git-hooks/                   # Git Hook 脚本
│   ├── post-receive-test        # 测试服务器的 post-receive hook
│   └── post-receive-prod        # 生产服务器的 post-receive hook
├── deployment/                  # 部署脚本模板
│   ├── deploy-test.sh          # 测试环境部署脚本
│   ├── deploy-prod.sh          # 生产环境部署脚本
│   ├── health-check.sh         # 健康检查脚本
│   └── rollback.sh             # 回滚脚本
└── setup/                      # 服务器环境设置脚本
    ├── setup-test-server.sh    # 测试服务器环境设置
    └── setup-prod-server.sh    # 生产服务器环境设置
```

## 部署架构

### 服务器环境配置

#### 测试服务器
- 服务器地址: test-server.example.com
- Git 仓库目录: `/opt/repos/[service-name]-test.git`
- 部署目录: `/opt/services-test/[service-name]`
- 日志目录: `/opt/deployment-logs/test`

#### 生产服务器  
- 服务器地址: prod-server.example.com
- Git 仓库目录: `/opt/repos/[service-name]-prod.git`
- 部署目录: `/opt/services-prod/[service-name]`
- 日志目录: `/opt/deployment-logs/prod`

## 工作流程

### 测试环境部署流程
1. 开发者推送代码到 `test` 分支
2. 测试服务器的 post-receive hook 自动触发
3. 执行构建、测试、部署流程
4. 通过 webhook 通知监控系统部署结果

### 生产环境部署流程
1. 通过监控面板触发"提升到生产"操作
2. 系统验证测试环境状态
3. 创建 production-ready 标签
4. 推送到生产服务器仓库
5. 生产服务器的 post-receive hook 执行部署
6. 执行健康检查和验证

## 安装和配置

### 1. 测试服务器设置
```bash
# 在测试服务器上执行
sudo ./setup/setup-test-server.sh
```

### 2. 生产服务器设置
```bash
# 在生产服务器上执行
sudo ./setup/setup-prod-server.sh
```

### 3. 配置 Git Hook
```bash
# 复制 post-receive hook 到对应仓库
cp git-hooks/post-receive-test /opt/repos/ims_server_web-test.git/hooks/post-receive
chmod +x /opt/repos/ims_server_web-test.git/hooks/post-receive
```

## 服务配置

需要为每个服务创建对应的配置文件和部署脚本。参考 `ims_server_web` 的配置示例。

## 监控和日志

- 部署日志存储在 `/opt/deployment-logs/` 目录下
- 可通过监控面板查看部署状态和日志
- 支持 webhook 通知部署结果

## 安全考虑

- 使用专用的部署用户账号
- 限制 Git 仓库访问权限
- 所有部署操作记录日志
- 生产环境部署需要额外验证