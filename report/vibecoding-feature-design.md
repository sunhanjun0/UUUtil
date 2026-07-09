# Vibecoding 任务追踪与提醒

## 定位

Vibecoding 插件是面向 AI 辅助编码场景的**异步协同等待管理**系统。核心场景：开发者向 AI Client 发起 coding 任务后切换到其他工作，AI 完成后需要开发者介入时，系统通过悬浮球提醒主动唤起注意力。

## UUUtil CLI 系统

Vibecoding 插件的数据入口依赖 CLI 工具。CLI 不是仅服务于 Vibecoding 的附属品，而是 UUUtil 的**一等公民组件**，与 Electron 主进程、渲染进程并列。它通过文件系统（events.jsonl）与桌面应用通信，在应用未运行时可独立工作。

### 架构定位

```text
┌─────────────────────────────────────────────────────┐
│                    UUUtil 三层架构                     │
│                                                       │
│  ┌──────────────────────┐┌──────────────────────┐    │
│  │     Electron 主进程    ││     渲染进程 (React)   │    │
│  │  (插件系统 / IPC / DB)││  (悬浮球 / 面板 / UI) │    │
│  └──────────┬───────────┘└──────────────────────┘    │
│             │ IPC                                       │
│  ┌──────────┴───────────┐                             │
│  │     CLI 工具层         │  ← 一等公民               │
│  │  (uuutil 命令系列)     │                             │
│  └──────────┬───────────┘                             │
│             │ events.jsonl（文件系统桥）                │
│  ┌──────────┴───────────┐                             │
│  │   外部 AI Client       │                             │
│  │  (Claude / Codex / WB)│                             │
│  └──────────────────────┘                             │
└─────────────────────────────────────────────────────┘
```

CLI 层的设计原则：
- **零依赖桌面进程**：Electron 未启动时 CLI 照样工作，事件缓存到 events.jsonl，启动后自动回放
- **单向文件写入**：CLI 只追加 events.jsonl，从不读 SQLite，避免文件锁冲突
- **统一通信协议**：所有子命令共享同一套 events.jsonl 格式，Electron 端各插件按 `type` 字段路由摄入

### 命令树总览

```
uuutil                           # 根命令
│
├── vibe                         # Vibecoding 任务追踪（第一期实现）
│   ├── task create <name>       # 创建任务
│   ├── task update <task-id>    # 更新状态
│   ├── task update-by-name <n> # 按名称更新最近一条
│   ├── task list                # 列出任务
│   └── task get <task-id>       # 获取详情
│
├── focus                        # 焦点注意力（后续）
│   ├── check-in <text>          # 记录一次注意力事件
│   ├── list                     # 列出焦点记录
│   └── stats                    # 统计报告
│
├── plugin                       # 插件管理（后续）
│   ├── list                     # 列出已安装插件
│   ├── info <plugin-id>         # 插件详情
│   └── reload                   # 热重载插件
│
├── db                           # 数据库操作（后续）
│   ├── backup                   # 备份数据库
│   ├── restore <file>           # 还原数据库
│   └── vacuum                   # 清理和优化
│
├── config                       # 配置管理（后续）
│   ├── get <key>                # 读取配置
│   ├── set <key> <value>        # 写入配置
│   └── list                     # 列出所有配置
│
├── status                       # 系统状态（后续）
│                                 # 进程是否运行 / 插件状态 / 数据目录
│
└── log                          # 日志（后续）
    ├── tail                      # 实时跟踪日志
    └── query <scope>             # 按 scope 过滤
```

第一期只实现 `vibe` 子命令树，其余子命令在后续迭代中逐步添加。命令树结构确保 `uuutil` 作为统一入口的完整性，避免未来出现多个零散命令。

### 通信协议：events.jsonl

所有子命令通过同一份 `events.jsonl` 文件与 Electron 通信。文件路径：`~/.uuutil/events.jsonl`。

