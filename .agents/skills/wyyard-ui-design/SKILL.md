---
name: wyyard-ui-design
description: 无忧茶苑（wyyard）管理后台前端 UI 设计规范。当在 frontend/ 目录下做任何界面工作时必须使用：新建或修改页面、表格、表单、弹窗、按钮、Tab、调整样式、优化 UI、界面美化、排版对齐、颜色字号决策。触发词示例：「做个页面」「加个表格」「调整样式」「优化 UI」「这个界面不好看」「美化一下」「改下排版」「对齐数字」。只做浅色主题，克制优先，字重只用 400/500。
---

# 无忧茶苑 UI 设计规范

权威准则来源：`UI-DESIGN-GUIDELINES.md`（项目根目录），本 skill 是其执行版。冲突时以该文件为准。
适用范围：`frontend/`（React 管理端）。两个小程序（miniprogram/、miniprogram-client/）不适用。

## 核心原则（红线）

- **克制优先**：少即是多，不加不必要的装饰。
- **只做浅色主题**。`index.css` 里虽有 `.dark` 变量，但产品不交付暗色，新代码不要写 dark: 变体。
- **字重只用 400（font-normal）和 500（font-medium）**，禁用 font-semibold/bold（600/700）。层次靠字号和颜色区分，不靠字重堆砌。
- 圆角要小：输入框/按钮 `rounded-[4px]`；基类 Button 的 `rounded-lg` 对应 `--radius: 0.375rem`（6px），不要再加更大圆角。
- 右边距紧凑，不留多余空白。

## 排版层次（只用这 5 级）

| 层级 | 用途 | 字号 | 字重 | 颜色（Tailwind 写法） |
|------|------|------|------|------|
| L1 标题 | 页面标题 | `text-lg`（18px） | 500 | `text-[#111]` / `text-[#1f2329]` |
| L2 表头 | 表格列标题 | `text-[13px]`（基类已实现） | 400 | `text-[#8f959e]` |
| L3 主数据 | 用户名、金额等关键信息 | `text-[13px]` | 500 | `text-[#111]` |
| L4 次数据 | 类型、名称等 | `text-[13px]` | 400 | `text-[#2b2f36]` / `text-[#4e535a]` |
| L5 辅助 | 日期、成交人、备注 | `text-[12px]` | 400 | `text-[#8f959e]` |

- 空值占位用 `#ddd` / `#d0d3d6` / `#c9cdd4`，不用 `#8f959e`（太重）。
- 全局字体是 Geist Variable（`index.css` 已配），不要引入其他字体。

## 颜色系统

直接用十六进制 arbitrary value（项目惯用写法），语义 token 与色值对应关系见 `frontend/src/index.css`：

| 用途 | 色值 | 写法 |
|------|------|------|
| 主色（链接、选中态、状态） | `#3370ff` | `text-[#3370ff]` / `bg-[#3370ff]` / `bg-primary` |
| 页面背景 | `#f7f8fa` | `bg-background` |
| 卡片/表格容器 | `#ffffff` | `bg-white` |
| 文字主色 | `#1f2329` / `#2b2f36` | `text-[#2b2f36]` |
| 文字次色 | `#4e535a` / `#646a73` | `text-[#4e535a]` |
| 文字辅助/表头/空态 | `#8f959e` | `text-[#8f959e]` / `text-muted-foreground` |
| 分隔线 | `#e8e8e8` / `#f0f0f0` | `border-[#f0f0f0]` |
| 输入框边框 | `#dee0e3` / `#ebecee` | `border-input` |
| 错误/过期 | `#f54a45` / `#c4506a` | `text-[#c4506a]` / `text-destructive` |
| 成功 | `#34c724` | — |
| 悬浮高亮 | `#f7f8fa`（行）、`#f5f6f7`（按钮/选项） | `hover:bg-[#f7f8fa]` |

## 表格规范

基类 `src/components/ui/table.tsx` 已实现：表头背景 `#f7f8fa`、表头行高 42px、数据行高 52px、行间 `border-b border-[#f0f0f0]`、行 hover `#f7f8fa`、单元格 `text-[13px] whitespace-nowrap`。直接组合使用，不要覆写这些默认值。

