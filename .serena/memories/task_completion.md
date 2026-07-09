# 任务完成检查清单

完成编码任务后，应按顺序执行以下检查：

## 1. 类型检查

项目未配置独立的 `tsc --watch` 检查，但构建会验证类型：

```bash
# 检查主进程类型
tsc -p tsconfig.main.json
# 检查渲染进程/核心类型
tsc -p tsconfig.json
```

## 2. 构建验证

```bash
npm run build
```

确保构建无错误。

## 3. 代码规范

本项目当前无强制的 lint 或 format 配置，保持与现有代码风格一致即可：
- 使用双引号
- 缩进使用 2 空格
- 遵循 TypeScript 最佳实践

## 4. 架构合规检查

- 是否遵循插件隔离原则？`mem:conventions`
- 是否正确持久化数据库？`mem:conventions`
- 是否遵循日志规范？`mem:conventions`

## 5. 功能测试

开发模式运行验证功能：

```bash
npm run dev
```

## 完成标准

- 编译构建通过
- 功能符合需求
- 符合项目架构约定