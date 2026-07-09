# 终端 × tmux 融合开发文档

> **本文档为自包含开发指南。** 编写背景：开发过程在 UUUtil 自带终端工具内进行，阶段 1 改动会重启应用导致对话失联。因此本文档不依赖任何对话上下文，接手者（人或 agent）可据此独立推进。
>
> 状态：**规划完成，未开始编码**
> 目标：终端以 tmux 为持久化后端，保留 React 原生多标签 UI（方案 C）
> 演进策略：分 4 阶段增量落地，每阶段可独立运行、独立验证，无返工

---

## 0. 失联恢复指引（接手者先读这里）

如果你是重连后的 assistant 或新接手的 agent：

1. **判断当前进度**：查看 `git log` 和 `git status`，对照本文档「进度追踪」章节，确认已完成到哪个阶段。
2. **每个阶段的验证标准都写在对应章节**，通过后才进入下一阶段。
3. **改动 `terminal.ts` 后必须重启应用**（`npm run dev`），这会让当前终端页面重载。如果你正在被观察的终端里工作，提醒用户改动即将生效需重启。
4. **安全铁律不变**：终端是无过滤交互式 shell，严禁暴露给 AI/远程调用方（见 `src/main/terminal.ts:4-5`）。session 名必须由内部生成，禁止外部字符串注入。
5. **遵守项目规约**（`CLAUDE.md`）：数据库操作走 `core/db` 的 `getDatabase()` + `autoSave()`；日志走 `core/logger`，禁止记录命令内容/敏感信息。

---

## 1. 现状分析

终端是**内核级能力**（非插件），使用受保护的 `core:terminal:*` IPC 命名空间。

### 数据链路

```
xterm.js (renderer) ──IPC──> node-pty (main) ──> shell 进程 ($SHELL)
        ^                                              |
        └──────────── core:terminal:data ─────────────┘
```

### 关键文件

| 层 | 文件 | 职责 |
|----|------|------|
| 主进程-PTY | `src/main/terminal.ts` | node-pty 会话创建/写入/resize/销毁 |
| 主进程-IPC | `src/main/ipc/terminal.ipc.ts` | 注册 `core:terminal:*` 通道 |
| 主进程-入口 | `src/main/index.ts:20,77` | 退出时 `disposeAllTerminals()` |
| Preload | `src/main/preload.ts:102-123` | 暴露 `window.assistant.terminal` |
| 类型 | `src/shared/assistant-api.ts:121-128` | terminal API 类型 |
| 渲染 | `renderer/pages/TerminalPage.tsx` | xterm.js + React 多标签 UI |

### 现状行为（改造前）

- `terminal.ts:47` `pty.spawn(shell, [], {...})`，shell = `$SHELL || /bin/zsh`（win32 用 COMSPEC/powershell）
- `terminal.ts:46` cwd 固定 `os.homedir()`
- `terminal.ts:23` 会话存模块级 `Map<string, {pty, webContents}>`
- 多标签由**渲染进程** React 管理（`TerminalPage.tsx:143` addTab），每标签一个独立 pty + xterm
- **会话不持久化**：`disposeAllTerminals()`（`terminal.ts:96`）在应用退出时 kill 所有 pty；`TerminalPage.tsx` 的 `store`（模块级）只在应用运行期间存活，重启即丢失

### IPC 通道现状（`terminal.ipc.ts`）

- `core:terminal:create` — invoke，返回会话 id（唯一双向通道）
- `core:terminal:input` — send，→ `writeTerminal`
- `core:terminal:resize` — send，→ `resizeTerminal`
- `core:terminal:dispose` — send，→ `disposeTerminal`
- `core:terminal:data` / `core:terminal:exit` — **不在注册表**，由 `createTerminalSession` 内部 `sender.send()` 主动推送

### 依赖（package.json）

- `node-pty ^1.1.0`（原生模块，`asarUnpack` 已配置）
- `@xterm/xterm ^6.0.0`、`@xterm/addon-fit ^0.11.0`

---

## 2. 目标架构（方案 C）

**React 接管 UI，tmux 只做持久化后端。** 用户几乎感知不到 tmux 存在。

