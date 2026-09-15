---
name: wyyard-ui-design
description: wyyard frontend/ 界面开发与样式调整，统一表格、表单、弹窗和交互；不适用于小程序或纯业务逻辑修改。
---

# 管理后台 UI

任务边界见根目录 AGENTS.md；视觉数值见 UI-DESIGN-GUIDELINES.md。用户设计稿或指定参考页面优先。

## 组件与交互

- 先看目标组件和相邻页面，复用基类；共享组件变更需检查直接调用方。
- 请求走 src/lib/api.ts；昵称/姓名搜索用 CustomerSearchInput，含搜索框的 DialogContent 设置 initialFocus={false}。
- 表格用 ui/table.tsx，分页优先 PaginationBar/useServerPagination，保留实际 pageSize；单页排序不能冒充全量排序。
- 日期筛选复用现有组件，按天/月/年选择粒度。多行内容允许增高，用户指定顶对齐时不强制居中。
- 异步切换保持容器和滚动稳定，避免旧响应覆盖新结果或提前 return 清空已加载页面。
- 保留既有展开/缩略、常显操作及归属文字。悬浮操作同步支持 focus-within 和触控，图标按钮有可读名称。
- 空字段用浅灰短横线；区分空列表、加载中、无权限和请求失败。

## 核对与参考

检查本次区域的可读性、对齐、截断、溢出、选择态及错误态；能访问时核对实际页面或截图，不能时说明未做运行时视觉检查。代码验证使用 wyyard-verify。

需要复用布局结构时参考 [patterns.md](references/patterns.md)，示例不是固定模板。
