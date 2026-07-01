# 焦点管理设计方案：从条目管理到注意力观察

**类型：** uuutil MCP 设计方案  
**作者：** 孙汉君（老孙）  
**日期：** 2026-06-30  
**状态：** 供讨论

---

## 一、为什么要重新设计

当前 uuutil 的核心数据模型是一个披着"焦点管理"外衣的轻量 TODO 工具。它关心的是条目的属性标签（horizon / status / importance），而不是注意力的实际分布和质量。

**核心命题转变：**

| | 当前实现 | 本设计 |
|---|---|---|
| 管什么 | 条目的属性标签 | 注意力的分布和质量 |
| 怎么管 | 手动标记状态 | 检视记录驱动的自动运算 |
| 终态 | active → completed | 比重自然衰减 → 淡出 |
| 系统角色 | 静默数据存储 | 异动侦测 + 被动展示 |
| 用户角色 | 操作者（改字段、切换状态） | 记录者（只做 check-in） |

---

## 二、设计原则

1. **焦点不可被操作，只能被记录。** 用户唯一能做的事是声明关注对象（focus_create）和扔记录进去（focus_check_in）。焦点的 weight 衰减、health 变化、mode 切换全部由系统自动运算。焦点不是被管理的对象，而是被观察的现象。

2. **展示不是操作。** 仪表盘是纯只读视图。它告诉你注意力在哪、哪些焦点在淡出、哪里出现了异常——但不提供任何"修正"入口。数据的偏移本身就是信号，不应被手动覆盖。

3. **动态，不是静态。** 重要性随时间衰减，需定期重新确认。但"确认"的方式不是点按钮，而是产生新的 check-in 记录。

4. **异动只在数据异常时发声。** 系统平时安静。只有当检视频率严重偏离预期、比重剧烈衰减时，才标注异动。

5. **没有"完成"。** 焦点只会降低比重、降低审视频率，最终自然淡出视线。不存在一个"关闭"动作。

---

## 三、新数据模型

### 3.1 焦点 (FocusArea)

```
{
  "id": "string",
  "name": "string",
  "description": "string?",
  "weight": 1-10,                   // 注意力比重，自动衰减
  "attentionMode": "deep" | "pulse" | "scan" | "dormant",
  "reviewCadence": "daily" | "weekly" | "biweekly" | "monthly",
  "health": "aligned" | "drifting" | "neglected" | "cooling",  // 只读，自动计算
  "expectedExit": "string?",        // 自然语言描述的退出条件
  "tags": ["string"],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

**字段变化说明：**

| 移除 | 原因 | 替代 |
|---|---|---|
| `horizon` (5层) | 过度分类，边界模糊 | `attentionMode` + `weight` |
| `status` (active/completed) | 焦点不终结 | `health` 自动计算 |
| `importance` (静态标签) | 不反映动态变化 | `weight` 可衰减的数字 |
| `nextReviewAt` | 精确日期无意义，需要的是频率 | `reviewCadence` |
| `whyImportant` | 冗余，并入 description | — |
| `desiredOutcome` | 已由 expectedExit 覆盖 | `expectedExit` |
| `contextLinks` | 非核心字段 | tags 满足分类需求 |

**新增：**

| 字段 | 说明 |
|---|---|
| `weight` (1-10) | 在总注意力预算中的相对占比，自动衰减 |
| `attentionMode` | 注意力投入模式：deep(沉浸)/pulse(脉冲)/scan(扫视)/dormant(休眠) |
| `reviewCadence` | 审视频率，自动从 attentionMode 推导 |
| `health` | 只读，由系统根据检视频率和比重自动计算 |
| `expectedExit` | 自然语言描述的退出条件，非截止日期 |

### 3.2 检视记录 (CheckIn) — 唯一的用户输入通道

```
{
  "id": "string",
  "focusId": "string",
  "timestamp": "ISO8601",
  "energy": "engaged" | "neutral" | "avoiding",
  "blocker": "string?",
  "nextAction": "string?",
  "notes": "string?"
}
```

这是用户与系统之间的唯一写入操作。不需要每天覆盖所有焦点——**只记录你当时愿意面对的那些**，空白本身就是信号。

| 字段 | 含义 |
|---|---|
| `energy` | 你对这件事的主观能量状态 |
| `blocker` | 当前最大的阻碍（技术/人力/依赖/决策） |
| `nextAction` | 下一次要推动的具体动作，不是宏大目标 |

### 3.3 异动规则 (WatchRule)

```
{
  "id": "string",
  "focusId": "string",
  "type": "neglected" | "weight_decay" | "attention_drift" | "exit_triggered",
  "threshold": "number",
  "enabled": "boolean"
}
```

系统根据规则自动检查，触发时生成异动标注，呈现在展示视图中。

---

## 四、系统行为规则

### 4.1 比重自动衰减

```
每个 reviewCadence 周期结束时执行：
  if 该周期内无任何检视记录:
    weight = max(weight - 1, 0)
    if weight <= 2:
      health = "cooling"
    if weight == 0:
      触发 exit_triggered 异动
