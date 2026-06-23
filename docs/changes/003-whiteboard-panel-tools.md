# 003 - 面板交互、白板与工具能力迭代

## 背景

在项目脚手架和基础插件能力完成后，本轮重点从“可用”转向“日常可用”：优化面板导航体验，强化首页白板，补齐计算器和开发工具的高频交互，并接入 AI 配置框架。

---

## 主要变更

### 1. 面板与全局入口

- 面板内容区增加横向滑入/滑出动画。
- 多卡片页面增加错峰进入/退出动效。
- 调整动画时长、缓动、位移幅度，让切换更接近从边缘穿梭进入。
- 导航右侧工具按钮合并为一个半透明按钮组。
- 接入全局快捷键切换面板：
  - `Control + Shift + U`
  - `Option + Space` 备用
- 托盘菜单和悬浮球右键菜单显示快捷键提示。
- 主进程退出时注销全局快捷键。

相关文件：

- `renderer/App.tsx`
- `renderer/router.tsx`
- `src/main/index.ts`

---

### 2. 首页多功能白板

首页从静态内容替换为多功能白板。

#### 画布能力

- 画布充满首页内容区。
- 左侧竖向工具栏支持新增画布、切换画布、删除画布、添加便签、添加文本框、导入文件、清空画布。
- 画布支持命名，标题输入框宽度随名称自动变化。
- 多画布数据持久化到 SQLite/sql.js，避免切换或重启丢失。
- 旧 localStorage 数据可迁移读取。

#### 便签能力

- 支持新增、拖动、缩放。
- 支持编辑标题和正文。
- 支持切换便签底色。
- 便签正文复用底部统一文字工具栏。
- 头部操作改为图标按钮：换底色、删除。

#### 文本框能力

- 文本框交互调整为 PPT/draw.io 风格：
  - 单击选中。
  - 选中态拖拽框体移动。
  - 双击进入编辑。
  - 点击空白处退出选中/编辑。
- 支持键盘直接输入创建文本框。
- 支持外部文本粘贴创建文本框。
- 粘贴文本根据内容自动计算初始宽高。
- 选中态支持 `Delete` / `Backspace` 删除。
- 支持 `Command/Ctrl + Z` 回滚白板操作。
- 统一文字工具栏支持：加粗、下划线、删除线、字号调整、五色文字颜色。

#### 图片与附件

- 支持剪贴板文件/图片导入。
- 支持工具栏选择文件导入。
- 图片在画布中预览，附件以卡片展示并支持下载。

#### 交互细节

- 画布默认禁用双击选中文本，避免双击元素时误选标题或 UI 文本。
- 可编辑输入区单独允许文本选择。
- 右键菜单简化为画布操作和元素删除。

相关文件：

- `renderer/pages/HomePage.tsx`
- `src/core/db.ts`
- `src/main/index.ts`
- `src/main/preload.ts`
- `renderer/App.tsx`

---

### 3. 计算器增强

- 增加键盘输入支持。
- 支持数字、运算符、括号、小数点、百分号等输入。
- `Enter` / `=` 执行计算。
- `Backspace` 删除。
- `Escape` / `Delete` 清空。
- 计算历史最多保留 10 条。
- 历史记录放入计算显示区域，自然向上滚动。
- 每次计算成功后，结果作为下一次计算起点。

相关文件：

- `renderer/components/Calculator.tsx`

---

### 4. 开发工具增强

- 新增 SQL 美化和压缩功能。
- 未知 dev-utils action 返回明确错误，避免 UI 无响应。
- 时间戳工具增加当前时间多格式展示：
  - 毫秒时间戳
  - 秒时间戳
  - ISO 8601
  - UTC
  - 本地时间
  - 日期
  - 时间

相关文件：

- `renderer/components/DevUtils.tsx`
- `src/plugins/dev-utils/api.ts`
- `src/plugins/dev-utils/index.ts`
- `src/shared/types.ts`

---

### 5. AI 配置与翻译入口

- 新增 AI 核心模块，支持 OpenAI-compatible Provider。
- 支持 Provider 管理、运行配置和统一 Chat 调用。
- preload 暴露 `window.assistant.ai`。
- 面板增加 AI 配置入口。
- 新增翻译页面入口，为后续 AI 翻译能力铺底。

相关文件：

- `src/core/ai.ts`
- `src/core/index.ts`
- `src/main/preload.ts`
- `renderer/pages/AiConfigPage.tsx`
- `renderer/pages/TranslationPage.tsx`
- `renderer/router.tsx`
- `renderer/App.tsx`

---

### 6. 图标统一

- 引入 `lucide-react` 和 `@tabler/icons-react`。
- 当前主要使用 Lucide 统一导航、空状态、工具栏和白板操作图标。
- 知识库空状态从 emoji 替换为 Lucide 图标。

相关文件：

- `package.json`
- `package-lock.json`
- `renderer/router.tsx`
- `renderer/components/KnowledgeBase.tsx`
- `renderer/pages/HomePage.tsx`

---

## 验证

本轮多次执行：

```bash
npm run build
```

主进程 TypeScript 编译和渲染进程 Vite 构建均通过。

---

## 已知限制

1. `Option + Space` 可能被系统、输入法或其他应用占用，因此增加 `Control + Shift + U` 作为主快捷键。
2. Electron 原生 `globalShortcut` 不适合实现“双击 Control/Option”这类单独修饰键双击；若后续坚持该交互，需要引入底层键盘监听方案并处理 macOS 辅助功能权限。
3. 白板撤销栈当前为内存态，应用重启后不可撤销上次会话操作。
4. 白板当前未实现元素层级调整、框选、多选等高级画布能力。

---

## 后续建议

- 增加快捷键配置页面。
- 将白板元素操作抽成更清晰的 reducer，降低 `HomePage.tsx` 复杂度。
- 增加白板元素层级、框选、多选和对齐能力。
- 为 AI 翻译页面补充完整交互：源语言/目标语言、历史记录、快捷复制。
- 根据实际使用继续打磨全局快捷键与托盘体验。
