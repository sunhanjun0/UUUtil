# CLI 接入设计

> 状态：设计定稿，待开发。本文件是 UUUtil CLI 的权威设计说明与开发起点。

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

每条命令声明包含：

- `command`：命令 id，`plugin.action`。
- `description`：一句话描述，供 `list` / `help`。
- `paramsSchema`：参数结构（用于 App 侧校验与 `help` 输出）。
- `event`：内部对应触发的 bus 事件名（`plugin-id:action`）。

注册与铁律一致：命令声明属于插件对外合同的一部分，随 `api.ts` 维护；插件新增命令时，CLI 与 server 均无需改动。

## 6. 请求/响应配对（承重墙）

bus 是广播式的：请求事件与结果事件是两条独立广播（如 `dev-utils:invoke` → `dev-utils:result`），彼此无绑定。CLI 需要「一问一答」，因此调度层必须把广播式 bus 包装成请求/响应调用：

- 每次调用生成 `requestId`。
- server 按注册表 `event` 触发对应 bus 事件，并携带 `requestId`。
- 插件处理后发出结果事件，回传同一 `requestId`。
- 调度层按 `requestId` 收线，超时未收到则返回超时错误。

因此插件结果事件的负载需要能携带 `requestId`；这项约定与「声明式注册」是同一件事的两面，插件侧合同需支持。

## 7. 待开发范围（初版）

- 主进程内 loopback HTTP server（`/cmd`、探活）与生命周期（随 App 起停）。
- 命令注册表 + 请求/响应配对调度层（requestId、超时）。
- 插件命令声明合同（在 `api.ts` / manifest 层扩展）。
- CLI 二进制：参数解析（`--json` / stdin）、HTTP 调用、JSON 输出、exit code。
- 内建元命令：`list` / `help` / `ping`。
- 至少一个样例命令打通全链路（建议 `focus.create` 或等价只写命令）。

## 8. 未定 / 后续探讨

- 内部使用会不会与 bus 混淆：初版 CLI 定位纯外部，内部一律直接用 bus；如需内部复用注册表再单独讨论。
- 与后续 Agent Tool Bridge 的关系：命令注册表可作为 Tool Bridge 的底座复用，避免另起炉灶。
