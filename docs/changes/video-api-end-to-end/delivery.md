# 任务交付记录

## 基本信息

- 任务编号：video-api-end-to-end
- 任务名称：完善视频 API 端到端能力
- 当前状态：已完成
- 当前主 Agent：主 Agent
- 最后更新：2026-08-09

## 协作登记

- 活动任务登记：docs/changes/active-tasks.json
- 任务目录：docs/changes/video-api-end-to-end
- 工作树：仓库主工作树
- 写入策略：主 Agent 单写；子 Agent 只读调查与最终复审
- 共享资源：本地 ThingsBoard/WVP/ZLMediaKit 环境仅串行验证，本轮未启动或重建

## 目标与非目标

本轮完成：

- ZLMediaKit Hook 到 WVP 与 ThingsBoard 的兼容扇出。
- 录像回放会话过期、失败重试和并发停止修复。
- WVP 连接/读取超时与稳定错误映射。
- 现有单摄像头弹窗的 PTZ、录像、状态和截图接入。
- 专项测试、部署校验、API/架构文档和任务事实源更新。

本轮不包含：

- 多监控页面、批量视频 API 或持久化监控集合。
- Redis 多节点会话共享、生产播放 Ticket或新 Provider。
- 生产部署、Git 暂存、提交、推送或 Pull Request 操作。

## 工作包与文件所有权

| 工作包 | Agent | 写权限 | 状态 |
| --- | --- | --- | --- |
| Hook 架构调查 | hook_audit | 只读 | 已完成 |
| 后端可靠性调查 | backend_audit | 只读 | 已完成 |
| 前端接入调查 | frontend_audit | 只读 | 已完成 |
| 集中实现与集成 | 主 Agent | 活动登记范围 | 已完成 |
| 独立验证 | final_validation | 只读 | 已完成 |

## 已实现

### Hook 与部署

- 复用 `polaris-nginx:18978` 作为 Hook 中继，不新增长期运行服务。
- 所有 Hook 同步转发给 WVP；选定状态事件异步镜像给 ThingsBoard。
- 同步修改 ZLMediaKit 固定配置和 WVP `media.hook-ip`，避免启动后被 WVP 覆盖。
- Hook Token 只允许请求头，不接受查询参数。
- 绑定按 `mediaServerId + app + stream` 精确解析。
- Compose 的 `Stream_IP` 原有模板替换保持兼容。

### 后端可靠性

- 录像过期会话先停 Provider，成功后再删除。
- 清理失败保留会话，下一周期可重试。
- 同一会话的停止与控制串行化，并发停止只调用一次 Provider。
- WVP Client 增加 5 秒连接超时和 20 秒读取超时的可配置默认值。
- 登录刷新后的网络错误统一为 `502`，上游业务错误不再透传原始正文。

### 前端闭环

- 实际地图入口 `CameraMonitorPopup.vue` 已接入 `CameraVideoOperations.vue`。
- PTZ 统一调用 Video API，不再由弹窗直连 ThingsBoard RPC。
- 支持状态轮询、截图、录像查询、创建回放、暂停/恢复、定位、倍速和停止。
- 关闭、切换设备与卸载时清理轮询、Blob URL、直播会话和录像会话。
- 实际弹窗、遗留面板和普通运行时日志不再显示或记录 RTSP/完整播放 URL。
- 地图点击入口不再把 ThingsBoard 遗留 URL 注入播放器；直播和录像只接受 Video API 返回的同源 `/video-stream/` 地址。
- 状态、截图、PTZ、录像查询、播放和控制均使用请求代际校验，旧响应不会覆盖新设备或新回放。

## 验收标准

- [x] WVP 原 Hook 主响应路径在配置上保持。
- [x] 录像会话过期、失败重试和并发停止有自动化测试。
- [x] WVP 超时可配置且错误消息固定。
- [x] 实际单摄像头弹窗完成 API 接线和资源释放。
- [x] 后端专项测试、前端定向检查、Compose 静态校验和治理校验通过。
- [x] API、架构、部署说明和任务事实源已同步。
- [ ] Docker 渲染后的 `nginx -t` 与真实设备 PTZ/录像烟测；受当前环境限制，详见 verification.md。
- [x] 独立复审完成；最终无 P0/P1/P2/P3 未关闭项。

## 当前进度

- 实现、自动化测试、前端定向检查、Compose 静态校验和文档同步已完成。
- 独立复审提出的遗留 URL、异步切换和录像控制竞态已关闭，最终无交付阻塞。
- Docker 渲染配置和真实设备烟测仍是环境受限项。

## 残余风险

- 录像与直播会话仍为单 ThingsBoard 进程内存状态，多节点共享不在本轮范围。
- Provider 停止请求发生网络超时时，远端结果可能不确定；当前采用保留记录并重试的至少一次策略。
- 未显式声明 `supportsPlayback=false` 的摄像头会显示录像区；不支持时由 Video API 返回能力错误。
- 仓库全量前端类型检查仍有大量与视频无关的基线错误。

## 人工 Git 交付

- 建议提交分组：后端可靠性与测试；Hook/部署；前端接线；文档与任务事实源。
- 建议 commit message：`完善视频 API 端到端能力`
- 重要提交引用（由用户提交后填写）：
- AI Git 写操作：未执行暂存、提交、推送、合并或 PR 操作。