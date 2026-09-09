# 验证记录

## 重新选点 DataCloneError 热修复（2026-09-09）
- 根因：pendingPointLocation 使用 Vue ref，候选 modelAnchor 变为 Proxy；attachPoint 直接 structuredClone 触发异常。旧测试的普通 { value } 模拟没有复现响应式边界。
- 修复前将 SFC 测试候选改为真实 Vue ref，运行 mapModelAnchorEditor.test.ts 稳定复现同一 DataCloneError 堆栈。
- 修复后 mapModelAnchor.test.ts、mapModelAnchorEditor.test.ts、mapUnifiedPick.test.ts 均通过；新增 reactive/readonly/嵌套 Proxy、两种点位类型、复制后坐标不共享和输出可克隆断言。
- 受影响服务及两份测试 ESLint、git diff --check 通过。仅修改前端纯数据复制逻辑，无接口/后端变更，未写实际设备。
- 本轮未操作浏览器真实模型；请刷新编辑页后执行“重新选点 → 点击模型 → 确认位置 → 顶部保存”验收。
- 建议提交说明：fix(map): 修复响应式锚点重新选点克隆异常；随未提交功能一并由用户审核提交。AI 未暂存、提交或推送。

## 第二期验证（2026-09-09）

已执行：
- `pnpm exec esno tests/mapModelAnchorEditor.test.ts`：通过。实际 SFC 状态函数与脚本/模板编译；模型/地形重选、取消、过期候选、新增坐标优先级、移除恢复、异步关闭、同轮恢复不写回、模板失败不写设备、部分失败/同步状态失败重试、部件配置不提前保存、路由离开门禁。
- `pnpm exec esno tests/mapUnifiedPoint.test.ts`：通过。排除/类型/业务引用标准化、统计分类保持、无旧坐标备份、候选去重、遗留同步、真实同步服务函数的 API 故障注入、位置别名一致、属性失败和幂等重试。
- `pnpm exec esno tests/mapUnifiedPick.test.ts`：通过。真实拾取函数模拟帧验证自动模型/地形、未知对象/天空、无深度不回退、加载保护、取消/重载/卸载竞态。
- `pnpm exec esno tests/mapModelAnchor.test.ts`：通过。矩阵往返、平移旋转缩放、模型异常、缓存/模板序列化、定位与遥测合并保护、旧接口隔离、模型删除保护。
- `pnpm exec esno tests/mapAssetPointFilter.test.ts`、`tests/mapAssetHierarchy.test.ts`：通过。
- `pnpm exec esno tests/templateAggregateCore.test.ts`、`tests/mapWidgetFullscreen.test.ts`：通过，补查业务聚合与部件全屏回归。
- 受影响 Vue/TS 与新增测试 ESLint：通过。
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.map-model-anchor.json`：本次 map 文件和测试无诊断；整个关联编译链仍失败，包含既存 EditableCell、lock、multipleTab、permission、websocket、报警 API 和 ECharts 共 14 个诊断，不能声称全项目通过。
- 后端：在 backend 运行 `mvn -o -pl application '-Dtest=MapTemplateRuntimeServiceTest' '-DfailIfNoTests=false' '-Dcheckstyle.skip=true' '-Dlicense.skipAddThirdParty=true' test`，BUILD SUCCESS，1 个测试、0 失败/错误。包含 application 编译，验证排除 UUID 去重、无 mapPoints 兼容、基础状态/传感器采集字段保持。首轮未给 PowerShell 的带点参数加引号导致参数解析失败，已改正后通过。
- 本地 5173 无监听；未启动/重启共享环境、未登录、未改实际模板或设备数据。
- 独立只读审查发现三个问题（统计集合、同轮恢复多余写回、保存期间路由切换），主 Agent 已修复并补测试；修复后独立 Agent 因额度不足未复审。

## 手动验收步骤（尚未执行）
1. 启动更新后的前后端，租户管理员进入目标大屏编辑页 → 编辑 → 选点。
2. 分别点击测试模型屋顶/墙面和真实地形，确认位置描述，再选择传感器/监控点位与设备。不保存先取消，核对 ThingsBoard 坐标未变化。
3. 编辑模式点击已有传感器/摄像头 → 重新选点 → 模型或地面 → 确认位置。检查模型到地面后不再跟随模型；Esc/取消保持原草稿位置。
4. 顶部保存，核对设备影响数量；确认后查看 ThingsBoard 经纬度/高度，刷新编辑页与同模板用户页，核对位置、资产筛选和视频入口。
5. 点位菜单 → 从当前大屏移除 → 保存。核对用户页刷新/切换资产不重现，TB 设备、视频绑定、历史数据仍在，部件设备/能耗/告警口径不因隐藏改变。
6. 已移除点位 → 恢复显示或重新选点并恢复；直接恢复使用当前设备位置，不复原旧模型绑定。先移动再移除不应写入放弃坐标。
7. 测试环境模拟设备属性写失败，核对模板已保存/失败明细/待同步标记，刷新后重试；不得在生产设备执行批量故障实验。
8. 保存期间尝试浏览器后退、切换模板、重复点击保存；检查不会切换写入目标。取消编辑仅放弃未保存草稿，不撤销已完成阶段。
9. 调整模型位置/朝向/比例，核对点位跟随；测试隐藏、加载失败、资源 revision 变化。旋转视角检查正常遮挡与穿透模式。

## 限制
纯矩阵、模拟帧与 SFC 逻辑测试不等于 GPU 端到端验证。透明/极薄表面、LOD 精度和海量点位性能未实测。没有生产部署、数据库迁移或实际设备写回。后端已有运行时 dashboard/租户授权边界保持原样，不声称新增逐设备客户权限校验。

## 交付检查
最终 `scripts/validate-agent-governance.ps1` 与 `git diff --check` 通过。AI 未暂存、提交或推送。
