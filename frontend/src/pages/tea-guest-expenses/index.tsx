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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useServerPagination } from "@/hooks/use-server-pagination"
import {
  teaGuestExpenseApi,
  type TeaGuestExpense,
  type TeaGuestExpenseInput,
  type TeaGuestExpenseType,
} from "@/lib/api"

const PAGE_SIZE = 20

type ExpenseForm = Omit<TeaGuestExpenseInput, "amount"> & { amount: string }

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

function EmptyDash() {
  return <span className="inline-block h-[2px] w-[10px] rounded-full bg-[#e5e8eb] align-middle" />
}

export default function TeaGuestExpensesPage() {
  const [activeCategory, setActiveCategory] = useState<"" | "management" | "operation">("")
  const activeCategoryRef = useRef<"" | "management" | "operation">("")
  const [expenseTypes, setExpenseTypes] = useState<TeaGuestExpenseType[]>([])
  const [typeDialogOpen, setTypeDialogOpen] = useState(false)
  const [newTypeCategory, setNewTypeCategory] = useState<"management" | "operation">("management")
  const [newTypeName, setNewTypeName] = useState("")
  const [newTypeRequiresPlatform, setNewTypeRequiresPlatform] = useState(false)
  const [typeError, setTypeError] = useState("")
  const [updatingTypeId, setUpdatingTypeId] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TeaGuestExpense | null>(null)
  const [form, setForm] = useState<ExpenseForm>(emptyForm)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TeaGuestExpense | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const dateFiltersRef = useRef({ dateFrom: "", dateTo: "" })

  const fetchExpenses = useCallback((page: number, pageSize: number) => {
    const filters = dateFiltersRef.current
    return teaGuestExpenseApi.listPaginated(page, pageSize, {
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
  } = useServerPagination<TeaGuestExpense>(fetchExpenses, { pageSize: PAGE_SIZE })

  const loadTypes = () => teaGuestExpenseApi.listTypes().then(setExpenseTypes).catch(() => {})
  useEffect(() => { loadTypes() }, [])

  const selectedType = expenseTypes.find(
    item => item.cost_category === form.cost_category && item.name === form.expense_type,
  )
  const needsPlatform = selectedType?.requires_platform || false

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

  const openEdit = (item: TeaGuestExpense) => {
    setEditingItem(item)
    setForm({
      cost_category: item.cost_category,
      expense_type: item.expense_type,
      expense_time: item.expense_time,
      purchase_content: item.purchase_content,
      amount: String(item.amount),
      platform: item.platform || "",
      notes: item.notes || "",
    })
    setFormError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const amount = Number(form.amount)
    if (!form.cost_category || !form.expense_type) {
      setFormError("请选择成本分类和支出类型")
      return
    }
    if (!form.expense_time) {
      setFormError("请选择支出时间")
      return
    }
    if (!form.purchase_content.trim()) {
      setFormError("请输入支出项")
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("请输入大于 0 的金额")
      return
    }
    if (needsPlatform && !form.platform.trim()) {
      setFormError("请输入平台")
      return
    }

    const payload: TeaGuestExpenseInput = {
      cost_category: form.cost_category,
      expense_type: form.expense_type,
      expense_time: form.expense_time,
      purchase_content: form.purchase_content.trim(),
      amount,
      platform: needsPlatform ? form.platform.trim() : "",
      notes: form.notes.trim(),
    }

    setSaving(true)
    setFormError("")
    try {
      if (editingItem) {
        await teaGuestExpenseApi.update(editingItem.id, payload)
        refresh()
      } else {
        await teaGuestExpenseApi.create(payload)
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
      await teaGuestExpenseApi.delete(deleteTarget.id)
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
    if (!newTypeName.trim()) {
      setTypeError("请输入类型名称")
      return
    }
    try {
      await teaGuestExpenseApi.createType({
        cost_category: newTypeCategory,
        name: newTypeName.trim(),
        requires_platform: newTypeRequiresPlatform,
      })
      setNewTypeName("")
      setNewTypeRequiresPlatform(false)
      setTypeError("")
      loadTypes()
    } catch (error) {
      setTypeError(error instanceof Error ? error.message : "新增失败")
    }
  }

  const updateTypeRequirements = async (item: TeaGuestExpenseType, checked: boolean) => {
    setUpdatingTypeId(item.id)
    setTypeError("")
    try {
      const updated = await teaGuestExpenseApi.updateType(item.id, { requires_platform: checked })
      setExpenseTypes(current => current.map(type => type.id === updated.id ? updated : type))
    } catch (error) {
      setTypeError(error instanceof Error ? error.message : "设置保存失败")
    } finally {
      setUpdatingTypeId("")
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f4f5f6] p-4">
      <div className="flex h-[52px] shrink-0 items-center rounded-[4px] bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <span className="whitespace-nowrap text-[18px] font-medium text-[#212631]">支出</span>
        <span className="ml-3 whitespace-nowrap text-[12px] text-[#8f959e]">茶客业务独立支出记录</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex h-[52px] shrink-0 items-center gap-6 border-b border-[#f0f0f0] px-5">
          {([["", "全部"], ["management", "管理成本"], ["operation", "运营成本"]] as const).map(([value, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => switchCategory(value)}
              className={`relative px-1 text-[14px] transition-colors ${activeCategory === value ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
            >
              {label}
              {activeCategory === value && <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="flex h-8 items-center overflow-hidden rounded-[4px] border border-[#e1e4e7] bg-white">
            <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => handleDateFilter("from", event.target.value)} className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`} />
            <span className="px-1 text-[12px] text-[#8f959e]">~</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => handleDateFilter("to", event.target.value)} className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "date-empty text-[#8f959e]"}`} />
          </div>
          <button type="button" onClick={clearDateFilter} className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            <X className="h-3.5 w-3.5" />清空
          </button>
          <div className="flex-1" />
          <button type="button" className="flex h-8 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]" onClick={() => setTypeDialogOpen(true)}>
            <Settings className="h-3.5 w-3.5" />支出类型设置
          </button>
          <Button size="sm" className="h-8 text-[12px]" onClick={openCreate}>
            <ReceiptText className="mr-1 h-3.5 w-3.5" />新增支出
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div>
        ) : totalItems === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无支出记录</span></div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <Table style={{ tableLayout: "fixed" }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4" style={{ width: "170px" }}>支出时间</TableHead>
                  <TableHead style={{ width: "110px" }}>成本分类</TableHead>
                  <TableHead style={{ width: "130px" }}>支出类型</TableHead>
                  <TableHead style={{ width: "200px" }}>支出项</TableHead>
                  <TableHead className="text-right" style={{ width: "130px" }}>金额</TableHead>
                  <TableHead style={{ width: "120px" }}>平台</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead style={{ width: "100px" }}>创建人</TableHead>
                  <TableHead className="pr-4 text-right" style={{ width: "88px" }}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map(item => (
                  <TableRow key={item.id} className="group hover:bg-[#f7f8fa]">
                    <TableCell className="pl-4 text-[12px] tabular-nums text-[#2b2f36]">{formatExpenseTime(item.expense_time)}</TableCell>
                    <TableCell className="text-[13px] text-[#4e535a]">{item.cost_category === "management" ? "管理成本" : "运营成本"}</TableCell>
                    <TableCell><span className="block truncate text-[13px] text-[#4e535a]" title={item.expense_type}>{item.expense_type}</span></TableCell>
                    <TableCell><span className="block truncate text-[13px] text-[#2b2f36]" title={item.purchase_content}>{item.purchase_content}</span></TableCell>
                    <TableCell className="text-right text-[13px] font-medium tabular-nums text-[#212631]">¥{item.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{item.platform ? <span className="block truncate text-[13px] text-[#4e535a]" title={item.platform}>{item.platform}</span> : <EmptyDash />}</TableCell>
                    <TableCell>{item.notes ? <span className="block truncate text-[12px] text-[#8f959e]" title={item.notes}>{item.notes}</span> : <EmptyDash />}</TableCell>
                    <TableCell className="text-[12px] text-[#8f959e]">{item.created_by || <EmptyDash />}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)} aria-label="编辑支出"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)} aria-label="删除支出"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={goToPage} />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[400px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-6 pb-4 pt-5"><DialogTitle className="text-[14px] font-normal">{editingItem ? "编辑支出" : "新增支出"}</DialogTitle></DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">成本分类</span><select value={form.cost_category} onChange={event => setForm({ ...form, cost_category: event.target.value as "management" | "operation", expense_type: "", platform: "" })} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="management">管理成本</option><option value="operation">运营成本</option></select></label>
            <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">支出类型</span><select value={form.expense_type} onChange={event => { const nextType = expenseTypes.find(item => item.cost_category === form.cost_category && item.name === event.target.value); setForm({ ...form, expense_type: event.target.value, platform: nextType?.requires_platform ? form.platform : "" }) }} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="">请选择</option>{expenseTypes.filter(item => item.cost_category === form.cost_category).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>
            <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">支出时间</span><Input type="datetime-local" value={form.expense_time} onChange={event => setForm({ ...form, expense_time: event.target.value })} className="h-8 text-[12px]" /></label>
            <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">支出项</span><Input value={form.purchase_content} onChange={event => setForm({ ...form, purchase_content: event.target.value })} placeholder="请输入具体支出项" maxLength={200} className="h-8 text-[12px]" /></label>
            <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">金额</span><div className="relative"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#8f959e]">¥</span><Input type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="0.00" className="h-8 pl-6 text-[12px] tabular-nums" /></div></label>
            {needsPlatform && <label className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">平台</span><Input value={form.platform} onChange={event => setForm({ ...form, platform: event.target.value })} placeholder="请输入平台" maxLength={100} className="h-8 text-[12px]" /></label>}
            <label className="grid grid-cols-[70px_1fr] items-start gap-2"><span className="pt-2 text-right text-[12px] text-[#4e535a]">备注</span><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="可填写用途、经办说明等" maxLength={2000} className="min-h-[84px] resize-none text-[12px]" /></label>
            {formError && <p className="pl-[78px] text-[12px] text-[#c4506a]">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-[#f0f0f0] pt-4"><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button><Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="w-[540px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-6 pb-4 pt-5"><DialogTitle className="text-[14px] font-normal">支出类型设置</DialogTitle></DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-3 rounded-[4px] border border-[#e8e8e8] bg-[#fafafa] p-3">
              <div className="grid grid-cols-[72px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#8f959e]">成本归属</span><div className="flex h-8 items-center gap-7 px-1 text-[12px] text-[#2b2f36]">{(["management", "operation"] as const).map(category => <label key={category} className="flex cursor-pointer items-center gap-2"><input type="radio" name="tea-expense-category" checked={newTypeCategory === category} onChange={() => setNewTypeCategory(category)} className="h-3.5 w-3.5 accent-[#3370ff]" />{category === "management" ? "管理成本" : "运营成本"}</label>)}</div></div>
              <div className="grid grid-cols-[72px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#8f959e]">类型名称</span><Input value={newTypeName} onChange={event => setNewTypeName(event.target.value)} placeholder="请输入支出类型名称" className="bg-white" /></div>
              <div className="grid grid-cols-[72px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#8f959e]">录入字段</span><label className="flex h-8 cursor-pointer items-center gap-2 px-1 text-[12px] text-[#4e535a]"><input type="checkbox" checked={newTypeRequiresPlatform} onChange={event => setNewTypeRequiresPlatform(event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />填写平台</label></div>
              <div className="flex items-center justify-between border-t border-[#e8e8e8] pt-3"><p className="text-[12px] text-[#8f959e]">支出项、支出时间、金额和备注为固定字段</p><Button size="sm" className="h-8 px-4 text-[12px]" onClick={createType}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button></div>
            </div>
            {typeError && <p className="text-[12px] text-[#c4506a]">{typeError}</p>}
            <div className="max-h-[320px] overflow-y-auto border-t border-[#f0f0f0]">
              <div className="grid h-8 grid-cols-[96px_minmax(0,1fr)_100px_28px] items-center border-b border-[#f0f0f0] text-[12px] text-[#8f959e]"><span className="px-2">成本归属</span><span>支出类型</span><span>录入字段</span><span /></div>
              {(["management", "operation"] as const).map(category => expenseTypes.filter(item => item.cost_category === category).map(item => (
                <div key={item.id} className="group grid min-h-10 grid-cols-[96px_minmax(0,1fr)_100px_28px] items-center border-b border-[#f0f0f0] text-[13px] text-[#2b2f36] hover:bg-[#f7f8fa]">
                  <span className="px-2 text-[12px] text-[#8f959e]">{category === "management" ? "管理成本" : "运营成本"}</span>
                  <span className="truncate pr-3" title={item.name}>{item.name}</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]"><input type="checkbox" checked={item.requires_platform} disabled={updatingTypeId === item.id} onChange={event => updateTypeRequirements(item, event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />平台</label>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100" onClick={async () => { try { await teaGuestExpenseApi.deleteType(item.id); loadTypes() } catch (error) { setTypeError(error instanceof Error ? error.message : "删除失败") } }} aria-label={`删除${item.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              )))}
              {expenseTypes.length === 0 && <div className="py-8 text-center text-[12px] text-[#8f959e]">暂无支出类型</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除支出记录</AlertDialogTitle><AlertDialogDescription>确定删除支出项“{deleteTarget?.purchase_content}”吗？删除后列表中将不再显示。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel><AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
