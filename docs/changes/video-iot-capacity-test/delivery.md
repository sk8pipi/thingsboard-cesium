# 视频与传感器本地容量基线及多摄像头复用指南交付记录

## 基本信息

- 任务编号：video-iot-capacity-test
- 任务名称：视频容量基线与多摄像头复用指南
- 当前状态：待人工提交
- 当前主 Agent：主 Agent
- 最后更新：2026-08-29

## 目标

- 在当前开发机和本地 Docker 拓扑上执行传感器、MQTT、Gateway、ThingsBoard、RTSP、HLS 与 Hook 链路容量测试。
- 给出已验证稳定下限、已验证失败上限、瓶颈位置和停止条件。
- 测试过程中发现的启动阻塞做最小修复，并完成回归验证。
- 基于已成功显示的单路监控闭环，形成可复用的多摄像头接入、配置、播放、释放、诊断和验收指南。

## 非目标

- 不把单路视频源的多观看者测试等同于多摄像头接入容量。
- 不在出现明确数据丢失后继续执行 1000/3000 条每秒档位。
- 不给出生产容量承诺；本结果只适用于本档案记录的开发机与本地配置。
- 本轮只读梳理现有实现并编写文档，不启动、停止或修改 Docker、数据库和共享端口。

## 已批准方案摘要

- 阶梯施压，先基线、再上探；达到错误、队列满或资源安全线即停止。
- 视频分别测原始 RTSP 和前端真实同源 `/video-stream` HLS。
- 传感器分别测 Broker-only 和 MQTT -> Gateway -> ThingsBoard 端到端链路。

## 已完成

- 修复 ThingsBoard 启动时录像会话管理器构造器注入歧义。
- 修复 Nginx 只读父目录下嵌套文件挂载问题。
- 修复 Hook 扇出正则 location 中带 URI 的 proxy_pass 配置错误。
- 完成专项单元测试、视频平台校验、MQTT Broker-only、RTSP、同源 HLS 和传感器端到端测试。
- 500 条/秒出现 Gateway 内存存储满后按停止条件终止，排空积压并恢复原 100 条/秒模拟器。
- 修复 WVP 媒体服务器并发登记的检查后插入竞态，并完成 1/1 专项单测、镜像构建和运行时回归。
- 只读确认 Gateway 持久化设备文件已恢复为有效 JSON，重新启动后未再出现 `Extra data` 或持久化解析错误。

## 修改范围

- `backend/application/src/main/java/org/thingsboard/server/service/video/VideoRecordingSessionManager.java`
- `video-platform/deploy/compose.web.yaml`
- `video-platform/config/nginx/zlm-hook-fanout.conf.template`
- `video-platform/source/wvp-GB28181-pro/pom.xml`（嵌套 Git 仓库）
- `video-platform/source/wvp-GB28181-pro/src/main/java/com/genersoft/iot/vmp/media/service/impl/MediaServerServiceImpl.java`（嵌套 Git 仓库）
- `video-platform/source/wvp-GB28181-pro/src/test/java/com/genersoft/iot/vmp/media/service/impl/MediaServerServiceImplTest.java`（嵌套 Git 仓库）
- `docs/changes/video-iot-capacity-test/*`
- `docs/changes/active-tasks.json`
- `docs/ai/architecture-index.md`
- `docs/ai/multi-camera-video-onboarding.md`

## 当前风险

- 当前硬件只有约 8 GB 内存，Docker 分配 3.713 GiB；测试时主机最低可用内存约 0.38 GB。
- 传感器 100 条/秒稳定、500 条/秒失败；101-499 条/秒没有继续二分测试，不能宣称精确阈值。
- 视频只使用一个 720p H.264/AAC 源模拟多观看者，未验证多路摄像头同时注册、转码或录像。
- WVP 嵌套源码仓库当前处于 detached HEAD，且被主仓库忽略；用户需在嵌套仓库中单独建立分支并人工提交，主仓库提交不会包含该修复。
- Gateway 文件当前有效且启动回归通过，但此前 `Extra data` 的原始写坏时序未能复现；本轮没有修改外部仿真目录。
- WVP 运行时仍记录 1 条非重复键、非数据完整性、非启动失败的其他 ERROR，未阻断 HTTP/HLS 健康验证。
- 当前直播启动实现只接入 WVP StreamProxy；真实 GB28181 设备/通道的直播启动尚未接入 `VideoProvider`，不能把 PTZ/录像字段误当成直播能力。
- `GET /api/video/cameras` 当前会同步逐条查询上游，绑定数量和坏代理都可能放大列表延迟或导致整表失败；大规模接入前需独立优化并补充隔离测试。
- 当前可提交视频配置仍有硬编码媒体 API 凭据的历史安全债；本轮没有读取或复制其值，进入共享或生产环境前需另立任务轮换并外部化。