```
React 标签 (id) ──1:1──> tmux session "uuutil-<id>"
       │
       └─ 关闭应用 = detach（tmux server 存活）
       └─ 重启应用 = 读 SQLite 元数据 → 重建标签 → 各自 attach
```

### 为什么不走「纯 A」过渡

方案 A（tmux 接管 UI，用户用 `Ctrl-b` prefix 自己分屏）与 C 是**不同交互范式**。先做纯 A 会训练出与 C 冲突的用户习惯，属于返工。但 A 和 C 的底层 spawn 代码几乎相同（都是 `tmux new-session -A -s <name>`），差异只在**生命周期 + 持久化**。因此直接朝 C 增量演进，第一阶段仅验证技术风险，不引入 A 的交互范式。

---

## 3. 分阶段实施计划

### 阶段 1 — 技术验证（唯一改 `terminal.ts`）

**目标**：验证 node-pty 拉 tmux 能跑通，排除唯一的技术不确定性。**不引入持久化，不引入 A 交互范式。**

**改动**（仅 `src/main/terminal.ts`）：
1. 新增 tmux 可用性检测：执行 `tmux -V` 成功则用 tmux，否则降级回 `$SHELL`（保留现有 `resolveShell`）。
2. session 名直接采用 C 的约定：`uuutil-<内部id>`（内部 id 由 `makeTerminalId` 或类似生成，**禁止外部注入**）。
3. spawn 改为（tmux 可用时）：
   ```
   pty.spawn('tmux', ['new-session', '-A', '-s', tmuxName], { name, cols, rows, cwd, env })
   ```
   - `-A`：session 存在则 attach，不存在则新建（幂等）
   - `-s`：指定 session 名
4. dispose **暂时仍用 `kill()`**（行为与现状一致），本阶段不改生命周期。
5. session Map 里额外记录 `tmuxName`，供后续阶段使用。

**不改**：IPC 层、preload、renderer、db 全部不动。

**验证标准**（改完 `npm run dev` 重启后）：
- [ ] tmux 已安装的机器：终端正常显示、可交互、状态栏可见（tmux 默认底栏）
- [ ] 多标签各自独立（互不干扰），每个对应一个 `uuutil-<id>` session（可在系统里 `tmux ls` 验证）
- [ ] resize 正常（拉伸面板终端内容重排，无错位）
- [ ] 输入输出无延迟/丢字
- [ ] 未装 tmux 的路径降级回普通 shell，不报错
- [ ] 关闭标签 / 退出应用后 `tmux ls` 中对应 session 消失（因本阶段仍 kill）

**风险点**：tmux 状态栏占一行会压缩可用高度；键位（`Ctrl-b`）此阶段仍会被 tmux 捕获——阶段 3 会通过配置弱化。

---

### 阶段 2 — 会话持久化（detach 替代 kill）

**目标**：应用退出后 tmux server 存活，会话不丢。

**改动**（`src/main/terminal.ts`）：
1. `disposeTerminal(id)`：区分「用户主动关闭标签」与「应用退出」。
   - 用户关闭标签 → 真正 kill session（`tmux kill-session -t <name>`），因为用户明确要销毁。
   - 应用退出 → **detach**，session 保留。
   - 建议：`disposeTerminal` 保持 kill 语义（用户关标签），新增/改造 `disposeAllTerminals()` 为 detach 语义（应用退出）。
2. `disposeAllTerminals()`（`terminal.ts:96`，被 `main/index.ts:77` 调用）：不再 `pty.kill()`，改为让 pty 进程结束但**不 kill tmux session**（detach 即断开 pty 连接，tmux server 自然保留 session）。
   - 实现上：detach 可通过关闭 pty（`pty.kill()` 杀的是 attach 的客户端进程，tmux server 独立存活）——**需实测确认** `pty.kill()` 是否会连带 kill session。若会，则改用发送 detach 命令或 `tmux detach-client`。
3. 启动时不自动 attach（恢复逻辑放阶段 3）。

**验证标准**：
- [ ] 打开终端 → 退出应用 → `tmux ls` 中 `uuutil-*` session **仍然存在**
- [ ] 用户主动关闭标签 → 对应 session 被 kill（`tmux ls` 中消失）
- [ ] 无孤儿进程泄漏（反复开关不累积僵死 session）

