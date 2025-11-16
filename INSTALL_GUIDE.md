http://127.0.0.1:8090/api/v1/internal/cloud/batch/update_plugin_external

批量更新插件 (BatchUpdatePluginExternal):

     {
       "device_type": 1,        // 设备类型：1-玉米云，2-百度云
       "merchant_id": 123,      // 商户ID（必须大于0）
       "ids": [1, 2, 3],       // 设备ID列表
       "platform_id": 1        // 应用平台ID：1-whatsapp，2-telegram
     }


http://127.0.0.1:8090/api/v1/internal/cloud/batch/update_app_external
批量更新App (BatchUpdateAppExternal):

     {
       "device_type": 1,        // 设备类型：1-玉米云，2-百度云
       "merchant_id": 123,      // 商户ID（必须大于0）
       "ids": [1, 2, 3]        // 设备ID列表
     }

返回值都是：

     {
       "code": 200,               // 200表示成功，非200表示失败
       "message": "success",    // 返回信息
       "data": null             // 返回数据，当前为null
     }
