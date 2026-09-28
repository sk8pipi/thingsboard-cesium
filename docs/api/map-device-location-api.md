# 设备地图位置 API

本接口只处理设备安装位置；设备主键为 ThingsBoard Device UUID。浏览器通过现有 ThingsBoard JWT 访问，不暴露后台凭证。

## 读取

`GET /api/map-device/{deviceId}/location`：需 Device READ 权限，返回 `{ "location": DeviceLocation | null }`。`null` 表示没有可信位置；设备或 SERVER_SCOPE 读取失败按实际权限/服务错误返回，不能冒充空位置。

`DeviceLocation` 字段：`longitude`、`latitude`、`height`（椭球绝对高度）、`heightMode: "absolute"`、`revision`、`updatedTime`、`source: "confirmed" | "legacy"`。旧设备从 additionalInfo 或 SERVER_SCOPE 只读解析时 revision 为 0，高度缺失按 0 米兼容、待管理员核对；GET 不会自动写回。

## 保存

`PUT /api/map-device/{deviceId}/location`：仅 TENANT_ADMIN 且需 Device WRITE 权限。请求示例：

```json
{"longitude":114.1,"latitude":30.2,"height":42.5,"expectedRevision":0}
```

返回 `{ "location": DeviceLocation, "attributesSynced": boolean }`。正式设备位置已经提交，但兼容 SERVER_SCOPE 属性写入失败时 `attributesSynced=false`，仍应以返回的正式位置展示；重复请求相同目标可重试属性投影。请求坐标非有限数、超出经纬度范围、缺少绝对高度或 revision 非非负整数时拒绝写入。位置版本变化且目标不相同时返回 HTTP 409；客户端保留草稿，重新 GET 并让管理员重新确认，不能自动用新 revision 覆盖。设备版本变化的并发写入也返回版本冲突。

## 大屏运行时

现有 `GET /api/map-template/{dashboardId}/runtime` 和 `/runtime/events` 的 `devices[设备UUID].deviceLocation` 含同一 `DeviceLocation` 或 null。它是保留字段，与普通 `longitude/latitude` 遥测字段区分。SSE `runtimeUpdated` 可以不含模板但包含设备位置更新；前端只接受不低于当前 revision 的值。现有模板访问权限边界不变，位置 API 另行校验设备权限。

## 兼容与局限

设备 `additionalInfo` 的平铺坐标别名与正式位置在同一次 Device 保存；SERVER_SCOPE 是兼容投影。属性投影和 Device 保存不是单一事务，响应必须逐项说明。模板保存和设备位置保存同样不是原子操作，模板保存成功后设备失败会留下待同步草稿供重试。生产数据迁移与批量坐标修改不在此接口实现中自动执行。