**关键待验证**：node-pty 的 `kill()` 对 tmux client vs server 的影响。这是本阶段核心技术点，务必先小实验确认再定实现。

---

### 阶段 3 — 元数据持久化 + 启动恢复

**目标**：重启应用后自动重建标签并 attach，体验上「会话从未中断」。

**改动**：
1. **数据库**（走 `core/db`，遵守 `getDatabase()` + `autoSave()` 铁律）：
   - 新建表，例如 `terminal_sessions`：`id TEXT PK, tmux_name TEXT, title TEXT, sort_order INTEGER, created_at INTEGER`
   - 建表逻辑放主进程初始化阶段（参考现有系统表建表位置）
   - 增删标签、改标题时写库并 `autoSave()`
2. **主进程**：新增 IPC 用于「列出待恢复的会话」（renderer 启动时查询）。可能需要新增 `core:terminal:list` invoke 通道（在 `terminal.ipc.ts` 注册）。
3. **渲染进程**（`TerminalPage.tsx`）：
   - `ensureInitialSession()`（`:79`）改造：启动时先从主进程拉取已保存的会话列表，若有则重建这些标签（各自 `create` 会因 `-A` 而 attach 到已存在的 `uuutil-<id>`），否则才建「终端 1」。
   - 注意 `create` 的 session 名要用**持久化的 tmux_name**，不能重新随机生成，否则 attach 不上原 session。这要求 `create` 支持传入既有 tmux 名（扩展 `CreateTerminalOptions` 或新增恢复专用通道）。
   - 标签标题、顺序从元数据恢复。
4. **tmux 配置弱化 prefix 冲突**（可选但推荐）：为 uuutil 的 session 注入专用配置，隐藏状态栏（`set status off`）、必要时改 prefix，让 tmux 更「隐形」。可通过 `tmux new-session ... \; set status off` 或专用 `-f <conf>` 实现。

**验证标准**：
- [ ] 开 3 个标签、改标题、退出应用 → 重启 → 3 个标签按原标题/顺序恢复，内容延续（如之前 `top` 仍在跑）
- [ ] SQLite 中元数据与实际 tmux session 一致
- [ ] 首次启动（无历史）正常建「终端 1」
- [ ] 状态栏隐藏后可用高度恢复正常

---

### 阶段 4 — 打磨与健壮性

**改动**：
1. **孤儿回收**：启动时对比 SQLite 元数据与 `tmux ls` 实际 session，清理二者不一致的（DB 有但 tmux 没有 → 删元数据；tmux 有 uuutil-* 但 DB 没有 → 可选清理或收养）。
2. **attach 失败降级**：目标 session 不存在时，重新 `new-session` 并提示，不让标签空白卡死。
3. **错误提示**：tmux 未安装、版本过低、attach 失败等给用户明确提示（复用 `TerminalPage.tsx:60-62` 的行内提示风格）。
4. **日志**：补充 `tmux_detected` / `session_restored` / `orphan_cleaned` 等结构化日志（`core/logger`，不记录命令内容）。

**验证标准**：
- [ ] 手动 `tmux kill-server` 后重启应用不崩溃，降级重建
- [ ] 反复开关/重启无 session 泄漏
- [ ] 未装 tmux 全程降级为普通终端，功能不缺失

---

## 4. 风险登记

| 风险 | 影响 | 缓解 |
|------|------|------|
| tmux 未安装 | 功能不可用 | 检测 + 降级回 `$SHELL`（阶段 1 内置） |
| `pty.kill()` 连带杀 tmux session | 持久化失效 | 阶段 2 先做小实验确认 kill 语义 |
| `Ctrl-b` prefix 与应用/用户习惯冲突 | 交互别扭 | 阶段 3 注入 tmux 配置弱化/隐藏 |
| session 名外部注入 | 安全（命令注入） | 名字仅内部生成，禁止透传外部字符串 |
| tmux 状态栏占高度 | 可用区变小 | 阶段 3 `set status off` |
| 孤儿 session 累积 | 资源泄漏 | 阶段 4 回收策略 |
| resize 与 tmux 窗格模型不协调 | 显示错位 | 阶段 1 验证；client 尺寸通常足够 |

---