```json
{"type":"vibe:task_create","payload":{"name":"重构","project_path":"/Users/hanjun/UUUtil"},"ts":"2026-07-08T10:30:00Z","source":"codex"}
{"type":"vibe:status_update","payload":{"task_id":"abc123","status":"needs_review"},"ts":"2026-07-08T10:35:00Z","source":"claude"}
{"type":"focus:check_in","payload":{"text":"完成架构评审","tag":"uuutil"},"ts":"2026-07-08T11:00:00Z","source":"manual"}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 事件类型，格式 `<domain>:<action>`，用于 Electron 端路由到对应插件 |
| `payload` | object | 事件负载，结构由各子命令定义 |
| `ts` | string | ISO 8601 时间戳，CLI 生成 |
| `source` | string | 来源标识：`claude` / `codex` / `workbuddy` / `manual` |

`type` 字段的命名约定：`<domain>` 对应命令树的一级子命令名，`<action>` 对应具体操作。Electron 端各插件的摄入器通过 `type` 前缀匹配路由。

### 文件变更

CLI 系统代码集中在一级目录 `cli/`，独立于 Electron 的 `src/`：

```
cli/
├── index.js              # 根入口，子命令路由分发
├── commands/
│   ├── vibe.js           # vibe 子命令实现（第一期）
│   ├── focus.js          # focus 子命令（后续）
│   ├── plugin.js         # plugin 子命令（后续）
│   └── ...               # 其他子命令
├── utils/
│   ├── events.js         # events.jsonl 原子追加写入
│   ├── format.js         # 输出格式化（table / JSON / plain）
│   └── id.js             # ID 生成（时间戳+随机串）
└── package.json          # CLI 独立包，编译为单文件发布
```

---

## 数据模型

### VibecodingTask

SQLite 表 `vibecoding_tasks`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | 时间戳 + 随机字符串 |
| `name` | TEXT NOT NULL | 任务名称，如「重构 AI 模块」 |
| `description` | TEXT | 任务描述，可选 |
| `status` | TEXT NOT NULL | 参见状态流转章节 |
| `project_path` | TEXT | 关联项目绝对路径 |
| `context_files` | TEXT | JSON 数组，上下文相关文件路径 |
| `prompt` | TEXT | 原始 prompt 文本 |
| `rules_file` | TEXT | 关联规则文件路径（.cursorrules 等） |
| `session_id` | TEXT | AI 会话 ID，用于关联对话上下文 |
| `priority` | TEXT DEFAULT 'medium' | high / medium / low |
| `metadata` | TEXT | JSON 扩展字段 |
| `created_at` | TEXT NOT NULL | ISO 8601 创建时间 |
| `updated_at` | TEXT NOT NULL | ISO 8601 更新时间 |
| `last_status_change_at` | TEXT | ISO 8601 最近状态变更时间 |

### VibecodingSession（预留）

后续 Prompt/规则管理（方向 C）阶段引入，第一期不做：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT PRIMARY KEY | 会话 ID |
| `task_id` | TEXT | 关联 VibecodingTask.id |
| `prompt` | TEXT | 会话 prompt |
| `response` | TEXT | AI 响应摘要 |
| `created_at` | TEXT | 创建时间 |

## 状态流转

```
                    ┌─→ completed
pending → running ──┤
                    ├─→ needs_review  ──→ completed
                    ├─→ needs_action  ──→ completed
                    ├─→ blocked       ──→ needs_action
                    └─→ failed
```

### 状态说明

| 状态 | 含义 | 典型触发时机 |
|------|------|-------------|
| `pending` | 任务已创建，等待 AI 开始处理 | 用户发起 vibecoding 指令后立即创建 |
| `running` | AI 正在生成/执行中 | AI Client 开始处理时更新 |
| `needs_review` | AI 完成，需要用户 Review 结果 | 代码生成完毕，等待用户确认 |
| `needs_action` | 需要用户执行操作（非 Review） | 需要手动测试、配置、或解决冲突 |
| `completed` | 任务正常完成 | 用户确认通过或自然结束 |
| `failed` | 任务执行失败 | AI 报错、生成结果不符合预期 |
| `blocked` | 任务被阻塞，需外部条件解除 | 依赖未就绪、权限问题等 |

### 流转校验

以下流转为非法，API 层应拒绝：

- `completed` / `failed` 不能再变更为其他状态（终态）。
- `pending` 不能直接跳到 `completed`（必须经过 `running`）。
- `pending` 不能直接跳到 `needs_review` / `needs_action`。

## 提醒机制

### 触发条件

状态变更为 `needs_review`、`needs_action`、`blocked` 时触发提醒。

状态变为 `completed`、`failed` 时不触发（任务终结，无需用户介入）。

### 两层提醒

```
状态变更 → EventBus vibecoding:task-needs-attention
  ├─ Layer 1: 悬浮球光点闪烁
  │   光环上叠加呼吸光点，持续闪烁直到用户展开面板查看
  │   复用现有 ball-mcp-pulse 机制，使用暖橙色光点
  │
  └─ Layer 2: 面板内提示
       任务卡片高亮 + 状态 Badge 脉冲动画
       VibecodingTaskPanel 自动刷新
```

### 通知去重

同一条任务在同一个 `needs_*` 状态下只通知一次。如果任务在 `needs_review` 和 `needs_action` 之间切换，视为不同状态分别通知。

## 架构与数据流

```text
Claude Code / Codex CLI / WorkBuddy / 其他 AI Client
        ↓ Hook → shell command
