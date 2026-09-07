# 大屏资产层级验证

## 计划验证
资产树、多父级、循环、权限过滤、搜索路径、关系缓存和请求失败专项测试；原点位筛选回归；ESLint、Vue编译和定向类型检查。

## 执行结果
- `pnpm exec esno tests/mapAssetHierarchy.test.ts`：通过。覆盖楼栋/楼层/房间、多父级、闭环、不可见关联目标过滤、关系类型过滤、搜索保留路径、展开、缓存去重/失效/失败重试、并发上限、加载失败、过期请求、规模限制及目录和点位筛选共享缓存。
- `pnpm exec esno tests/mapAssetPointFilter.test.ts`：通过，原有后代资产点位筛选回归正常。
- 针对 MapHome、MapAssetSelector、新服务和测试的 ESLint：通过。
- MapHome、MapAssetSelector 的 Vue SFC 脚本和模板编译：通过。
- `pnpm exec vue-tsc --noEmit -p tests/tsconfig.map-asset-hierarchy.json`：未通过。依赖链中已有 EditableCell、lock、multipleTab、permission、websocket、alarm API 和 ECharts 等类型错误；没有本次修改文件的诊断。不将此结果记作全项目类型检查通过。
- Edge 客户用户大屏：搜索“石油”返回两个匹配资产；选择“石油科技大楼”后为 13/102 个点位；刷新目录可完成并保留选择；恢复“全部资产”后为 102/102。当前真实目录未显示楼层子资产，多层级结构由专项测试覆盖，未新增或修改实际数据。
- 未修改后端、数据库结构、实际资产关系；未运行迁移或重启共享服务。

## 交付检查
治理校验与 `git diff --check` 通过。未暂存、提交或推送。