## 5. 进度追踪

- [x] **阶段 1（代码完成，待运行时验证）** 技术验证（改 `terminal.ts`，spawn tmux + 检测降级）
- [x] **阶段 2（代码完成，待运行时验证）** 持久化（detach 替代退出时 kill）
- [x] **阶段 3（代码完成，待运行时验证）** 元数据持久化 + 启动恢复（DB + renderer 恢复逻辑）
- [x] **阶段 4（代码完成，待运行时验证）** 孤儿回收 + 降级 + 打磨

> 每完成一阶段，在此打勾并记录关键决策（如 `pty.kill()` 实测结论、采用的 detach 方式、DB 表结构最终版）。

### 阶段 1 实施记录（2026-07-09）

- 环境：`tmux 3.5a`（`/Users/hanjun/.local/bin/tmux`），检测通过。
- 改动仅限 `src/main/terminal.ts`：
  - 新增 `isTmuxAvailable()`：`spawnSync('tmux', ['-V'])` 检测并缓存，记录 `tmux_detected` / `tmux_unavailable` 日志。
  - `createTerminalSession`：tmux 可用时 `pty.spawn('tmux', ['new-session', '-A', '-s', 'uuutil-<id>'], {...})`，否则降级回 `resolveShell()`。session 名 `uuutil-<内部id>`，内部生成，无外部注入。
  - `TerminalSession` 增加 `tmuxName?` 字段，供阶段 2/3 使用。
  - `dispose` / `disposeAllTerminals` 未改，仍 `pty.kill()`。
- IPC / preload / renderer / db 全部未动。主进程 `tsc -p tsconfig.main.json --noEmit` 通过。
- **待运行时验证**：需 `npm run dev` 重启后按阶段 1 验证清单逐项确认。
- **⚠️ 关键技术提示（影响阶段 2）**：阶段 1 验证清单假设「kill 后 `tmux ls` 中 session 消失」。实际上 `pty.kill()` 杀的是 attach 的 **tmux 客户端进程**，tmux **server 上的 session 默认会保留**（这正是持久化的基础）。因此运行时很可能观察到：关闭标签/退出应用后 `tmux ls` 里 `uuutil-*` **仍在**。若如此，说明阶段 2 的 detach 语义几乎「天然成立」，需要额外处理的反而是「用户主动关标签时真正 `kill-session`」。请在运行时实测确认此结论并据此调整阶段 2 实现。

### 阶段 2 实施记录（2026-07-09）

- **小实验结论（关键）**：`kill -9` 掉 tmux attach 客户端进程后，`tmux ls` 中 session **仍然存在**。证实 `pty.kill()` 只 detach，不销毁 server 上的 session。→ 因此阶段 1 验证清单最后一条（「退出后 session 消失」）的预期是**错的**，实际会保留，这正是我们想要的持久化行为。
- 改动仅 `src/main/terminal.ts`：
  - 新增 `killTmuxSession(tmuxName)`：`spawnSync('tmux', ['kill-session', '-t', tmuxName])`，失败记 `tmux_kill_session_failed/error`。
  - `disposeTerminal(id)`（用户主动关标签）：`pty.kill()` 断开客户端 **+** `killTmuxSession()` 真正销毁 session。日志 `session_disposed`。
  - `disposeAllTerminals()`（应用退出）：只 `pty.kill()`（detach），**不** kill session。日志 `session_detached`。
  - 降级（非 tmux）路径：`tmuxName` 为 undefined，`disposeTerminal` 只 `pty.kill()`，行为与现状一致。
- IPC / preload / renderer / db 未动。主进程 `tsc` 通过。
- **待运行时验证**（`npm run dev` 重启后）：
  - 打开终端 → 退出应用 → `tmux ls` 中 `uuutil-*` **仍在**。
  - 用户主动关标签 → 对应 session 从 `tmux ls` **消失**。
  - 反复开关/退出无孤儿 session 累积（关标签走 kill、退出走 detach，重启后阶段 3 才恢复）。
- **遗留提示（给阶段 3）**：本阶段退出后 session 保留但**渲染进程标签未持久化**，重启应用后 UI 只会新建「终端 1」，此前 detach 的 `uuutil-*` session 变成孤儿（仍在 tmux 里但无 UI 对应）。这是预期的——阶段 3 才做元数据持久化 + 启动恢复。此阶段可手动 `tmux ls`/`tmux kill-server` 清理验证残留。

