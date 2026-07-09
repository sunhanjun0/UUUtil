# 代码设计约定（核心规则）

## 插件架构规则（铁律）

1. **插件隔离**：插件之间禁止直接 `import`，所有跨插件通信必须通过 `EventBus` 的 `bus.emit()` / `bus.on()`

2. **插件 API**：每个插件对外暴露的唯一接口在 `api.ts` 中定义，其他地方禁止 `import` 插件内部实现

3. **数据库统一入口**：所有数据库操作通过 `core/db` 的 `getDatabase()` 获取连接，写操作后必须调用 `autoSave()` 持久化

4. **事件命名**：`core:*` 为内核事件（仅内核可发送），`plugin-id:*` 为插件命名空间（插件使用自己的命名空间）

5. **错误处理**：EventBus handler 不允许抛异常（会被静默捕获），插件自行处理内部异常并通过核心日志记录摘要

6. **日志统一入口**：
   - 主进程/核心模块使用 `core/logger`
   - 渲染进程使用 `window.assistant.log()`
   - **禁止**散落文件日志
   - **禁止**记录 API Key、Token、完整用户输入、附件原文和 base64

## 插件开发约定

插件开发流程：
1. 复制 `src/plugins/hello-world/` 目录作为模板
2. `index.ts` 导出 `manifest`、`activate`、`deactivate`
3. `activate()` 中通过 `bus.on()` 注册事件监听
4. `api.ts` 导出对外 API 对象（类型在 `src/shared/types.ts` 中定义）
5. TypeScript 编译后在插件目录生成 `index.js`，由 `plugin-loader` 通过 `require()` 动态加载

## IPC 约定

- 主进程 IPC 已按功能拆分到 `src/main/ipc/{feature}.ipc.ts`
- 统一由 `src/main/ipc/index.ts` 汇总注册
- `preload.ts` 通过 `contextBridge` 暴露 `window.assistant` API 给渲染进程

## 类型约定

- 共享类型统一放在 `src/shared/types.ts`
- 三方库缺少类型时在 `src/types/` 添加 `.d.ts` 声明文件