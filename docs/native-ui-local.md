# 本地 ThingsBoard 原生界面

ThingsBoard 原生 Angular 界面由 `backend/ui-ngx` 构建，通过 `ui-ngx` JAR 中的
`public/` 静态资源随 Java 后端提供，访问地址为 `http://localhost:8080/`。

## 启动

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-thingsboard-video-local.ps1
```

脚本在启动后端前安装原生 UI 到本地 Maven 仓库。没有构建产物时自动构建；
已有 `backend/ui-ngx/target/generated-resources/public/index.html` 时复用产物。
修改 Angular 源码后使用 `-RebuildNativeUi` 强制重新构建。
本地凭证仍由既有启动脚本在进程内加载，不应复制到 UI 目录。

若后端已经运行，先在原启动终端按 `Ctrl+C` 停止，再执行上述命令。
静态资源 JAR 更新后必须重新启动 Java 进程，尤其是启动时缺少 `index.html` 的情况。

## 故障原因和源码来源

`No static resource .` 或 `No static resource index.html.` 表示请求已到达后端，
但原生前端资源缺失。只有 Maven 元信息的空 `ui-ngx` JAR 不能提供页面。

本仓库还曾因 `.gitignore` 的 `backend/**/output/` 规则遗漏计算字段输出模块。
该源码目录现已显式排除出忽略规则，恢复以下四个上游文件：

- `calculated-field-output.component.html`
- `calculated-field-output.component.scss`
- `calculated-field-output.component.ts`
- `calculated-field-output.module.ts`

来源：[ThingsBoard 上游固定提交 1518aa260b9b39c937212c0a47bc895ee0a86312](https://github.com/thingsboard/thingsboard/tree/1518aa260b9b39c937212c0a47bc895ee0a86312/ui-ngx/src/app/modules/home/components/calculated-fields/components/output)。
选择该版本前已核对 `package.json`、简单计算配置组件和地理围栏配置组件与本地内容一致；
保留上游 Apache 2.0 版权声明。

## 验证

构建成功后，`ui-ngx` JAR 应包含 `public/index.html`、JavaScript、CSS 和 `public/assets/`。
重启后检查 `/`、`/login`、页面引用的脚本和样式均返回 HTTP 200，并确认浏览器显示登录页。
无需另开 4200 端口，也无需修改现有 API 或数据库。

### 2026-09-09 本机验证结果

- Angular production 构建通过，初始包 6.67 MB。
- Maven `ui-ngx install` 通过；安装后的 JAR 为 19,270,913 字节，包含 8,273 个非空静态资源。
- 启动脚本 PowerShell 语法检查及修改文件的 `git diff --check` 通过。
- 通过既有本地视频启动脚本重新启动后端，8080 正常监听。
- `/`、`/login` 均返回 HTTP 200、`text/html`，正文包含 `tb-root`。
- 首页引用的 14 个 JavaScript/CSS 资源均返回 HTTP 200 和对应内容类型。
- `POST /api/noauth/oauth2Clients` 返回 HTTP 200。
- 应用内浏览器访问被客户端拦截（`net::ERR_BLOCKED_BY_CLIENT`），未完成浏览器视觉验收和登录后的业务功能验收。
- 未执行 Git 暂存、提交、推送或 GitHub 操作。
