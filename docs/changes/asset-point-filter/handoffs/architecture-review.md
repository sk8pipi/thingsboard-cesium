# 架构审查交接

- Agent：architecture_review（只读）
- 状态：已完成
- 结论：首期复用现有 Asset 与 EntityRelation API，不新增后端接口。
- 契约：`Asset --COMMON/Contains--> Asset/Device`，按资产直接关系执行有限并发 BFS，资产与设备去重并设置规模上限。
- 权限：关系控制器校验根资产 READ，并过滤任一端无 READ 权限的关系；资产筛选仍只是展示条件，不替代后端权限。
- 禁止项：不使用复合关系接口做无限递归，因为过滤器不限制递归途经路径；不猜测反向、`Manages` 或自定义关系为资产归属。
- 视频边界：摄像头继续使用 ThingsBoard Device UUID；Video API、播放 URL、Token 和流身份均不变。
