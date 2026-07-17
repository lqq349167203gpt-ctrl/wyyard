# wyyard 前端惯用写法片段

全部摘自真实代码，写新页面时照抄结构。出处已标注，可去原文件看完整上下文。

## 页面骨架（无标题列表页）

出处：`src/pages/consumption-records/index.tsx`

```tsx
<div className={embedded ? "space-y-3" : "px-6 pt-4 pb-6 space-y-3"}>
  {/* Tab / 搜索栏 / 表格 / 分页 */}
</div>
```

带标题的页面用 `px-6 pt-12 pb-6`，标题块（出处 `src/pages/accounts/index.tsx`）：

```tsx
<div className="flex items-center justify-between pb-2">
  <div>
    <h1 className="text-lg font-semibold">账号管理</h1>
    <p className="text-xs text-muted-foreground mt-1.5">一句话说明</p>
  </div>
  <Button size="sm" className="h-8 text-xs" onClick={...}>
    <Plus className="h-3.5 w-3.5 mr-1" /> 新增账号
  </Button>
</div>
```

> 注：旧代码标题用了 `font-semibold`，新代码按准则改为 `font-medium`。

## Tab 切换栏

出处：`src/pages/consumption-records/index.tsx`

```tsx
<div className="flex items-center border-b border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
  <div className="flex items-center gap-6">
    <button
      className={`relative px-1 pb-2 text-[14px] transition-colors ${
        activeTab === "payment" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
      }`}
      onClick={() => switchTab("payment")}
    >
      付费记录
      {activeTab === "payment" && (
        <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
      )}
    </button>
  </div>
</div>
```

## 表格 + 悬浮操作列

出处：`src/pages/accounts/index.tsx`。表头行 `hover:bg-transparent`，首列 `pl-4` 末列 `pr-4`，行加 `group`：

```tsx
<Table>
  <TableHeader>
    <TableRow className="hover:bg-transparent">
      <TableHead className="pl-4">归属人</TableHead>
      <TableHead>创建日期</TableHead>
      <TableHead className="text-right pr-4">操作</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {accounts.map((a) => (
      <TableRow key={a.id} className="group">
        <TableCell className="pl-4">
          <span className="text-[13px] text-[#2b2f36]">{a.owner}</span>
        </TableCell>
        <TableCell>
          <span className="text-[12px] text-[#8f959e]">
            {new Date(a.created_at).toLocaleDateString("zh-CN")}
          </span>
        </TableCell>
        <TableCell className="text-right pr-4">
          <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(a)}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(a.id)}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    ))}
  </TableBody>
</Table>
```

空态 / 加载态（两态同款，只是文案不同）：

```tsx
if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
if (records.length === 0) return <div className="py-16 text-center text-sm text-muted-foreground">暂无记录</div>
```

## 金额与状态列

出处：`src/pages/consumption-records/index.tsx`、`src/pages/payment/unified-payment.tsx`

```tsx
// 金额：右对齐 + ¥ + 千分位（新代码补 tabular-nums）
<TableCell className="text-right text-[#2b2f36] tabular-nums">¥{item.price.toLocaleString()}</TableCell>

// 日期等辅助列
<TableCell className="text-[#8f959e]">{r.date || "-"}</TableCell>

// 状态：纯文字 + 颜色，不用标签
if (已过期) return <span className="text-[#c4506a]">已过期</span>
if (生效中) return <span className="text-[#3370ff]">生效中</span>
return <span className="text-[#8f959e]">未开始</span>
```

## 日期范围筛选 + 清空按钮

出处：`src/pages/consumption-records/index.tsx`

```tsx
<div className="flex items-end gap-3 flex-wrap mt-5">
  <div className="flex items-center h-8 rounded-[4px] border border-input overflow-hidden">
    <input type="date" value={dateFrom} onChange={...}
      className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!dateFrom ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`} />
    <span className="text-[12px] text-[#8f959e] px-1">~</span>
    <input type="date" value={dateTo} onChange={...}
      className={`h-full px-2 text-[12px] border-none outline-none bg-transparent ${!dateTo ? "text-[#8f959e] date-empty" : "text-[#2b2f36]"}`} />
  </div>
  <button onClick={handleClear}
    className="h-8 px-4 rounded-[4px] border border-input text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1">
    <X className="h-3.5 w-3.5" /> 清空
  </button>
</div>
```

## 弹窗表单

出处：`src/pages/accounts/index.tsx`。注意 `initialFocus={false}`（弹窗含搜索框时必加）：

```tsx
<Dialog open={showForm} onOpenChange={...}>
  <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
    <DialogHeader className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
      <DialogTitle className="text-[14px] font-normal">新增账号</DialogTitle>
    </DialogHeader>
    <div className="px-5 py-4 space-y-4">
      <div className="flex items-start gap-3">
        <span className="text-[12px] text-[#4e535a] text-right w-16 shrink-0 pt-2">归属人</span>
        <div className="relative flex-1">
          <CustomerSearchInput customers={customerList} value={form.owner}
            onChange={(val) => setForm({ ...form, owner: val as string })}
            placeholder="输入昵称搜索..." />
          {formErrors.owner && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.owner}</p>}
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>
```

## 分页

出处：`src/pages/consumption-records/index.tsx`。PAGE_SIZE 20，配合 `useServerPagination`：

```tsx
<PaginationBar
  currentPage={current.currentPage}
  totalPages={current.totalPages}
  totalItems={current.totalItems}
  startIndex={current.startIndex}
  endIndex={current.endIndex}
  onPageChange={current.goToPage}
/>
```

## 搜索下拉项写法

出处：`src/components/customer-search-input.tsx`。下拉浮层是「白底 + 1px `#e8eaed` 边框 + shadow-lg + 4px 圆角」，选项 `px-3 py-2 text-[12px] text-[#2b2f36] hover:bg-[#f7f8fa]`，右侧辅助标签 `text-[10px] text-[#8f959e] ml-auto`，警示红 `text-[#e02020]`，「新增」入口 `text-[#3370ff] hover:bg-[#f0f5ff]`。自造浮层时对齐这套样式。