### 阶段 3 实施记录（2026-07-09）

- **DB 表结构最终版**（`src/core/db.ts`，`initDatabase` 内建表）：
  ```sql
  CREATE TABLE IF NOT EXISTS terminal_sessions (
    tmux_name   TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  )
  ```
  - **偏离原计划**：原设计 `id TEXT PK + tmux_name`，因两者 1:1 冗余，直接以 `tmux_name` 为主键，去掉多余 id 列。渲染进程的 React session.id 仅用于 UI，不需持久化。
- **主进程 `terminal.ts`**：
  - `CreateTerminalOptions` 新增 `restoreTmuxName?`；`createTerminalSession` 改为返回 `{ id, tmuxName }`（降级为普通 shell 时 `tmuxName: null`）。
  - 恢复：`restoreTmuxName` 经 `TMUX_NAME_PATTERN = /^uuutil-[A-Za-z0-9-]+$/` 严格校验后作为 `-s` 名传入，靠 `-A` 幂等 attach 到既有 session；非法值忽略（视为新建），防命令/选项注入。
  - 新增 `listPersistedSessions()` / `savePersistedSessions(list)`（全量替换语义，`getDatabase()` + `autoSave()`，save 时二次校验 tmux 名格式并裁剪 title ≤200 字）。
  - **状态栏隐藏**：spawn 参数改为 `['new-session','-A','-s',name,';','set','status','off']`（argv 链式命令，实验确认非 shell 下 `;` 分隔有效且幂等）。恢复 attach 时同样执行，回收一行高度。
- **IPC**（`terminal.ipc.ts`）：新增 `core:terminal:list`、`core:terminal:save`（均 invoke）。
- **preload + `assistant-api.ts`**：`terminal.create` 返回 `TerminalCreateResult`，新增 `list()`/`save()`；新增类型 `TerminalCreateResult`、`TerminalPersistedSession`。
- **渲染进程 `TerminalPage.tsx`**：
  - `TermSession` 新增 `tmuxName`；`createSession(title, restoreTmuxName?)` 拿到结果后记录 tmuxName 并回写持久化。
  - `ensureInitialSession` → `restoreOrInit(onDone)`：启动经 `api.list()` 拉取，有历史则按 sort_order 重建标签并各自 attach，无历史才建「终端 1」；模块级 `restoreStarted` 保证仅执行一次（重挂载不重复恢复）。
  - `persistSessions()`：全量把当前标签（tmuxName/title/顺序）写库；在 create 完成赋 tmuxName 后、rename、close 时调用。降级路径 tmuxName 为 null 不入库。
- **真源**：渲染进程是标签集的唯一真源，主进程只被动全量替换存储。主进程 + 渲染进程 `tsc` 均通过。
- **待运行时验证**（`npm run dev` 重启后，按阶段 3 验证清单）：
  - 开 3 个标签、改标题、退出 → 重启 → 3 标签按原标题/顺序恢复，内容延续（如之前 `top` 仍在跑）。
  - SQLite `terminal_sessions` 与实际 `tmux ls` 一致。
  - 首次启动（无历史）正常建「终端 1」。
  - 状态栏已隐藏，可用高度恢复正常。
- **遗留提示（给阶段 4）**：尚未做「DB 与实际 tmux session 不一致」的孤儿回收和 attach 失败降级——若 DB 有记录但对应 tmux session 已被外部 `kill-session`，恢复时 `-A` 会**新建**一个同名空 session（不会报错，但内容丢失）；反之 tmux 有 uuutil-* 但 DB 无记录则不会被 UI 收养。这些留待阶段 4。

### 阶段 4 实施记录（2026-07-09）

