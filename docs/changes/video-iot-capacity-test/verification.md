# 视频与传感器本地容量测试验证记录

## 验证环境

- 日期：2026-08-17，Asia/Shanghai。
- 操作系统：Windows 10 Pro。
- CPU：Intel Core i5-10200H，4 核 8 逻辑处理器。
- 内存：约 8 GB；Docker Desktop 可见 8 CPU、3.713 GiB 内存。
- 视频源：单路 H.264 1280x720 + AAC 虚拟摄像头。
- ThingsBoard：本地 Spring Boot + PostgreSQL；启动日志为 `Started ThingsBoard in 208 seconds`。
- 外部仿真：Mosquitto、ThingsBoard Gateway、虚拟传感器、MediaMTX。

## 启动阻塞与修复验证

| 项目 | 原因 | 修复 | 验证 |
| --- | --- | --- | --- |
| ThingsBoard 启动失败 | `VideoRecordingSessionManager` 两个构造器无明确注入构造器 | 生产构造器增加 `@Autowired` | 服务完成启动；专项单测 3/3 通过 |
| Nginx Compose 启动失败 | 只读模板目录下再挂载单文件，Docker 报只读文件系统 | 父目录挂载缩小为单个 `nginx.conf.template` | 容器可创建 |
| Nginx 循环重启 | 正则 location 的 `proxy_pass` 含 URI | 先 rewrite，再代理到无 URI 上游 | `nginx -t` 通过；入口 HTTP 200；平台 validate 通过 |

## 自动化与静态校验

| 命令/检查 | 结果 |
| --- | --- |
| `mvn -pl application -Dtest=VideoRecordingSessionManagerTest test` | BUILD SUCCESS；3 tests，0 failure/error/skip |
| `docker exec ... nginx -t` | syntax is ok；test is successful |
| `video-platform/manage-video-platform.ps1 validate` | 通过；WVP HTTP 200，ZLMediaKit API 可达 |
| ZLMediaKit 直连 ffprobe | H.264 1280x720 + AAC，可解码 |
| Vite 同源 `/video-stream` ffprobe | HTTPS 同源代理可解码 H.264 1280x720 + AAC |

## MQTT Broker-only 吞吐

该组只证明模拟器与 Mosquitto，不代表 ThingsBoard 端到端容量。

| 目标速率 | 实收 | 时长 | 丢失 | Mosquitto CPU | 内存 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 1000 msg/s | 1005.5 msg/s，10000 条 | 9.944 s | 0 | 1.53% | 4.73 MiB |
| 3000 msg/s | 3021.0 msg/s，30000 条 | 9.930 s | 0 | 5.10% | 6.375 MiB |
| 5000 msg/s | 5038.2 msg/s，50000 条 | 9.924 s | 0 | 7.21% | 6.336 MiB |

## 传感器端到端容量

链路：传感器 -> Mosquitto -> ThingsBoard Gateway -> ThingsBoard MQTT -> 规则引擎 -> PostgreSQL。

| 档位 | 结果 | 关键证据 | 结论 |
| ---: | --- | --- | --- |
| 100 传感器 × 1 Hz | 稳定 | Gateway 每分钟约 6028 条接收/转换，`storageMsgCount=0`，平台推送约 6028 条，无存储满错误 | 当前硬件的已验证稳定下限 |
| 500 传感器 × 1 Hz | 失败 | Gateway CPU 121.6%，主机可用内存约 0.38 GB；连续 `Memory storage is full` 和 `Data ... cannot be saved` | 已验证失败上限；存在数据丢失 |
| 1000/3000 传感器 × 1 Hz | 未执行 | 500 档已触发停止条件 | 防止扩大数据丢失和共享环境风险 |

500 档停止后暂停输入排空；统计显示 `storageMsgCount=10` 且最近窗口无新存储满错误，随后恢复原 100 传感器模拟器。ThingsBoard SQL TS 队列在失败阶段仍显示 `totalFailed=0`，瓶颈位于 Gateway 内存存储/转换发送侧。

## 视频原始 RTSP 并发

该组为 MediaMTX 单源多观看者，不包含 WVP、Hook 和同源代理。

| 并发观看者 | 成功 | MediaMTX CPU | MediaMTX 内存 | 虚拟摄像头 CPU |
| ---: | ---: | ---: | ---: | ---: |
| 5 | 5/5 | 2.38% | 22.66 MiB | 45.33% |
| 10 | 10/10 | 3.48% | 22.66 MiB | 43.26% |
| 20 | 20/20 | 3.95% | 23.26 MiB | 44.67% |
| 40 | 40/40 | 18.25% | 24.96 MiB | 62.40% |

## 前端真实同源 HLS 并发

链路：FFmpeg 观看者 -> Vite HTTPS `/video-stream` -> ZLMediaKit；ZLM `on_play` Hook -> Nginx 扇出 -> WVP 主响应 + ThingsBoard 镜像。

