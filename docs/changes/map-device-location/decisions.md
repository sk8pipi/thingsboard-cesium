# 已批准决策与冻结契约

2026-09-26 用户明确“按你推荐的方案实现”，批准唯一正式位置、跨屏更新、并发冲突、兼容投影与模型规则调整。旧模板优先和无条件最后保存覆盖规则被本决策替代。

## RIO
- Risks：多请求部分成功、旧模板/旧页面覆盖、模型锚点重算、遗留冲突无法自动判断正确性。正式位置优先、后端乐观锁、草稿独立、显式确认处理。
- Impact：位置 API 与运行时响应新增；设备 additionalInfo 增加 mapLocation，不改 SQL schema、身份、部署、视频 API。SERVER_SCOPE 与平铺坐标是兼容投影。
- Options：采用设备唯一位置；不复制更新全部模板，不建设全局共享模型。
- 迁移：只读识别与逐设备显式确认；不自动批量写真实数据。无历史位置备份，代码回退不恢复已确认坐标。

## 前后端冻结接口
- GET /api/map-device/{deviceId}/location：返回 {location: DeviceLocation|null}，校验设备 READ。
- PUT 同路径：仅 TENANT_ADMIN + 设备 WRITE；请求 {longitude,latitude,height,expectedRevision}；返回 {location: DeviceLocation,attributesSynced:boolean}。
- DeviceLocation={longitude:number,latitude:number,height:number,heightMode:'absolute',revision:number,updatedTime:number,source:'confirmed'|'legacy'}。
- confirmed 存设备 additionalInfo.mapLocation。legacy 只读取有效 additionalInfo 位置，再取 SERVER_SCOPE 位置，revision=0；空位置返回 null。不得读取遥测作为固定安装位置。首次确认不需要数据库迁移。
- expectedRevision 必填非负整数。后端在数据库乐观锁保护下核对正式位置版本，不用前端检查代替。旧版本且目标已等于正式位置可幂等返回；不同目标返回 409。位置 revision 单调递增。
- 运行时 devices[uuid].deviceLocation=DeviceLocation|null，最后写入，不能被属性/遥测伪造。运行时读取失败不得采用模板坐标。GET 和 SSE 同源。
- 兼容投影失败返回 attributesSynced=false，正式位置仍成功；重试投影使用最新正式位置，禁止旧目标覆盖较新投影。不声明模板+位置跨 API 原子事务。
- 保护 generic Device 保存入口已存在的 mapLocation，不允许旧编辑器移除或绕过位置接口修改正式位置。
- 模板 version 9。草稿 positionSource='template' 仅编辑预览有效；正式展示 positionSource='device'，禁用模型变换对正式世界坐标的覆盖。单点遮挡仍模板级。