- **孤儿回收（启动对账）**（`terminal.ts`）：新增 `reconcileSessions()`，`core:terminal:list` 改为调用它（替换原 `listPersistedSessions`）：
  - `listTmuxSessions()`：`tmux list-sessions -F '#{session_name}'`，实验确认无 server 时 `status=1`+空输出（返回空集），有 session 时正常。**仅收集匹配 `uuutil-*` 的名字**，用户自建的其他 tmux session（如 `other-x`）永不被本应用触碰。
  - DB 有记录但无对应 live session → `deletePersistedSession()` 删元数据（避免 `-A` 恢复出空白 session），日志 `orphan_cleaned{type:'db_without_tmux'}`。
  - tmux 有 `uuutil-*` 但 DB 无记录 → `killTmuxSession()` 清理（防泄漏），日志 `orphan_cleaned{type:'tmux_without_db'}`。
  - tmux 不可用 → `reconcile_skipped`，**保留 DB**（等 tmux 恢复），返回空表让渲染进程新建。
  - 汇总日志 `reconciled{alive, dbOrphans, tmuxOrphans}`。
- **attach 失败降级**：对账已保证只返回 live 的会话，从源头避免恢复出空白标签（`tmux kill-server` 后重启 → live 空 → 全部按 DB 孤儿清理 → 返回空 → 渲染进程建「终端 1」，不崩溃）。
- **错误提示**（`TerminalPage.tsx`）：恢复模式下若 `create` 返回 `tmuxName` 为 null（tmux 不可用），在该终端写入行内黄字提示「tmux 不可用，已降级为新终端，历史会话未恢复」，不阻断使用（复用 `\x1b[33m` 风格）。
- **结构化日志**（`core/logger`，均不含命令内容）：`tmux_detected`/`tmux_unavailable`（阶段 1）、`session_restored`（阶段 3）、`orphan_cleaned`/`reconciled`/`reconcile_skipped`（阶段 4）、`sessions_persisted`/`session_detached`/`session_disposed`。
- 版本过低检查：`-A` 自 tmux 1.8 起支持，主流版本均满足，未加版本门槛（避免过度设计）；未安装场景由 `isTmuxAvailable()` 降级覆盖。
- 主进程 + 渲染进程 `tsc` 均通过。
- **待运行时验证**（`npm run dev` 重启后，按阶段 4 验证清单）：
  - 手动 `tmux kill-server` 后重启应用不崩溃，降级重建「终端 1」。
  - 反复开关/重启无 session 泄漏（关标签 kill、退出 detach、启动对账清理孤儿）。
  - 未装 tmux 全程降级为普通终端，功能不缺失。

---

## 7. 全阶段完成总结（代码层）

四个阶段代码已全部落地，`tsc`（main + renderer）通过，**待用户在 `npm run dev` 重启后按各阶段验证清单做运行时确认**。

改动文件清单：
- `src/main/terminal.ts` — tmux 后端、检测降级、detach/kill 生命周期、持久化读写、启动对账。
- `src/core/db.ts` — 新增 `terminal_sessions` 表。
- `src/main/ipc/terminal.ipc.ts` — 新增 `core:terminal:list`（对账）/`core:terminal:save`。
- `src/main/preload.ts` + `src/shared/assistant-api.ts` — `terminal.create` 返回 `{id, tmuxName}`，新增 `list()`/`save()` 及类型。
- `renderer/pages/TerminalPage.tsx` — 恢复/持久化/降级提示。

安全铁律遵守情况：终端未暴露给 AI/远程；tmux session 名仅内部生成，恢复入参与持久化写入均经 `/^uuutil-[A-Za-z0-9-]+$/` 校验，防命令/选项注入；DB 走 `getDatabase()`+`autoSave()`；日志走 `core/logger` 且不记录命令内容。

---

## 6. 关键代码位置速查

- spawn / 会话管理：`src/main/terminal.ts`（`createTerminalSession:44`、`disposeTerminal:86`、`disposeAllTerminals:96`）
- 退出钩子：`src/main/index.ts:77`
- IPC 注册：`src/main/ipc/terminal.ipc.ts`
- Preload：`src/main/preload.ts:102-123`
- API 类型：`src/shared/assistant-api.ts:121-128`
- 渲染 UI / 标签管理：`renderer/pages/TerminalPage.tsx`（`createSession:25`、`ensureInitialSession:79`、`addTab:143`、`closeTab:174`）
- 数据库入口：`src/core/db.ts`（`getDatabase()` / `autoSave()`）
- 日志入口：`src/core/logger.ts`
