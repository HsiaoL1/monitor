设置代理的接口:

/api/v1/internal/cloud/batch/set-proxy

POST 请求，参数：

```json
[
  {
  "device_id": "", // 本质是dev_code
  "device_type": 2, // 云设备ID列表 device_type
  "proxy_id": 1 // 代理ID 新的代理的id
}
.......
]
```