## 人工 Git 交付

- AI 未执行 git add、commit、push、merge、rebase 或 PR 操作。
- 建议主仓库提交分组：启动阻塞修复；Hook/Nginx 修复；容量测试事实源。
- WVP 修复位于独立嵌套 Git 仓库，必须由用户在该仓库另建分支并单独提交。
- 建议 commit message：`test(video): record local video and telemetry capacity baseline`
- 复用指南建议 commit message：`docs(video): add reusable multi-camera onboarding guide`
- WVP 建议 commit message：`fix(media): handle concurrent media server registration`

## 验收标准

- [x] 当前开发机环境与停止条件有记录。
- [x] MQTT Broker-only 与端到端传感器链路均有测试证据。
- [x] RTSP 与同源 HLS 并发均有测试证据。
- [x] 失败档位按安全门禁停止并恢复原基线环境。
- [x] 启动阻塞修复有专项或集成验证。
- [x] 活动任务登记与治理校验通过。

## 工作包与文件所有权

| 工作包 | Agent | 文件范围 | 状态 | 停止条件 |
| --- | --- | --- | --- | --- |
| 启动阻塞修复 | 主 Agent | VideoRecordingSessionManager.java、compose.web.yaml、zlm-hook-fanout.conf.template | 已完成 | 服务与校验通过 |
| WVP 登记竞态闭环 | 主 Agent | 嵌套 WVP 仓库的 MediaServerServiceImpl、专项测试与 POM 测试开关 | 已完成 | 单测、镜像构建、运行时回归通过 |
| 容量测试执行 | 主 Agent | 本地共享测试环境 | 已完成 | 错误、队列满或资源安全线 |
| 结果与治理记录 | 主 Agent | docs/changes/video-iot-capacity-test、active-tasks.json | 已完成 | 治理校验通过 |
| 多摄像头复用指南 | 主 Agent（汇总）+ 只读调查 Agent | docs/ai/multi-camera-video-onboarding.md、architecture-index.md | 已完成 | 调用链、扩展风险和验收清单完成独立核对 |

## 当前进度

### 已完成

- 所有批准测试档位与停止门禁已经执行。
- 临时负载容器已经清理，原 100 传感器模拟器已恢复并完成连续窗口验证；交付前已停止本轮启动的全部容器与 ThingsBoard 进程。
- WVP 主键冲突与 Gateway JSON 解析两项 P2 遗留问题已闭环；回归结束后本轮容器再次全部停止。
- 结果、限制、发现和修复写入任务事实源。
- 多摄像头复用指南已覆盖身份、绑定、WVP StreamProxy、ZLMediaKit、Video API、同源 HLS、前端会话生命周期、故障树、批量验收和多源容量阶梯。
- 三个只读调查 Agent 分别核对前端、后端媒体链路和多摄像头扩展风险；独立验证 Agent 复核后无剩余 P0/P1/P2。

### 未完成

- 101-499 条/秒区间二分、多摄像头源、录像并发与 24 小时稳定性测试留待独立环境执行。
- WVP StreamProxy 之外的真实 GB28181 直播接入、多宫格产品实现、数据库媒体元组唯一约束、会话共享状态和生产凭据治理留待独立任务。

### 下一步

- 由用户审核复用指南和工作区差异；后续新增摄像头按指南逐路验收，多独立源容量继续在独立环境按 1、2、4、8、16 路阶梯验证。
