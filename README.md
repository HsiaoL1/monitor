目前三个服务的pprof接口

- ims_server_ws http://47.242.170.252:9000/debug/pprof/
- ims_server_web  http://47.242.170.252:9090/debug/pprof/
- ims_server_mq  http://47.242.170.252:9002/debug/pprof/

服务器服务的启动脚本

```bash
#!/bin/bash

echo "启动 ims_agent_api ..."
cd /opt/ims_agent_api && ./deploy.sh

echo "启动 ims_server_api ..."
cd /opt/ims_server_api && ./deploy.sh

echo "启动 ims_server_active ..."
cd /opt/ims_server_active && ./run.sh

echo "启动 ims_server_send ..."
cd /opt/ims_server_send/cmd/ims_server_send && ./deploy.sh

echo "启动 ims_server_task ..."
cd /opt/ims_server_task/cmd/ims_server_task && ./deploy.sh

echo "启动 ims_server_web ..."
cd /opt/new_ims/ims_server_web/cmd/server && ./deploy.sh

echo "启动 ims_server_ws ..."
cd /opt/new_ims/ims_server_ws/cmd/server && ./deploy.sh

echo "启动 ims_server_mq ..."
cd /opt/new_ims/ims_server_mq/cmd/mq && ./deploy.sh

echo "所有服务已启动完成。"
```

服务器的ip地址：47.242.170.252
服务器的登录用户：root
服务器的登录密码：ppG3U%3AKVCL
