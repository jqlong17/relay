# FAQ

本目录用于记录项目在沟通过程中反复出现的用户问题，方便后续统一口径。

记录原则：

- 每条 FAQ 聚焦一个具体问题
- 区分“当前实现”与“后续规划”
- 优先记录可直接复用给外部的回复话术
- 如有依据，附上相关代码或文档路径

---

## 2026-04-03

### Q1. Web 调用 CLI 是用 Authon 吗？

结论：

当前不是。

当前实现：

- 当前链路是 `Web -> 本地 bridge -> 本地 Codex runtime/CLI`
- Web 侧通过 `/api/bridge/*` 代理到本地 `local-bridge`
- `local-bridge` 再调用本地 `codex exec` 或 `codex app-server`
- 当前代码中没有发现 `Authon` 接入，也没有现成的 `Authorization/Bearer token/OAuth` 这类鉴权实现

建议回复：

> 不是。我们现在这个项目里，Web 调用 CLI 的链路不是走 `Authon` 这类鉴权中间层，而是 `Web -> 本地 bridge -> 本地 Codex runtime/CLI`。当前代码里也没有接入 `Authon`、`Bearer token`、cookie session 这类现成鉴权实现。Web 侧只是把请求代理到本地 `local-bridge`，bridge 再去拉起本地 `codex` 进程或 `codex app-server`。如果后面做远程访问，规划里会加一层密码登录和本地 session cookie，但那是后续版本方案，不是当前已落地实现。

是否需要后续考虑：

- 需要考虑“鉴权能力”，但不一定要考虑 `Authon`
- 如果产品继续是“本机 Web + 本地 bridge”的单用户形态，通常不需要引入额外鉴权平台
- 如果后续要支持公网访问、跨网络访问或多设备使用，至少要补上访问控制层
- 按当前仓库规划，后续更贴近的是“强密码 + 本地 session cookie + Web 层拦截”，而不是完整账号系统
- 只有当后续目标升级为多用户、组织级权限、第三方登录或统一身份体系时，才有必要认真评估是否引入外部认证方案

依据：

- `/Users/ruska/project/web-cli/apps/web/src/app/api/bridge/_lib.ts`
- `/Users/ruska/project/web-cli/services/local-bridge/src/services/codex-cli.ts`
- `/Users/ruska/project/web-cli/services/local-bridge/src/services/codex-app-server.ts`
- `/Users/ruska/project/web-cli/workflow/设计/04-v0.0.2-远程可达版产品目标.md`
