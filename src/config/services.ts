import { ServiceInfo, ServerConfig } from "../types";

export const serverConfig: ServerConfig = {
  ip: "119.8.54.133",
  username: "root",
  password: "ppG3U%3AKVCL",
};

export const services: ServiceInfo[] = [
  {
    name: "ims_agent_api",
    path: "/opt/ims_agent_api",
    deployScript: "./deploy.sh",
    status: "unknown",
  },
  {
    name: "ims_server_api",
    path: "/opt/ims_server_api",
    deployScript: "./deploy.sh",
    status: "unknown",
  },
  {
    name: "ims_server_active",
    path: "/opt/ims_server_active",
    deployScript: "./deploy.sh",
    status: "unknown",
  },
  {
    name: "ims_server_send",
    path: "/opt/ims_server_send/cmd/ims_server_send",
    deployScript: "./deploy.sh",
    status: "unknown",
  },
  {
    name: "ims_server_task",
    path: "/opt/ims_server_task/cmd/ims_server_task",
    deployScript: "./deploy.sh",
    status: "unknown",
  },
  {
    name: "ims_server_web",
    path: "/opt/ims_server_web/cmd/server",
    deployScript: "./deploy.sh",
    pprofUrl: "http://119.8.54.133:9090/debug/pprof/",
    status: "unknown",
  },
  {
    name: "ims_server_ws",
    path: "/opt/ims_server_ws/cmd/server",
    deployScript: "./deploy.sh",
    pprofUrl: "http://119.8.54.133:9000/debug/pprof/",
    status: "unknown",
  },
  {
    name: "ims_server_mq",
    path: "/opt/ims_server_mq/cmd/mq",
    deployScript: "./deploy.sh",
    pprofUrl: "http://119.8.54.133:9002/debug/pprof/",
    status: "unknown",
  },
];