- 表头行加 `className="hover:bg-transparent"`；首列 `pl-4`、末列 `pr-4`。
- **操作列悬浮才显示**：`TableRow` 加 `group`，操作按钮容器用 `opacity-0 group-hover:opacity-100 transition-opacity`；按钮用 ghost 图标按钮 `h-7 w-7 p-0` + lucide 图标 `h-3.5 w-3.5`，删除图标 `text-destructive`。
- 数字/金额列 `text-right`；金额加 `¥` 前缀并 `.toLocaleString()` 千分位；数字列加 `tabular-nums` 等宽（准则要求，多数旧页面漏了，新代码必须加）。
- 状态用纯文字 + 颜色（`生效中 text-[#3370ff]`、`已过期 text-[#c4506a]`、`未开始 text-[#8f959e]`），不用花哨标签。
- 加载/空态统一：`<div className="py-16 text-center text-sm text-muted-foreground">暂无xx</div>`。
- 分页统一用 `PaginationBar` + `useServerPagination`（PAGE_SIZE 20）。
- 头像不用彩色色块：灰色圆形 + 首字母即可。

## Tab 切换规范

容器 `flex items-center border-b border-[#e8e8e8] -mx-6 px-6 min-h-[39px]`；选项 `relative px-1 pb-2 text-[14px]`。
- 选中：`text-[#3370ff]` + 绝对定位下划线 `<span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />`。
- 未选中：`text-[#2b2f36] hover:text-[#4e535a]`。

## 按钮规范

- 主按钮：`<Button size="sm" className="h-8 text-xs">`（`bg-primary` = `#3370ff` + 白字），带图标用 lucide `h-3.5 w-3.5 mr-1`。
- 次按钮：白底 + 边框，手写按钮惯用 `h-8 px-4 rounded-[4px] border border-input text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]`。
- 文字按钮：无边框 `#3370ff` 文字。
- 控件高度统一 32px（`h-8`），工具条按钮可用 `h-7`。

## 输入框与表单规范

- 基类 `ui/input.tsx`：`h-8`、`text-[12px]`、`border-input`、聚焦 `border-[#3370ff]`、placeholder `#c0c4cc`、默认圆角 4px（`rounded` prop 可覆盖）。
- 高度 32px、边框 `#dee0e3`、圆角 4px、聚焦边框变 `#3370ff`——不要偏离。
- **昵称搜索必须用 `CustomerSearchInput`**（支持单选/多选/position 过滤/排除），禁止自造搜索下拉。
- 弹窗表单模式：`DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0"`，标题 `text-[14px] font-normal`，标签列 `text-[12px] text-[#4e535a] w-16 text-right`。
- **弹窗内含搜索输入框时，`DialogContent` 必须加 `initialFocus={false}`**（CLAUDE.md 约定）。
- 日期筛选用双 `input[type="date"]` 共用一个 `h-8 rounded-[4px] border border-input` 容器，`~` 分隔，空值配 `date-empty` class 置灰图标。

## 禁忌清单（发现即改）

- ❌ 渐变色（任何 `gradient`）
- ❌ 大阴影（`shadow-lg` 及以上；下拉浮层除外）
- ❌ emoji 装饰（图标统一 lucide-react）
- ❌ 表格行彩色背景
- ❌ 彩色头像色块
- ❌ 花哨来源标签（纯文字 + 小圆点即可）
- ❌ 大圆角（>6px）、pill 形主按钮
- ❌ font-semibold / font-bold（只用 400/500）
- ❌ 暗色主题代码（`dark:` 变体）
- ❌ 自造昵称搜索框、自造分页器

## 交付前 UI 自检清单

逐项确认后再交付：

1. 字重只出现 `font-normal` / `font-medium`（或不写默认 400）？
2. 字号只用了 5 级层次里的值（12/13/14/18px），没有随手发明的字号？
3. 颜色全部来自上方色系表，没有新造色值？
4. 圆角 ≤ 4px（基类组件除外），无大阴影、无渐变、无 emoji？
5. 表格行高 52px、首列 `pl-4` 末列 `pr-4`、操作列悬浮显示？
6. 金额列右对齐 + `¥` + 千分位 + `tabular-nums`？
7. 空数据有空态文案（`py-16 text-center text-sm text-muted-foreground`），空值用浅灰 `-`？
8. 昵称搜索用了 `CustomerSearchInput`？弹窗含搜索时加了 `initialFocus={false}`？
9. 列表页接了 `PaginationBar` + `useServerPagination`？
10. 视觉上够「空」吗？——能删的装饰都删了（克制优先）？

## 参考片段

真实代码惯用写法（页面骨架、表格+悬浮操作列、Tab 栏、日期筛选、弹窗表单、状态文字）见 `references/patterns.md`。写新页面/新表格前先读它，照抄结构而不是另起炉灶。