uuutil vibe task update --status needs_review
        ↓ cli/utils/events.js — 原子追加一行 JSON
~/.uuutil/events.jsonl
        ↓ fs.watch
Electron 主进程 — 事件分发器（按 type 前缀路由）
        ↓ vibe:* → src/plugins/vibecoding/ingest.ts
vibecoding 插件摄入器（逐行解析 + 去重 + 写数据库）
        ↓
vibecoding API（src/plugins/vibecoding/api.ts）
        ↓ core/db + autoSave
sql.js / SQLite（.data/assistant.db）
        ↓ EventBus vibecoding:task-status-changed
主进程提醒模块
  └─ IPC → 渲染进程（悬浮球光点闪烁 + 面板刷新）
```

关键原则：
- CLI 只追加 events.jsonl，不读数据库，不依赖 Electron 进程
- Electron 端由一个统一的事件分发器按 `type` 前缀路由到对应插件的摄入器
- 各插件独立管理自己的摄入逻辑，互不干扰
- 事件文件按行写入，天然支持多进程并发追加（POSIX `O_APPEND` 保证原子性）

### events.jsonl 格式

每行一个 JSON 对象，`type` 字段采用 `<domain>:<action>` 命名：

```json
{"type":"vibe:task_create","payload":{"name":"重构 AI 模块","project_path":"/Users/hanjun/UUUtil"},"ts":"2026-07-08T10:30:00.000Z","source":"codex"}
{"type":"vibe:status_update","payload":{"task_id":"abc123","status":"needs_review"},"ts":"2026-07-08T10:35:00.000Z","source":"claude"}
```

### 摄入与去重

摄入器维护一个 `{task_id}_{status}_{ts}` 的内存去重集合，防止同一事件因文件监视触发多次而被重复处理。「已摄取行号」记录在 SQLite 的 `_ingestion_cursor` 元数据表中，重启后从上次位置继续。

## Vibecoding CLI 接口

### 命令

```
uuutil vibe task create <name>        # 创建任务，初始状态 pending
  --project <path>                    # 关联项目路径
  --files <glob1,glob2>               # 上下文文件，逗号分隔
  --desc <text>                       # 任务描述
  --rules <path>                      # 规则文件路径
  --priority <high|medium|low>        # 优先级，默认 medium

uuutil vibe task update <task-id>     # 更新任务状态
  --status <status>                   # 目标状态

uuutil vibe task update-by-name <name> # 按名称更新（最近一条）
  --status <status>

uuutil vibe task list                 # 列出任务
  --status <status>                   # 按状态过滤
  --project <path>                    # 按项目过滤
  --limit <n>                         # 数量限制，默认 50

uuutil vibe task get <task-id>        # 获取任务详情
```

### 命令映射到 events.jsonl 事件

| CLI 命令 | 写入事件 type | payload 转换 |
|------|------|------|
| `create` | `vibe:task_create` | CLI 参数直接映射 |
| `update` / `update-by-name` | `vibe:status_update` | `task_id` + `status` |

### 实现

CLI 工具用 Node.js 实现（编译为独立二进制，随 UUUtil 包分发）：

```javascript
// cli/utils/events.js — 原子追加
const line = JSON.stringify({ type, payload, ts, source }) + '\n';
fs.appendFileSync(EVENTS_FILE, line, { encoding: 'utf-8' });
```

`update-by-name` 的 `task_id` 解析：CLI 不读 SQLite（避免文件锁），写入时 `task_id` 使用 `"by_name:<name>"` 格式。Electron 端的 vibe 摄入器解析到此格式后，查询数据库找到最近匹配任务再应用状态更新。

### 安装与 Hook 配置

CLI 工具随 UUUtil 安装包分发，安装后 `uuutil` 命令在任何 shell 中可用。三家的 Hook 配置完全相同：

**Claude Code**（`~/.claude/settings.json` 或 `.claude/settings.json`）：

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task create \"$HOOK_SESSION\" --project \"$CLAUDE_PROJECT_DIR\" --source claude",
        "timeout": 5
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task update-by-name \"$HOOK_SESSION\" --status needs_review",
        "timeout": 5
      }]
    }]
  }
}
```