| 并发观看者 | 成功 | 媒体 CPU | 媒体内存 | WVP CPU | WVP 内存 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 5 | 5/5 | 6.64% | 19.45 MiB | 77.73% | 831 MiB |
| 10 | 10/10 | 5.03% | 20.55 MiB | 9.37% | 831 MiB |
| 20 | 20/20 | 8.34% | 20.93 MiB | 18.46% | 831.2 MiB |
| 40 | 40/40 | 14.64% | 23.78 MiB | 216.34% | 832.5 MiB |

- 40 路全部成功，是当前环境的已验证观看并发下限，不是最大值。
- 40 路时 WVP 出现约 2.16 个 CPU 核的瞬时占用，Hook/WVP 是下一步关注点。
- 首轮 PowerShell `Start-Process` 的 0/5、0/10、0/20 退出码因 Windows 句柄采集缺陷作废；单路直接校准为 exit 0，随后 Node 子进程管理器重跑得到上表有效结果。

## 独立发现

- P1：500 条/秒端到端传感器负载导致 Gateway 内存存储满并丢数据。
- P2（已闭环）：WVP 日志存在 `wvp_media_server_pkey` 重复键错误；根因为媒体服务器心跳更新采用先查询再插入的竞态，本轮已修复并完成单测与运行时回归。
- P2（已闭环）：Gateway 曾报 `connected_devices.json` 解析 `Extra data`；当前文件已由 Gateway 重写为有效 JSON，重新启动加载未再出现解析错误。
- P3：本地 ThingsBoard 构建的 `/api/noauth/health` 返回 404；本轮改用启动日志、端口和真实业务链路判断健康。

## 2026-08-18 遗留问题闭环

### WVP 媒体服务器并发登记

- 根因：`MediaServerServiceImpl.update()` 使用“`queryOne(id)` 不存在后再 `add`”的检查后执行流程；并发心跳可同时判断不存在，后插入线程触发 `wvp_media_server_pkey`。
- 修复：保留原有更新/插入逻辑；首次插入遇到 `DuplicateKeyException` 时改为按同一 ID 更新，避免数据库方言相关的 upsert 改造。
- 测试开关：Surefire 默认仍通过 `wvp.skipTests=true` 保持原构建行为；专项测试显式使用 `-Dwvp.skipTests=false`。
- 有效专项命令：`mvn '-Dwvp.skipTests=false' '-Dtest=MediaServerServiceImplTest' test`。
- 单元测试：1 test，0 failure，0 error，0 skipped；BUILD SUCCESS。
- 镜像构建：`tb-video-validation-polaris-wvp` 使用当前源码重新构建成功。
- 运行时回归：WVP 与 HLS 入口均为 HTTP 200；跨越至少四个 10 秒媒体服务器检查周期后，重复键、`DuplicateKeyException`、数据完整性和启动失败计数均为 0。
- WVP 日志另有 1 条非目标 ERROR；计数分类确认不属于重复键、数据完整性或启动失败，本档案不复制可能包含运行环境标识的原始日志。

### Gateway 持久化设备文件

- 只读结构检查：`connected_devices.json` 当前为有效 JSON，文件大小 105461 bytes、3509 行，顶层对象起始数为 1。
- SHA-256：`634157fd6fa123172fb1fbc5c1a5528bf19aee2f6aaa8894ec486916c72eaeb7`，用于标识本次验证对象，不记录文件内容。
- 启动回归：Gateway 容器正常运行；`Extra data` 计数为 0，持久化文件解析错误计数为 0。
- Gateway 到 ThingsBoard 的连接拒绝属于本轮未启动外部 ThingsBoard 服务的预期状态，不影响本地文件解析结论。
- 本轮未修改外部仿真目录中的持久化文件。

## 结论

- 测试任务：完成。
- 当前开发机安全建议：传感器持续负载先按不高于 100 条消息/秒运行；在 Gateway 调优与独立资源扩容前，不采用 500 条/秒。
- 视频观看：单个 720p 源已验证 40 路 RTSP 和 40 路同源 HLS 观看成功；多摄像头源、录像并发、PTZ API 高频调用仍需独立测试。
- 生产容量：不能从本地 8 GB 开发机结果外推，需在目标部署规格上复测并加入 24 小时稳定性、p95/p99 延迟与数据库增长指标。

## 最终恢复与治理校验

- 恢复原 100 传感器后，连续三个一分钟窗口分别接收约 6027、6027、6028 条；`storageMsgCount=0`，平台拉取与推送一致，未再出现存储满错误。
- 临时 `tb-capacity-*` 负载容器已不存在；先恢复原传感器与 Gateway 完成连续窗口验证，交付前再停止本轮启动的仿真栈、视频栈和 ThingsBoard；未删除测试数据，未停止外部 PostgreSQL。
- 遗留问题回归结束后，WVP、ZLMediaKit、Nginx、Redis、虚拟摄像头、Mosquitto、模拟器和 Gateway 容器均已停止；`docker ps` 无运行容器。
- `powershell -ExecutionPolicy Bypass -File scripts/validate-agent-governance.ps1`：通过；Active tasks 1，Agent profiles 4。