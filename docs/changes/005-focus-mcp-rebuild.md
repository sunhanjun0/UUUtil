# 005 - 焦点管理重建与 MCP 服务接入

## 背景

本轮开发依据 `report/uuutil-focus-redesign-proposal.md` 重建焦点功能。产品决策是不保留迁移期、不迁移旧数据，直接把焦点从手动维护功能改为注意力观察系统。

焦点系统的目标是记录用户和助手在真实工作中持续投入注意力的主题，而不是管理 TODO、完成状态或人工打卡。

## 产品决策

- 焦点由 MCP、Skill、内部助手或外部系统自动创建和检视。
- 渲染界面只做观察和展示，不提供人工 check-in 表单。
- 允许通过受控接口修正名称、描述、标签、关注模式和期望退出条件。
- 权重由系统随时间衰减，并根据重复检视恢复。
- `expectedExit` 当前仅展示，不驱动自动归档。
- 标签使用 JSON 存储，便于外部系统传入结构化分类。
- 开发期允许清空焦点数据，但不暴露正式 MCP reset 工具。

## 数据模型

焦点插件重建为 `attention-v1` schema：

- `_focus_meta`：记录 schema version。
- `focus_areas`：焦点主体，包含名称、描述、权重、关注模式、期望退出条件、标签 JSON 和时间戳。
- `focus_checkins`：检视记录，包含能量状态、阻塞、下一步和备注。
- `focus_tags`：标签名称和颜色。

计算视图包含：

- `reviewCadence`
- `health`
- `daysSinceLastCheckIn`
- `recentCheckInCount`
- `alerts`

## 插件与 IPC

`src/plugins/focus/api.ts` 现在提供：

- `create`
- `updateMetadata`
- `checkIn`
- `get`
- `list`
- `alerts`
- `checkins`
- `stats`
- `listTags`
- `createTag`
- `updateTag`
- `deleteTag`

`src/main/ipc/focus.ipc.ts` 和 `src/main/preload.ts` 暴露对应的 `window.assistant.focus.*` 方法。正式 preload API 不暴露 `resetAll`，开发期清库使用脚本。

## MCP 服务

新增 `src/mcp/`：

- `focus-tools.ts`：注册焦点 MCP 工具，复用 focus 插件 API。
- `http-service.ts`：应用内 Streamable HTTP MCP 服务。
- `server.ts`：stdio 兼容入口，默认代理到 HTTP MCP；显式 `--direct-db` 才启动直连数据库模式。

默认服务地址：

```text
http://127.0.0.1:17878/mcp
```

健康检查：

```bash
curl http://127.0.0.1:17878/health
```

新增脚本：

```bash
npm run mcp:build
npm run mcp:stdio
npm run mcp:dev
npm run focus:reset-all
```

## 多进程数据库策略

由于 sql.js 是内存数据库加手动持久化，多个外部进程直接写同一个数据库文件会有覆盖风险。本轮调整为：

- Electron 主应用启动时持有默认数据库连接。
- 外部系统统一调用应用内 HTTP MCP 服务。
- MCP 工具调用在服务内串行执行。
- direct-db stdio 模式仅作为显式开发调试能力。
- `core/db` 增加外部变更检测和受控 reload，避免陈旧内存库覆盖外部写入。

## 日志跟踪

MCP 调用接入统一日志：

- `mcp:http`：服务启动、会话、请求和关闭。
- `mcp`：工具调用开始、完成、失败、数据库 reload。

日志记录工具名、耗时、成功/失败和错误摘要，不记录完整用户输入、Token、请求头、附件正文或 base64。

## 看板交互

焦点 UI 调整为只读看板：

- 按小时级对数时间圈分布焦点，近期焦点靠近中心。
- 泡泡大小与权重关联，不直接展示权重数字。
- 泡泡内部只显示图标，悬停展示名称、健康度、关注模式、描述和检视信息。
- 当遮挡超过阈值时，悬停触发星形扩散和连线。
- 扩散状态在鼠标离开扩散半径热区后恢复，避免还没移到被遮挡泡泡时动画复原。
- 悬浮球收到 MCP 写入时显示短暂光圈提示。

## Skill 分发

新增仓库内 Skill 副本：

- `skills/uuutil-focus/SKILL.md`
- `skills/uuutil-focus/agents/openai.yaml`
- `skills/uuutil-focus.zip`

该 Skill 要求 Agent 在每个实质性回合末尾判断是否需要记录焦点：先匹配现有 Focus，必要时创建，再执行 `focus_check_in`。

## 相关文档

- `docs/focus-mcp-integration.md`：焦点 MCP 接入、Client 配置和排查手册。
- `docs/requirements.md`：新增焦点管理和 MCP 外部接入需求。
- `docs/CONVENTIONS.md`：新增 MCP、焦点和多进程数据库约定。
- `README.md`：补充焦点看板、MCP 服务和常用命令。

## 验证建议

提交前建议执行：

```bash
npm run build
```

如果需要验证 MCP 服务，需要先启动 UUUtil 应用，再检查：

```bash
curl http://127.0.0.1:17878/health
```
