# 验证记录

2026-09-12，基线 HEAD bcceead，任务开始工作区干净。本轮均为代码/隔离测试，没有向用户数据库或模板写入数据，没有重启共享服务。

## 已通过

- 后端 MapTemplateRuntimeServiceTest：7 项，Failures 0、Errors 0、Skipped 0，Surefire 报告耗时 5.121 秒。覆盖受保护元数据、同配置查询去重、失败降级、配置变化与已有位置/排除业务引用。
- 前端 7 个专项脚本全部通过：mapDeviceProfile、mapProfileBillboard、mapProfileRendering、mapModelAnchorEditor、mapModelAnchor、mapUnifiedPoint、templateAggregateCore。命令为 frontend 中 pnpm exec esno tests/<名称>.test.ts。
- 元数据身份隔离、旧缓存刷新、配置改名/换配置、单点继承、原生图片、迁移冲突/包装属性/序列化、统计 ID 分组、位置写回隔离；图片认证下载去重、失败回退、Blob 释放和卸载；真实 CesiumMap 渲染函数验证传感器/摄像头普通遥测复用实体、图标变化、位置变化与删除。
- 真实 SFC 编译及编辑函数验证：统一选点、自动按配置分流、移除恢复、异步取消、保存失败和重试，包含地图、用户页、详情和摄像头弹窗组件。
- 受影响前端文件及新增测试 Prettier、ESLint 通过。

后端复现命令（backend 目录）：mvn -o -pl application -Dtest=MapTemplateRuntimeServiceTest -DfailIfNoTests=false -Dcheckstyle.skip=true -Dlicense.skipAddThirdParty=true test。

## 未通过的仓库级检查

- pnpm run type:check 未通过，存在通用组件、规则链、产品配置等模块的类型错误。定向 vue-tsc --noEmit -p tests/tsconfig.map-model-anchor.json 同样受 14 条共享模块错误影响，涉及 EditableCell、lock/multipleTab/permission/websocket、alarm/api 以及五个时序图表组件；这些文件没有本次修改。定向检查没有报告本次地图/配置修改文件错误，不能将其表述为类型检查全部通过。
- pnpm run build 在读取现有压缩插件配置时失败：缺少 VITE_BUILD_COMPRESS，且本地没有 .env.production。用子进程临时设置 VITE_BUILD_COMPRESS=none、VITE_OUTPUT_DIR=node_modules/.cache/map-device-profile-build 后再次检查，编译在现存 CommonWidgetEditor.vue 空文件处失败。git cat-file -s HEAD:frontend/src/views/tb/dashboard/runtime/editors/CommonWidgetEditor.vue 及当前文件长度均为 0，确认是基线问题；没有修改环境文件或通用部件来掩盖失败。

## 未验证和限制

- 未启动新后端版本、未用真实客户会话验证 SSE/私有图片/视频播放、未完成真实 WebGL 视觉验收；自动函数与模板编译测试不能替代这些检查。
- 当前服务需要用原有脚本重启后才提供新 entityMetadata。未改启动方式。
- 没有成百上千点容量承诺；复用现有运行时轮询，图片缓存与可见变化才更新实体减少前端重复工作。
- 没有执行模板批量迁移、设备重新分配或生产部署。模板迁移由管理员检查样式后确认保存触发；代码回退不撤销已单独确认的位置写回。

## 最终门禁

scripts/validate-agent-governance.ps1 通过（1 个活动任务、4 个角色配置）；git diff --check 通过，只有 Git 的 CRLF 提示，没有空白错误。AI 没有暂存、提交、推送或 GitHub 操作。
