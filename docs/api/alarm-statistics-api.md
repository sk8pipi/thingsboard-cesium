# 报警趋势统计接口

## 请求
GET /api/alarm/statistics/trend?mode=sevenDays

使用项目现有 ThingsBoard JWT 鉴权（X-Authorization: Bearer <JWT>）。
只允许 TENANT_ADMIN、CUSTOMER_USER。

| 参数 | 可选值 | 默认 |
| --- | --- | --- |
| mode | sevenDays、twentyFourHours | sevenDays |

统计范围由后端登录身份确定。接口不提供切换租户/客户、无限时间范围、状态过滤或报警明细功能。

## 响应
HTTP 200，Cache-Control: no-store。

| 字段 | 类型/语义 |
| --- | --- |
| mode | 请求模式 |
| timeZone | 固定 Asia/Shanghai |
| generatedAt | 本次统计截止时间，服务端Unix毫秒 |
| startTime | 最早桶起点，包含 |
| endTime | 与 generatedAt 相同，包含；最后一桶仅统计到该时刻 |
| completeFrom | 历史完整采集起点，Unix毫秒 |
| historicalDataIncomplete | startTime 早于 completeFrom 时为 true |
| buckets | 按时间升序的7个日桶或24个小时桶 |

每个桶：

| 字段 | 语义 |
| --- | --- |
| key | 桶唯一键 |
| startTs、endTs | 桶自然边界，[startTs,endTs) |
| label | MM/dd 或 HH:mm，北京时间 |
| total | 非负整数，本桶创建过的报警数 |
| severityCounts | CRITICAL、MAJOR、MINOR、WARNING、INDETERMINATE，五项齐全，总和等于 total |

同一报警仅计一次；确认、解除、删除不减少总数。严重度更新迁移分类，删除后保留最后等级。
客户归属采用创建时快照，不因设备转移重分配。不存在报警不代表历史不存在。
缺数据的历史时期通过覆盖字段说明，零桶不代表启用前从未发生报警。

## 错误
- 400：非法 mode。
- 401：未登录或登录失效。
- 403：角色不允许，或客户用户缺失有效客户身份。
- 503：数据库查询不可用、统计表未迁移、覆盖元数据缺失。响应包含安全 message，不输出SQL或连接信息。

客户端首次加载失败显示错误；刷新失败保留最近成功结果并提示失败；禁止退回现存报警数量。
响应解析失败按加载错误处理，不补造零数据。

## 兼容与部署
这是新增接口。原 /api/v2/alarms、报警确认/解除/删除接口不变。
既有数据库先执行经批准的显式迁移，再启用新部件。详见任务 migration.md。
