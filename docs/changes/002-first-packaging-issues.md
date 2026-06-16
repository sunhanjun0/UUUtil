# 002 - 首次打包踩坑记录

## 背景

项目脚手架搭建完成后，首次执行 `electron-builder --dir` 打包 macOS 应用，遇到一系列问题。

---

## 问题一：Electron 二进制下载超时

### 现象

```
Get "https://npmmirror.com/mirrors/electron/v33.2.0/electron-v33.2.0-darwin-arm64.zip":
dial tcp 47.96.233.62:443: connect: operation timed out
```

GitHub 直连超时，npmmirror 镜像也超时。

### 原因

- electron-builder 内部的 Go 二进制 (`app-builder_arm64`) 自行下载 Electron zip，不走 npm 代理
- `ELECTRON_MIRROR` 环境变量对 electron-builder 有效，但当时镜像也不稳定

### 解决

1. 用 `curl` 手动从 npmmirror 下载完整的 Electron zip 到缓存目录：

```bash
curl -L -o ~/Library/Caches/electron/electron-v33.2.0-darwin-arm64.zip \
  "https://npmmirror.com/mirrors/electron/v33.2.0/electron-v33.2.0-darwin-arm64.zip"
```

2. electron-builder 检测到缓存已有有效 zip 后直接使用，不再下载。

### 关键知识点

- electron-builder 的缓存目录：`~/Library/Caches/electron/`
- 如果自动下载失败，手动下载放到该目录即可绕过
- 务必用 `unzip -t` 验证 zip 完整性，之前缓存的 131MB zip 有 CRC 错误

---

## 问题二：`dist/main/index.js` 不存在于 app.asar

### 现象

```
Application entry file "dist/main/index.js" in the
".../personal-assistant.app/Contents/Resources/app.asar" does not exist.
```

### 原因

`package.json` 缺少 electron-builder 的 `build` 配置。electron-builder 默认只打包 `package.json` 所在目录的**部分**文件（受 `.gitignore` 等规则影响），没有明确告诉它要包含 `dist/` 目录。

### 解决

在 `package.json` 中添加 `build` 字段：

```json
{
  "build": {
    "appId": "com.personal-assistant.app",
    "productName": "个人辅助软件",
    "files": [
      "dist/**/*",
      "package.json"
    ],
    "directories": {
      "output": "release"
    },
    "mac": {
      "target": "dir"
    }
  }
}
```

### 关键知识点

- `files` 字段：明确指定哪些文件打入 asar 包
- `directories.output`：指定打包输出目录，默认是 `dist/`，与 TypeScript 编译输出目录冲突，改为 `release/`
- `mac.target: "dir"`：生成未压缩的 `.app` 目录（而非 `.dmg`），开发阶段够用

---

## 问题三：缺少 `author` 字段

### 现象

```
• author is missed in the package.json
```

### 解决

`package.json` 添加 `"author": "hanjun"`。

虽然不是致命错误，但 electron-builder 会报警告，且某些打包平台要求此字段。

---

## 问题四（附带修复）：`npm start` 窗口无法加载

### 现象

直接运行 `npm start` 时 Electron 窗口空白，日志显示试图连接 `http://localhost:5173`。

### 原因

源码中判断条件：

```typescript
if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
  mainWindow.loadURL('http://localhost:5173');
}
```

`!app.isPackaged` 在非打包运行时始终为 `true`，导致 `npm start` 也走开发模式。

### 解决

去掉 `!app.isPackaged`，仅依赖 `NODE_ENV` 判断：

```typescript
if (process.env.NODE_ENV === 'development') {
  mainWindow.loadURL('http://localhost:5173');
} else {
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}
```

同时在 `dev:main` 脚本中显式设置环境变量：

```json
"dev:main": "tsc -p tsconfig.main.json && NODE_ENV=development electron dist/main/index.js"
```

---

## 最终结果

```
release/mac-arm64/个人辅助软件.app  (262MB)
```

可双击运行，功能正常。

---

## 后续可改进

1. **代码签名** — 当前未签名，macOS 可能会弹安全警告，正式分发需要 Apple Developer 证书
2. **减小体积** — 262MB 包含完整 Electron 运行时 + sql.js WASM，可以考虑排除不必要的 framework（如 Squirrel 更新框架）
3. **CI 缓存** — 在 CI 环境中缓存 `~/Library/Caches/electron/` 可避免每次下载