**WorkBuddy / CodeBuddy**（`~/.codebuddy/settings.json`）：

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task create \"CodeBuddy-$CODEBUDDY_PROJECT_DIR\" --project \"$CODEBUDDY_PROJECT_DIR\" --source workbuddy",
        "timeout": 5
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task update-by-name \"CodeBuddy-$CODEBUDDY_PROJECT_DIR\" --status needs_review",
        "timeout": 5
      }]
    }]
  }
}
```

**OpenAI Codex CLI**（`~/.codex/hooks.json`）：

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task create \"codex-$(basename $(pwd))\" --project \"$(pwd)\" --source codex",
        "timeout": 5
      }]
    }],
    "Stop": [{
      "hooks": [{
        "type": "command",
        "command": "uuutil vibe task update-by-name \"codex-$(basename $(pwd))\" --status needs_review",
        "timeout": 5
      }]
    }]
  }
}
```

### 环境变量传递

各 AI Client 在 hook 执行时暴露环境变量：

| 工具 | 会话标识 | 项目目录 |
|------|---------|---------|
| Claude Code | `$HOOK_SESSION`（若不支持则用 `$(pwd)` 作为 key） | `$CLAUDE_PROJECT_DIR` |
| WorkBuddy | `$(pwd)`（无专用 session env） | `$CODEBUDDY_PROJECT_DIR` |
| Codex CLI | `$(pwd)`（无专用 session env） | `$(pwd)` |

## IPC 通道设计

遵循现有 `defineInvoke` 声明式注册模式。

### vibecoding 命名空间

| IPC 通道 | Preload 方法 | 说明 |
|----------|-------------|------|
| `vibecoding:create-task` | `window.assistant.vibecoding.createTask(input)` | 创建任务 |
| `vibecoding:update-status` | `window.assistant.vibecoding.updateStatus(taskId, status, meta?)` | 更新状态 |
| `vibecoding:get-task` | `window.assistant.vibecoding.getTask(taskId)` | 获取任务 |
| `vibecoding:list-tasks` | `window.assistant.vibecoding.listTasks(filters)` | 列出任务 |
| `vibecoding:has-pending` | `window.assistant.vibecoding.hasPending()` | 查询是否有待处理任务 |

## UI 设计

### VibecodingTaskPanel

页面组件，渲染进程 `renderer/components/VibecodingTaskPanel.tsx`。

布局结构：
```
┌─────────────────────────────────────────────────┐
│  Vibecoding 任务追踪                              │
│  [全部] [待处理 3] [进行中] [已完成] [失败]         │  ← 状态筛选 Tab
│  ▼ 按项目筛选                      [+ 新建任务]    │
├─────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────┐   │
│  │ 🔴 needs_review  重构 AI 模块             │   │  ← 高亮卡片
│  │ /Users/hanjun/UUUtil                     │   │
│  │ 2 个上下文文件 · 5 分钟前                  │   │
│  │ [查看详情] [标记完成]                       │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │ 🟡 needs_action  修复 DB 连接池            │   │
│  │ /Users/hanjun/SynologyDrive/PROJECT/...  │   │
│  │ 无上下文文件 · 12 分钟前                    │   │
│  │ [查看详情] [标记完成]                       │   │
│  └──────────────────────────────────────────┘   │
│  ...                                             │
└─────────────────────────────────────────────────┘
```

**状态 Badge 颜色**（复用现有颜色体系）：
- `pending`：灰色
- `running`：橙色（Chakra orange.500）
- `needs_review`：红色（Chakra red.500）— 带脉冲动画
- `needs_action`：黄色（Chakra yellow.500）— 带脉冲动画
- `blocked`：紫色（Chakra purple.500）— 带脉冲动画
- `completed`：绿色（Chakra green.500）
- `failed`：灰色深色（Chakra gray.600）

**筛选栏**：Tab 切换全部 / 待处理（needs_review + needs_action + blocked）/ 进行中（pending + running）/ 已完成 / 失败，各 Tab 显示计数。

**手动操作**：支持在 UI 中手动将任务标记为 `completed`（仅限非 `pending` 状态），以及手动创建新任务。

### 悬浮球增强

在现有悬浮球光环上叠加呼吸光点，待处理任务 > 0 时持续闪烁：

```
     ╭───────────╮
    ╱             ╲
   │   ⊙     ⊙   │     ← 光环边缘暖橙色光点（呼吸闪烁）
    ╲             ╱
     ╰───────────╯
```

实现方式：在主进程监听 EventBus `vibecoding:task-needs-attention` 事件，通过 IPC send 通知渲染进程触发光点闪烁。待处理任务数为 0 时停止闪烁。光点复用现有 `ball-mcp-pulse` 的 CSS 动画机制，使用独立颜色（暖橙 `#F59E0B`），与 MCP 活动的蓝色光圈区分。

### 路由配置

面板导航新增「Vibecoding」入口，路由 `/vibecoding`，图标使用 `Code2`（lucide-react）。

