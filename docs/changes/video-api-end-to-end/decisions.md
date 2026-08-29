# 任务决策记录

## DEC-001：本轮只完善现有单摄像头视频能力

- 状态：已批准
- 日期：2026-08-09
- 决策人：用户
- 背景：现有 Video API 已具备直播、截图、PTZ、录像和 Hook 基础实现，但部署接线、可靠性、前端消费和验证尚未闭环。
- 最终决定：本轮完成 Hook 扇出、录像会话清理、WVP 超时、现有单摄像头面板的 PTZ/录像/状态/截图接入、测试与文档事实源更新。
- 选择理由：先使现有 API 端到端可用，再按后续页面需求扩展批量能力。
- 备选方案：同时增加多监控列表、批量播放和持久化监控集合 API。
- Risks：前后端、部署配置和共享本地视频环境同时受影响；真实设备能力可能限制最终烟测范围。
- Impact：修改 Video API 实现、前端现有摄像头面板、视频平台 Hook 配置和相关文档测试。
- Options：未来独立任务设计多监控页面及批量 API。
- 兼容与迁移影响：保持现有公共 API 路径和响应兼容；新增配置提供安全默认值。
- 回退方案：恢复原 Hook 配置、关闭新增转发配置并保留现有 WVP Hook；前端可回退到当前直播播放路径。
- 事实源影响：同步更新 docs/api/video-api.md、docs/ai/video-platform-architecture.md 和本任务验证记录。
- 关联文件或接口：/api/video/**、/api/noauth/video/hooks/zlm/**、video-platform/config、CameraVideoPanel.vue。
- 替代的旧决策：无。

## DEC-002：本轮不增加多监控页面与批量 API

- 状态：已批准
- 日期：2026-08-09
- 决策人：用户
- 背景：用户需要先完成现有能力闭环。
- 最终决定：不增加多监控页面、批量状态/播放接口、持久化监控集合或相关数据库表。
- 选择理由：控制范围，避免在现有链路未稳定前扩展公共契约。
- 兼容与迁移影响：无新增集合领域模型或数据库迁移。
- 回退方案：不适用。
- 事实源影响：任务交付和 API 文档明确记录非目标。
- 关联文件或接口：docs/api/video-api.md。
- 替代的旧决策：无。
## DEC-003：复用现有 Nginx 做 Hook 主代理与镜像扇出

- 状态：已实施
- 日期：2026-08-09
- 决策人：主 Agent（在已批准任务范围内）
- 背景：ZLMediaKit 单事件只能配置一个 Hook URL，而 WVP 必须继续获得并控制原始 Hook 响应。
- 最终决定：复用 `polaris-nginx:18978`；所有 Hook 同步代理给 WVP，受支持状态事件通过 Nginx mirror 发送到 ThingsBoard。
- Risks：错误覆盖 WVP Hook、模板变量过滤破坏原 Web 代理、Token 泄漏、ThingsBoard 故障拖累 WVP。
- Impact：修改 ZLM/WVP Hook 主机、Nginx 模板、Compose 环境变量和部署说明；不改变公共 Video API。
- Options：新增独立 Hook 服务；直接让 ZLM 调 ThingsBoard；由 WVP 二次转发。前两者分别增加服务或破坏 WVP，后一项需要修改外部上游代码。
- 兼容与迁移影响：WVP 仍是同步主响应；`Stream_IP` 保留模板替换；ThingsBoard 镜像失败不影响 WVP。
- 回退方案：把 ZLM 和 WVP `media.hook-ip` 恢复为 `polaris-wvp`，移除 Nginx 18978 模板与环境变量。
- 验收方式：Compose 静态校验；Docker 可用后执行渲染配置 `nginx -t` 和真实 Hook 烟测。
- 事实源影响：同步更新视频架构、API 文档、视频平台 README、环境变量示例和本任务验证记录。