```

**设计意图：** 你不需要声明"我不关注了"。不检视 → 注意力自然流失 → 比重下降 → 数据告诉你它正在淡出。

### 4.2 健康度自动计算

```
function computeHealth(focus, lastCheckInDate):
  threshold = {
    deep:    2天,
    pulse:   4天,
    scan:    10天,
    dormant: 30天
  }

  daysSince = today - lastCheckInDate

  if focus.weight <= 2:
    return "cooling"
  elif daysSince > threshold[focus.attentionMode]:
    return "neglected"
  elif daysSince > threshold[focus.attentionMode] * 0.5:
    return "drifting"
  else:
    return "aligned"
```

health 是只读字段，每次查询时实时计算，不存储。

### 4.3 异动触发

| 异动类型 | 触发条件 | 展示效果 |
|---|---|---|
| `neglected` | deep焦点 3 天无检视 / scan焦点 2 周无检视 | 焦点标红，异动列表加一条 |
| `weight_decay` | 比重降至上次值的 50% 以下 | 焦点标记衰减趋势 |
| `attention_drift` | 低权重焦点短期内密集检视 | 标注实际投入与预设比重偏差 |
| `exit_triggered` | weight == 0 | 焦点标记为即将淡出 |

### 4.4 reviewCadence 自动推导

```
attentionMode → 默认 reviewCadence:
  deep    → daily
  pulse   → daily（但阈值更宽松）
  scan    → weekly
  dormant → monthly
```

---

## 五、呈现形式：气泡图

焦点状态通过气泡图展示，纯只读视图。

| 维度 | 映射 | 含义 |
|---|---|---|
| X 轴 | 距上次检视天数 | 越右 → 越久没关注 |
| Y 轴 | 注意力比重 (weight) | 越高 → 越重要 |
| 气泡大小 | 检视活跃度（check-in 频率） | 越大 → 投入越频繁 |
| 颜色 | 健康度 | 绿=aligned / 黄=drifting / 红=neglected / 灰=cooling |

**解读方式：** 理想焦点聚集在左上角（重要且活跃）；漂向右下的气泡是自然淡出中的焦点；右上气泡（重要但久未关注）是需要留意的信号。

气泡图上叠加异动标注。底部列出当前异动事件列表。无需交互操作——这是一张"注意力心电图"，不是控制面板。

---

## 六、MCP 工具接口

用户只做两件事：声明焦点 + 记录检视。其余全是查询。

### 6.1 写入工具（仅 2 个）

| 工具 | 说明 |
|---|---|
| `focus_create` | 声明一个关注对象。参数：name, description?, attentionMode, weight, expectedExit?, tags? |
| `focus_check_in` | 扔一条检视记录。参数：focusId, energy, blocker?, nextAction?, notes?。系统自动据此更新焦点的衰减时钟 |

### 6.2 查询工具

| 工具 | 说明 |
|---|---|
| `focus_get` | 查询单个焦点，返回中自动计算 `daysSinceLastCheckIn` + `health` |
| `focus_list` | 列出焦点。默认按 health 排序（neglected 优先）；支持 weight/health/tag 过滤 |
| `focus_alerts` | 列出当前所有触发的异动事件 |
| `focus_checkins` | 查询某焦点的检视历史记录 |
| `focus_stats` | 注意力分布统计：各模式焦点数 + 各 health 计数 + 异动数 |
| `focus_list_tags` | 列出所有标签 |
| `focus_create_tag` | 创建标签。参数：name, color? |
| `focus_update_tag` | 修改标签名称或颜色 |
| `focus_delete_tag` | 删除标签（检查引用） |

### 6.3 移除的工具

| 移除 | 原因 |
|---|---|
| `focus_update` | 焦点不可被手动修改，所有变化来自 check-in 驱动 |
| `focus_change_status` | status 概念被移除 |
| `focus_migrate` | horizon 概念被移除 |
| `focus_list_migrations` | 由异动事件 + 检视历史替代 |
| `focus_delete` | 焦点不删除，只会淡出到 weight=0 |

### 6.4 不存在的工具（曾有考虑，最终排除）

| 未采纳 | 原因 |
|---|---|
| `focus_cool_down` | 违反了"不可操作"原则。淡出是自然结果，不是操作 |
| `focus_reset_weight` | 违反同上。重新确认重要性的方式应该是产生新的 check-in 记录 |
| `focus_dashboard` | 计算逻辑由查询工具返回数据，渲染由前端（气泡图）完成 |

---

## 七、典型使用场景

### 场景一：日常检视

```
用户打开气泡图：
  → 看到左上角有 3 个绿色大气泡（核心焦点，活跃）
  → 看到右侧一个红色气泡悬在 y=8 高度（AI部署，重要但 5 天未检视）
  → 底部异动列表："AI部署 已5天未检视，进入 neglected"