## 文件变更清单

### 新增文件

| 文件 | 位置 | 职责 |
|------|------|------|
| `cli/index.js` | 项目根 `cli/` | CLI 根入口，子命令路由分发 |
| `cli/commands/vibe.js` | 项目根 `cli/` | `uuutil vibe` 命令实现，追加 events.jsonl |
| `cli/utils/events.js` | 项目根 `cli/` | events.jsonl 原子追加写入工具 |
| `cli/utils/format.js` | 项目根 `cli/` | 输出格式化（table / JSON） |
| `cli/utils/id.js` | 项目根 `cli/` | 时间戳 ID 生成 |
| `cli/package.json` | 项目根 `cli/` | CLI 独立包配置，编译为单文件二进制 |
| `src/plugins/vibecoding/index.ts` | Electron 端 | 插件入口，manifest + activate/deactivate，注册数据库表，启动摄入器 |
| `src/plugins/vibecoding/api.ts` | Electron 端 | 核心逻辑：CRUD + 状态流转校验 + EventBus 事件发射 |
| `src/plugins/vibecoding/db.ts` | Electron 端 | SQLite 表 Schema 和查询封装 |
| `src/plugins/vibecoding/ingest.ts` | Electron 端 | events.jsonl 监听 + `vibe:*` 事件路由 + 逐行解析 + 去重 + 写数据库 |
| `src/core/event-router.ts` | Electron 端 | 统一事件分发器，按 type 前缀路由到各插件摄入器 |
| `src/main/ipc/vibecoding.ipc.ts` | Electron 端 | Vibecoding IPC 通道注册 |
| `renderer/pages/VibecodingPage.tsx` | 渲染进程 | 页面壳组件 |
| `renderer/components/VibecodingTaskPanel.tsx` | 渲染进程 | 任务面板核心组件 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/shared/types.ts` | 新增 `VibecodingTask`、`VibecodingTaskStatus`、`VibecodingTaskFilters` 等类型 |
| `src/main/ipc/index.ts` | 导入并注册 vibecoding IPC 模块 |
| `src/main/ipc/types.ts` | 确认 defineInvoke/defineSend 类型兼容 |
| `src/main/preload.ts` | 暴露 `window.assistant.vibecoding.*` |
| `src/main/index.ts` | 引入 vibecoding 插件激活 + 启动事件分发器 + 监听 EventBus 触发悬浮球提醒 |
| `src/core/event-bus.ts` | 确认事件类型扩展（vibecoding:* 命名空间） |
| `renderer/router.tsx` | 添加 `/vibecoding` 路由 |
| `renderer/App.tsx` | 悬浮球增加待处理光点闪烁 + 轮询 has-pending |
| `renderer/global.css` | 新增光点闪烁样式 |
| `package.json` | 新增 `bin` 字段指向编译后的 CLI 二进制 |

## 与现有系统的关系

| 现有系统 | 关系 |
|----------|------|
| **CLI 系统** | `uuutil vibe` 是 CLI 的 Vibecoding 子命令，CLI 是一等公民组件 |
| **events.jsonl** | CLI 与 Electron 之间的通信桥，所有子命令共享同一份文件 |
| **事件分发器** | 新增 `src/core/event-router.ts`，按 type 前缀将事件路由到各插件摄入器 |
| **悬浮球** | 新增暖橙色光点闪烁 + 复用光圈动画，与 MCP 蓝色光圈区分 |
| **EventBus** | 使用 `vibecoding:*` 命名空间，与 `core:*` 和 `plugin-id:*` 隔离 |
| **日志框架** | 摄入器事件写入日志，scope 为 `vibecoding.ingest` |
| **AI 框架** | 不直接依赖，但 Provider 配置可复用于规则管理（方向 C） |

## 后续扩展

| 方向 | 说明 |
|------|------|
| **C: Prompt/规则管理** | 新增 `vibecoding_rules` 表和对应 CLI 命令，管理 `.cursorrules` 等规则文件的版本和关联 |
| **VibecodingSession** | 记录每次 AI 会话的 prompt 和 response，支持回溯历史决策 |
| **统计面板** | 按项目/时间段统计 vibecoding 效率（完成率、平均耗时、失败原因分布） |
| **任务模板** | 常用 vibecoding 任务类型预设 |
| **CLI 强化** | `uuutil vibe` 支持 pipe 模式（stdin 读 JSON 批量写入）、`--watch` 模式（实时显示任务状态变化） |
| **CLI 其他子命令** | 按命令树逐步实现 `focus`、`plugin`、`db`、`config`、`status`、`log` 子命令 |
