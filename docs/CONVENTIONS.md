# 编码约定

## 铁律（不可违反）

### 1. 插件间禁止直接引用
```typescript
// ❌ 禁止
import { something } from '../plugins/knowledge/internal';

// ✅ 允许：通过事件总线通信
bus.emit('knowledge:search', query);
bus.on('knowledge:results', handler);
```

### 2. 每个插件暴露的接口定义在 api.ts
- 文件位置：`plugins/{plugin-id}/api.ts`
- 其他地方禁止 import 插件内部实现
- api.ts 是插件的「合同」，改了等于破坏向后兼容

### 3. 数据库操作统一走 core/db
- 插件不直接创建 SQLite 连接
- 通过 `getDatabase()` 获取已初始化的连接
- 写操作后调用 `autoSave()` 持久化到磁盘
- sql.js 是内存数据库 + 手动持久化模式

## 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 插件目录 | 全小写横线分隔 | `screenshot-ocr` |
| TypeScript 文件 | 全小写横线或点分隔 | `event-bus.ts` |
| React 组件 | PascalCase | `PluginCard` |
| 数据库表名 | 蛇形命名 | `_plugins`, `plugin_todo_items` |
| 事件名 | `domain:action` | `core:ready`, `todo:item-created` |

## 事件命名约定

- `core:*` — 内核事件（插件不要发 core 事件）
- `plugin-id:*` — 插件自己的事件命名空间

## 数据库操作模式

```typescript
const db = getDatabase();
db.run('INSERT INTO ... VALUES (?, ?)', [val1, val2]);
autoSave(); // 写操作后必须调用
```

## 错误处理
- event-bus 中的 handler 不抛异常（会被静默捕获）
- 插件内部自行处理异常，不传播到核心层