用户（在对话中）：
  check_in("AI部署", energy=avoiding, blocker="等运维开通防火墙端口")
  check_in("中邮E10迁移", energy=engaged, nextAction="下午联调数据校验")

下次打开气泡图：
  → AI部署 气泡左移（daysSince 重置为 0），但颜色仍可能偏黄（连续 avoiding 的 energy 趋势）
```

### 场景二：比重自然衰减

```
"CircuLearn网站" weight=5, attentionMode=scan, reviewCadence=weekly

第 1 周无检视 → weight 降至 4 → health = "drifting" → 气泡右移 + 颜色变黄
第 2 周无检视 → weight 降至 3 → health = "cooling" → 气泡继续右移 + 颜色变灰

用户打开气泡图看到：CircuLearn 在右下角，灰色，小气泡。
—— 数据说话：这个焦点正在淡出。不需要用户做任何"操作"。
```

### 场景三：注意力错位自动标注

```
预设：中邮E10迁移 weight=9, AETHERPEDIA weight=2
实际：过去一周 AETHERPEDIA 检视 10 次，中邮 2 次

→ 触发 attention_drift 异动
→ 气泡图叠加标注："投入与预设比重偏差"
→ 用户看到后自然反思：是 AETHERPEDIA 确实变重要了（那应该调整初始 weight），还是单纯的拖延？
```

### 场景四：打开气泡图看全景

```
打开后一眼看到：
  左上角：4 个绿色大气泡（核心活跃焦点）
  中上部：2 个黄色气泡（有点漂移）
  右上角：1 个红色气泡（重要但失焦）
  右下角：2 个灰色小气泡（自然冷却中）

底部异动：neglected x1, weight_decay x2, attention_drift x1

→ 不需要额外分析，视觉编码已经说清楚了一切。
```

---

## 八、对比总结

| 维度 | 当前实现 | 本设计 |
|---|---|---|
| 核心概念 | 标签化的条目 | 注意力分布和质量 |
| 用户角色 | 操作者（改状态、改字段） | 记录者（只声明 + 检视） |
| 状态管理 | 手动标记 active/completed | 检视频率驱动的自动健康度 |
| 重要性 | 静态 critical/high/medium/low | 连续 weight 1-10，自动衰减 |
| 时间维度 | horizon 5层 + nextReviewAt | attentionMode + reviewCadence |
| 写入操作 | create / update / change_status / migrate / delete | 仅 create + check_in |
| 呈现形式 | 无 | 气泡图（纯只读，四维编码） |
| 终态 | 完成/删除 | 比重衰减至 0 → 自然淡出 |
| 标签 | ✅ | ✅（补全 CRUD） |
| 检视记录 | ❌ | ✅（唯一输入通道） |

---

## 九、迁移考虑

如果当前 uuutil 已有用户数据，建议路径：

1. **新设计作为独立接口上线**（新增字段 + 新工具），现有接口继续保留
2. **提供迁移工具：** `horizon → attentionMode` 映射 + `importance → weight` 映射
3. **灰度切换：** 现有用户可选择性迁移到新接口，不强制
4. **数据兼容：** 现有 focus 数据可转换为新设计的基础结构，缺失字段使用映射规则自动填充

### 映射规则

```
importance → weight:
  critical → 9
  high     → 7
  medium   → 5
  low      → 3

horizon → attentionMode:
  current_core → deep
  near_term    → pulse
  long_term    → scan
  watching     → dormant
  archived     → dormant (weight:1)
```

---

*文档由 WorkBuddy 搭档辅助生成，基于 uuutil MCP 全量测试结果和多轮设计讨论迭代。*
