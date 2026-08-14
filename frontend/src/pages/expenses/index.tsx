import { useCallback, useEffect, useRef, useState } from "react"
import { Inbox, Pencil, Plus, ReceiptText, Settings, Trash2, X } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { expenseApi } from "@/lib/api"
import type { Expense, ExpenseInput, ExpenseType } from "@/lib/api"

const PAGE_SIZE = 20

type ExpenseForm = Omit<ExpenseInput, "amount"> & { amount: string }

function currentLocalMinute() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function emptyForm(): ExpenseForm {
  return {
    cost_category: "management",
    expense_type: "",
    expense_time: currentLocalMinute(),
    purchase_content: "",
    amount: "",
    platform: "",
    notes: "",
  }
}

function formatExpenseTime(value: string) {
  return value ? value.replace("T", " ") : "-"
}

export default function ExpensesPage() {
  const [activeCategory, setActiveCategory] = useState<"" | "management" | "operation">("")
  const activeCategoryRef = useRef<"" | "management" | "operation">("")
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([])
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [newTypeCategory, setNewTypeCategory] = useState<"management" | "operation">("management")
  const [newTypeName, setNewTypeName] = useState("")
  const [typeError, setTypeError] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<Expense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const dateFiltersRef = useRef({ dateFrom: "", dateTo: "" })

  const fetchExpenses = useCallback((page: number, pageSize: number) => {
    const filters = dateFiltersRef.current
    return expenseApi.listPaginated(page, pageSize, {
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      cost_category: activeCategoryRef.current || undefined,
    })
  }, [])

  const {
    paginatedItems,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
    loading,
    refresh,
  } = useServerPagination<Expense>(fetchExpenses, { pageSize: PAGE_SIZE })

  const loadTypes = () => expenseApi.listTypes().then(setExpenseTypes).catch(() => {})
  useEffect(() => { loadTypes() }, [])

  const switchCategory = (category: "" | "management" | "operation") => {
    setActiveCategory(category)
    activeCategoryRef.current = category
    goToPage(1)
  }

  const handleDateFilter = (field: "from" | "to", value: string) => {
    if (field === "from") {
      setDateFrom(value)
      dateFiltersRef.current.dateFrom = value
    } else {
      setDateTo(value)
      dateFiltersRef.current.dateTo = value
    }
    goToPage(1)
  }

  const clearDateFilter = () => {
    setDateFrom("")
    setDateTo("")
    dateFiltersRef.current = { dateFrom: "", dateTo: "" }
    goToPage(1)
  }

  const openCreate = () => {
    setEditingItem(null)
    setForm(emptyForm())
    setFormError("")
    setDialogOpen(true)
  }

  const openEdit = (item: Expense) => {
    setEditingItem(item)
    setForm({
      expense_time: item.expense_time,
      cost_category: item.cost_category === "operation" ? "operation" : "management",
      expense_type: item.expense_type,
      purchase_content: item.purchase_content,
      amount: String(item.amount),
      platform: item.platform,
      notes: item.notes || "",
    })
    setFormError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const amount = Number(form.amount)
    if (!form.expense_time) {
      setFormError("请选择支出时间")
      return
    }
    if (!form.purchase_content.trim()) {
      setFormError("请输入购买内容")
      return
    }
    if (!form.cost_category || !form.expense_type) {
      setFormError("请选择成本分类和支出类型")
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("请输入大于 0 的金额")
      return
    }
    if (!form.platform.trim()) {
      setFormError("请输入购买平台")
      return
    }

    const payload: ExpenseInput = {
      expense_time: form.expense_time,
      cost_category: form.cost_category,
      expense_type: form.expense_type,
      purchase_content: form.purchase_content.trim(),
      amount,
      platform: form.platform.trim(),
      notes: form.notes.trim(),
    }

    setSaving(true)
    setFormError("")
    try {
      if (editingItem) {
        await expenseApi.update(editingItem.id, payload)
        refresh()
      } else {
        await expenseApi.create(payload)
        goToPage(1)
      }
      setDialogOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "保存失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await expenseApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      if (paginatedItems.length === 1 && currentPage > 1) {
        goToPage(currentPage - 1)
      } else {
        refresh()
      }
    } finally {
      setDeleting(false)
    }
  }

  const createType = async () => {
    if (!newTypeName.trim()) { setTypeError("请输入类型名称"); return }
    try {
      await expenseApi.createType({ cost_category: newTypeCategory, name: newTypeName.trim() })
      setNewTypeName(""); setTypeError(""); loadTypes()
    } catch (error) { setTypeError(error instanceof Error ? error.message : "新增失败") }
  }

  return (
    <div className="dv-root flex h-full flex-col gap-3 bg-[#f4f5f6] p-4">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>

      <div className="flex h-[52px] flex-wrap items-center gap-2 rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <span className="whitespace-nowrap text-[15px] font-medium text-[#212631]">支出项</span>
        <span className="ml-2.5 whitespace-nowrap text-[11.5px] text-[#a8b1bd]">分别归集管理成本与运营成本</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex h-[52px] shrink-0 items-center gap-6 border-b border-[#f0f0f0] px-5">
          {[["", "全部"], ["management", "管理成本"], ["operation", "运营成本"]].map(([value, label]) => <button key={label} onClick={() => switchCategory(value as "" | "management" | "operation")} className={`relative px-1 text-[14px] transition-colors ${activeCategory === value ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}>{label}{activeCategory === value && <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}</button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="flex h-8 items-center overflow-hidden rounded-[7px] border border-[#e1e4e7] bg-white">
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(event) => handleDateFilter("from", event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`}
            />
            <span className="px-1 text-[12px] text-[#8f959e]">~</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(event) => handleDateFilter("to", event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`}
            />
          </div>
          <button
            onClick={clearDateFilter}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />清空
          </button>
          <div className="flex-1" />
          <button className="flex h-8 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]" onClick={() => setTypeDialogOpen(true)}><Settings className="h-3.5 w-3.5" />支出类型设置</button>
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={openCreate}>
            <ReceiptText className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" />新增支出
          </Button>
        </div>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">加载中...</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">暂无数据</span>
          </div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "160px" }}>支出时间</TableHead>
                <TableHead style={{ width: "100px" }}>成本分类</TableHead>
                <TableHead style={{ width: "120px" }}>支出类型</TableHead>
                <TableHead style={{ width: "240px" }}>购买内容</TableHead>
                <TableHead style={{ width: "120px" }}>金额</TableHead>
                <TableHead style={{ width: "140px" }}>平台</TableHead>
                <TableHead>备注</TableHead>
                <TableHead style={{ width: "80px" }}>创建人</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "88px" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => (
                <TableRow key={item.id} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4 text-[12px] text-[#2b2f36] tabular-nums">
                    {formatExpenseTime(item.expense_time)}
                  </TableCell>
                  <TableCell>{item.cost_category === "management" ? "管理成本" : item.cost_category === "operation" ? "运营成本" : <span className="text-[#d0d3d6]">待分类</span>}</TableCell>
                  <TableCell>{item.expense_type || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                  <TableCell>
                    <span className="block truncate text-[12px] text-[#2b2f36]" title={item.purchase_content}>{item.purchase_content}</span>
                  </TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#c4506a]">
                    ¥{item.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#4e535a]">{item.platform}</span>
                  </TableCell>
                  <TableCell>
                    {item.notes ? (
                      <span className="block truncate text-[12px] text-[#a8b1bd]" title={item.notes}>{item.notes}</span>
                    ) : (
                      <span className="text-[#d0d3d6]">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-[#a8b1bd]">
                    {item.created_by || <span className="inline-block h-[2px] w-[4px] rounded-full bg-[#e5e8eb] align-middle" />}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-0.5">
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)} aria-label="编辑支出">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)} aria-label="删除支出">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[14px] font-normal">{editingItem ? "编辑支出" : "新增支出"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-[12px] text-[#4e535a] text-right tracking-widest">成本分类</span><select value={form.cost_category} onChange={event => setForm({ ...form, cost_category: event.target.value as "management" | "operation", expense_type: "" })} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="management">管理成本</option><option value="operation">运营成本</option></select></div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-[12px] text-[#4e535a] text-right tracking-widest">支出类型</span><select value={form.expense_type} onChange={event => setForm({ ...form, expense_type: event.target.value })} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="">请选择</option>{expenseTypes.filter(item => item.cost_category === form.cost_category).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">支出时间</span>
              <Input
                type="datetime-local"
                value={form.expense_time}
                onChange={(event) => setForm({ ...form, expense_time: event.target.value })}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">购买内容</span>
              <Input
                value={form.purchase_content}
                onChange={(event) => setForm({ ...form, purchase_content: event.target.value })}
                placeholder="例如：采购茶具"
                maxLength={200}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">金额</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#8f959e]">¥</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="0.00"
                  className="h-8 pl-6 text-xs tabular-nums"
                />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">平台</span>
              <Input
                value={form.platform}
                onChange={(event) => setForm({ ...form, platform: event.target.value })}
                placeholder="例如：淘宝、京东、线下"
                maxLength={100}
                className="h-8 text-xs"
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="pt-2 text-[12px] text-[#4e535a] text-right tracking-widest">备注</span>
              <Textarea
                value={form.notes}
                onChange={(event) => setForm({ ...form, notes: event.target.value })}
                placeholder="可填写用途、经办说明等"
                maxLength={2000}
                className="min-h-[84px] resize-none text-[12px]"
              />
            </div>
            {formError && <p className="pl-[78px] text-[12px] text-[#c4506a]">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}><DialogContent className="w-[460px] max-w-[90vw] gap-0 p-0"><DialogHeader className="border-b border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">支出类型设置</DialogTitle></DialogHeader><div className="space-y-4 px-6 py-5"><div className="flex gap-2"><select value={newTypeCategory} onChange={event => setNewTypeCategory(event.target.value as "management" | "operation")} className="h-8 w-[110px] rounded-[4px] border border-input px-2 text-[12px]"><option value="management">管理成本</option><option value="operation">运营成本</option></select><Input value={newTypeName} onChange={event => setNewTypeName(event.target.value)} placeholder="输入支出类型" className="flex-1" /><Button size="sm" className="h-8 text-xs" onClick={createType}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button></div>{typeError && <p className="text-[12px] text-[#c4506a]">{typeError}</p>}<div className="max-h-[320px] overflow-y-auto border-t border-[#f0f0f0] pt-2">{(["management", "operation"] as const).map(category => <div key={category} className="mb-3"><div className="mb-1 text-[12px] text-[#8f959e]">{category === "management" ? "管理成本" : "运营成本"}</div>{expenseTypes.filter(item => item.cost_category === category).length === 0 ? <div className="py-3 text-[12px] text-[#d0d3d6]">暂无类型</div> : expenseTypes.filter(item => item.cost_category === category).map(item => <div key={item.id} className="group flex h-9 items-center justify-between border-b border-[#f0f0f0] text-[13px] text-[#2b2f36]"><span>{item.name}</span><Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100" onClick={async () => { try { await expenseApi.deleteType(item.id); loadTypes() } catch (error) { setTypeError(error instanceof Error ? error.message : "删除失败") } }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div>)}</div>)}</div></div></DialogContent></Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除支出记录</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除“{deleteTarget?.purchase_content}”这条支出记录吗？删除后列表中将不再显示。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
