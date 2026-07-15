# CLI 接入设计

> 状态：最小闭环已实现并验证。本文件是 UUUtil CLI 的权威设计与实现说明。

## 1. 定位

CLI 是 UUUtil 面向**外部工具**的能力出口：让运行在本机的其他程序（agent skill、脚本、其他应用）通过一条命令，驱动 UUUtil 中各插件工具的能力，并拿到结构化结果。

典型场景：

- 终端里的 agent 干完一段活，顺手 `uuutil call focus.create` 记一笔焦点。
- 脚本通过 hook 触发一条提醒。
- 外部工具往画板推送一段信息。

关键边界：

- CLI 是**进程外**入口，站在 EventBus 前面，做「外部命令 → 内部 bus 事件」的翻译与请求/响应配对。
- EventBus 仍是**进程内、插件之间**的唯一通信通道。内部代码永远直接用 `bus`，永远不经过 CLI。
- CLI 定位上替代已移除的 MCP HTTP 服务：用更轻、协议无关的命令行出口，取代 MCP 协议这套重家伙。

## 2. 通信方式

- **本地 HTTP（loopback）**：CLI 二进制向运行中的 UUUtil 主进程内的 HTTP server 发请求。
- 地址：`http://127.0.0.1:17878/cmd`（沿用原 MCP 端口；可用 `UUUTIL_CLI_PORT` 覆盖）。
- **无 token**：本机自用，同机进程可直接调用。安全边界依赖 loopback 绑定与主目录沙箱，不做鉴权。
- CLI 进程是**短命、无状态**的：启动 → 发一个 HTTP 请求 → 拿 JSON → 打印 → 退出。
- **App 未运行**：连不上端口时，返回明确错误 + 非零退出码，要求用户先启动 App。不自动拉起 App。

```
[agent skill] 执行 `uuutil call focus.create --json '{...}'`
      ↓ (短命进程)
CLI 二进制 → POST http://127.0.0.1:17878/cmd
             { command:"focus.create", args:{...}, requestId }
      ↓
运行中的 UUUtil（主进程内 loopback HTTP server）
   → 查命令注册表 → bus.emit 对应插件事件 → 按 requestId 等 result
      ↓
返回 JSON { ok, data, error } → CLI 打到 stdout → 退出（exit code 反映成败）
```

## 3. 命令风格

只提供机器路径，不做人肉子命令糖。CLI 本身几乎不认识任何命令，只负责把 `command + 参数` 原样转发，校验与分发全归 App 侧注册表。

核心接口：

```bash
uuutil call <plugin.action> --json '{"title":"写周报","tags":["工作"]}'
```

参数来源，优先级：`--json` > stdin。长内容（例如往画板塞大段文字）走 stdin 更稳，免去命令行长度限制与引号转义：

```bash
echo '{"title":"写周报"}' | uuutil call focus.create
```

内建元命令（不属于任何插件，由注册表直接应答，支撑 agent 自我发现）：

```bash
uuutil list                   # 列出当前所有可用命令（id + 描述）
uuutil help <plugin.action>   # 某命令的参数 schema + 示例
uuutil ping                   # 探活；skill 可先 ping 再干活
```

命名约定：

- 命令 id 用 `plugin.action` **点号**命名（`focus.create`、`whiteboard.draw`、`reminder.schedule`）。
- 与 bus 的 `plugin-id:action` **冒号**命名平行但符号不同，一眼区分「外部 CLI 命令」与「内部 bus 事件」。

## 4. 输出与退出码

- stdout 统一输出 JSON：`{ ok: boolean, data?: unknown, error?: { code, message } }`。
- 退出码：`0` 成功；非 `0` 失败（含参数校验失败、命令不存在、插件执行失败、连不上 App）。
- skill 一律读 stdout 的 JSON + 判断 exit code，不依赖任何人类可读排版。

## 5. 声明式命令注册

插件在自己的合同里**声明式**注册命令，CLI 与 HTTP server 都不持有插件业务知识；`list` / `help` 的内容全部从注册表实时生成。

插件在 `activate()` 中调用 `registerCommand()`（`src/core/command-registry.ts`）声明一条命令，包含：

- `command`：命令 id，`plugin.action`（内核按 `^[a-z0-9-]+\.[a-z0-9-]+$` 校验）。
- `description`：一句话描述，供 `list` / `help`。
- `params`：参数结构数组（`name` / `type` / `required` / `description`），用于 App 侧必填校验与 `help` 输出。
- `example`：示例参数对象，供 `help` 展示。
- `handler`：`(args) => Promise<unknown> | unknown`，返回值即命令结果 `data`。

handler 内部可直接调用插件 `api`，也可走 bus，由插件自行决定；对外只暴露这条声明式命令。注册与铁律一致：命令声明属于插件对外合同的一部分，随插件维护；插件新增命令时，CLI 与 server 均无需改动。

## 6. 请求/响应配对

CLI 需要「一问一答」的返回值。由于插件 `api` 方法本身是 async 的，注册表直接持有插件声明的 async `handler`，`invokeCommand()` 用 `await` 拿到返回值即可，无需给 bus 事件附加 `requestId` 做广播配对。

- `invokeCommand(command, args, timeoutMs)` 先做必填校验，再 `await` handler。
- 用 `Promise.race` 加超时兜底（默认 15s），超时返回 `code: timeout`。
- 全程不抛出：统一转成 `{ ok:true, data }` 或 `{ ok:false, error:{ code, message } }`；错误码含 `not_found` / `invalid_args` / `handler_error` / `timeout`。

> 备注：早期设计设想过「bus 广播 + requestId 配对」；实现时因插件 api 已是 async，改用注册表直接持有 handler 的方式，更简洁且同样满足「声明式注册 + 插件不被外部 import」两条铁律。

## 7. 已实现范围（最小闭环）

- 命令注册表 `src/core/command-registry.ts`：声明式注册 + async 调用 + 超时兜底。
- loopback HTTP server `src/main/cli-server.ts`：`GET /ping`、`GET /list`、`GET /help`、`POST /cmd`，随 App 起停（在插件加载后启动）。
- CLI 二进制 `src/cli/index.ts`：`ping` / `list` / `help` / `call`，`--json` 与 stdin 入参，JSON 输出，exit code。
- 样例命令：`hello-world.greet`（纯验证）、`focus.ingest`（真实写路径，打通到 FIE 归因）。
- 已在真实 Electron + FIE 环境端到端验证：正常调用、缺必填、未知命令、handler 抛错、连不上 App 均返回预期结果与退出码。

安装为全局命令（开发期）：

```bash
npm run build:main   # 生成 dist/cli/index.js
npm link             # 将 uuutil 链接到全局（如 npm 全局前缀无写权限，可 npm config set prefix ~/.npm-global）
uuutil ping          # 任意目录可用
```

改动 CLI 源码后需重新 `npm run build:main`；`dist/` 不入库，换机需先 build 再 link。

## 8. 未定 / 后续探讨

- 内部使用会不会与 bus 混淆：初版 CLI 定位纯外部，内部一律直接用 bus；如需内部复用注册表再单独讨论。
- 与后续 Agent Tool Bridge 的关系：命令注册表可作为 Tool Bridge 的底座复用，避免另起炉灶。
