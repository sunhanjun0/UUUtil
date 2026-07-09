# 常用命令

## 开发

```bash
npm run dev          # 开发模式（并发编译主进程 + 启动 Vite HMR）
npm run dev:main     # 仅编译并运行主进程
npm run dev:renderer # 仅启动 Vite 开发服务器
```

## 构建

```bash
npm run build        # 生产构建（先主进程后渲染进程）
npm run build:main   # 仅编译主进程 TypeScript
npm run build:renderer # 仅执行 Vite 构建
npm run start        # 运行已构建的 Electron 应用
npm run pack         # 使用 electron-builder 打包到目录
```

## Git（macOS/Darwin 标准命令）

```bash
git status           # 查看状态
git log --oneline    # 查看精简提交历史
git diff             # 查看差异
```

## 项目结构查看

```bash
ls src/plugins/      # 查看已安装插件
find . -name "*.ts" | wc -l # 统计 TypeScript 文件数
```