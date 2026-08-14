import { useCallback, useEffect, useRef, useState } from "react"
import { Inbox, Pencil, Plus, ReceiptText, Settings, Trash2, X } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"
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
import { customerApi, expenseApi } from "@/lib/api"
import type { CustomerLight, Expense, ExpenseInput, ExpenseType } from "@/lib/api"

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
    customer_id: "",
    customer_nickname: "",
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
  const [newTypeRequiresCustomer, setNewTypeRequiresCustomer] = useState(false)
  const [newTypeRequiresPlatform, setNewTypeRequiresPlatform] = useState(false)
  const [typeError, setTypeError] = useState("")
  const [updatingTypeId, setUpdatingTypeId] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
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
  useEffect(() => { customerApi.light().then(setCustomers).catch(() => setCustomers([])) }, [])

  const selectedType = expenseTypes.find(
    item => item.cost_category === form.cost_category && item.name === form.expense_type,
  )
  const needsCustomer = selectedType?.requires_customer || Boolean(!selectedType && form.customer_nickname)
  const needsPlatform = selectedType?.requires_platform || Boolean(!selectedType && form.platform)

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
      customer_id: item.customer_id || "",
      customer_nickname: item.customer_nickname || "",
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
      setFormError("请输入支出项")
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
    if (needsCustomer && !form.customer_id) {
      setFormError("请选择用户昵称")
      return
    }
    if (needsPlatform && !form.platform.trim()) {
      setFormError("请输入平台")
      return
    }

    const keepsExistingOptionalFields = editingItem?.cost_category === form.cost_category
      && editingItem.expense_type === form.expense_type
    const payload: ExpenseInput = {
      expense_time: form.expense_time,
      cost_category: form.cost_category,
      expense_type: form.expense_type,
      purchase_content: form.purchase_content.trim(),
      amount,
      customer_id: needsCustomer
        ? form.customer_id
        : keepsExistingOptionalFields ? editingItem.customer_id : "",
      customer_nickname: needsCustomer
        ? form.customer_nickname
        : keepsExistingOptionalFields ? editingItem.customer_nickname : "",
      platform: needsPlatform
        ? form.platform.trim()
        : keepsExistingOptionalFields ? editingItem.platform : "",
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
      await expenseApi.createType({
        cost_category: newTypeCategory,
        name: newTypeName.trim(),
        requires_customer: newTypeRequiresCustomer,
        requires_platform: newTypeRequiresPlatform,
      })
      setNewTypeName("")
      setNewTypeRequiresCustomer(false)
      setNewTypeRequiresPlatform(false)
      setTypeError("")
      loadTypes()
    } catch (error) { setTypeError(error instanceof Error ? error.message : "新增失败") }
  }

  const updateTypeRequirements = async (
    item: ExpenseType,
    field: "requires_customer" | "requires_platform",
    checked: boolean,
  ) => {
    setUpdatingTypeId(item.id)
    setTypeError("")
    try {
      const updated = await expenseApi.updateType(item.id, {
        requires_customer: field === "requires_customer" ? checked : item.requires_customer,
        requires_platform: field === "requires_platform" ? checked : item.requires_platform,
      })
      setExpenseTypes(current => current.map(type => type.id === updated.id ? updated : type))
    } catch (error) {
      setTypeError(error instanceof Error ? error.message : "设置保存失败")
    } finally {
      setUpdatingTypeId("")
    }
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
                <TableHead style={{ width: "180px" }}>支出项</TableHead>
                <TableHead style={{ width: "120px" }}>金额</TableHead>
                <TableHead style={{ width: "100px" }}>用户昵称</TableHead>
                <TableHead style={{ width: "110px" }}>平台</TableHead>
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
                    <span className="block truncate text-[13px] text-[#4e535a]" title={item.customer_nickname}>{item.customer_nickname || <span className="text-[#d0d3d6]">-</span>}</span>
                  </TableCell>
                  <TableCell>
                    <span className="block truncate text-[13px] text-[#4e535a]" title={item.platform}>{item.platform || <span className="text-[#d0d3d6]">-</span>}</span>
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
            <div className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">成本分类</span><select value={form.cost_category} onChange={event => setForm({ ...form, cost_category: event.target.value as "management" | "operation", expense_type: "", customer_id: "", customer_nickname: "", platform: "" })} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="management">管理成本</option><option value="operation">运营成本</option></select></div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2"><span className="text-right text-[12px] text-[#4e535a]">支出类型</span><select value={form.expense_type} onChange={event => { const nextType = expenseTypes.find(item => item.cost_category === form.cost_category && item.name === event.target.value); setForm({ ...form, expense_type: event.target.value, customer_id: nextType?.requires_customer ? form.customer_id : "", customer_nickname: nextType?.requires_customer ? form.customer_nickname : "", platform: nextType?.requires_platform ? form.platform : "" }) }} className="h-8 rounded-[4px] border border-input bg-white px-2 text-[12px] outline-none focus:border-[#3370ff]"><option value="">请选择</option>{expenseTypes.filter(item => item.cost_category === form.cost_category).map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></div>
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
              <span className="text-right text-[12px] text-[#4e535a]">支出项</span>
              <Input
                value={form.purchase_content}
                onChange={(event) => setForm({ ...form, purchase_content: event.target.value })}
                placeholder="请输入具体支出项"
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
            {needsCustomer && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-right text-[12px] text-[#4e535a]">用户昵称</span>
              <CustomerSearchInput
                customers={customers}
                value={form.customer_nickname}
                onChange={value => {
                  const nickname = typeof value === "string" ? value : value[0] || ""
                  const customer = customers.find(item => item.nickname === nickname)
                  setForm(current => ({ ...current, customer_id: customer?.id || "", customer_nickname: nickname }))
                }}
                onSelectItem={customer => setForm(current => ({ ...current, customer_id: customer.id, customer_nickname: customer.nickname }))}
                placeholder="输入昵称搜索"
                filterSelected={false}
              />
            </div>}
            {needsPlatform && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-right text-[12px] text-[#4e535a]">平台</span>
              <Input
                value={form.platform}
                onChange={(event) => setForm({ ...form, platform: event.target.value })}
                placeholder="例如：淘宝、京东、线下"
                maxLength={100}
                className="h-8 text-xs"
              />
            </div>}
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

      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent className="w-[560px] max-w-[90vw] gap-0 p-0">
          <DialogHeader className="border-b border-[#f0f0f0] px-6 pb-2 pt-3">
            <DialogTitle className="text-[14px] font-normal">支出类型设置</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="space-y-2">
              <div className="text-[12px] text-[#4e535a]">新增支出类型</div>
              <div className="space-y-3 rounded-[4px] border border-[#e8e8e8] bg-[#fafafa] p-3">
                <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                  <span className="text-right text-[12px] text-[#8f959e]">成本归属</span>
                  <div className="flex h-8 items-center gap-7 px-1 text-[12px] text-[#2b2f36]">
                    {(["management", "operation"] as const).map(category => <label key={category} className="flex cursor-pointer items-center gap-2"><input type="radio" name="expense-cost-category" value={category} checked={newTypeCategory === category} onChange={() => setNewTypeCategory(category)} className="h-3.5 w-3.5 accent-[#3370ff]" /><span>{category === "management" ? "管理成本" : "运营成本"}</span></label>)}
                  </div>
                </div>
                <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                  <span className="text-right text-[12px] text-[#8f959e]">类型名称</span>
                  <Input value={newTypeName} onChange={event => setNewTypeName(event.target.value)} placeholder="请输入支出类型名称" className="border-[#c9cdd4] bg-white hover:border-[#b8bdc5] focus-visible:border-[#3370ff]" />
                </div>
                <div className="grid grid-cols-[72px_1fr] items-center gap-3">
                  <span className="text-right text-[12px] text-[#8f959e]">录入字段</span>
                  <div className="flex h-8 items-center gap-6 px-1 text-[12px] text-[#4e535a]">
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={newTypeRequiresCustomer} onChange={event => setNewTypeRequiresCustomer(event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />填写用户昵称</label>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={newTypeRequiresPlatform} onChange={event => setNewTypeRequiresPlatform(event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />填写平台</label>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[#e8e8e8] pt-3">
                  <p className="text-[12px] text-[#8f959e]">支出项、支出时间、金额和备注为固定字段</p>
                  <Button size="sm" className="h-8 px-4 text-xs" onClick={createType}><Plus className="mr-1 h-3.5 w-3.5" />新增</Button>
                </div>
              </div>
            </div>
            {typeError && <p className="text-[12px] text-[#c4506a]">{typeError}</p>}
            <div className="max-h-[320px] overflow-y-auto border-t border-[#f0f0f0]">
              <div className="grid h-8 grid-cols-[88px_minmax(0,1fr)_164px_28px] items-center border-b border-[#f0f0f0] text-[12px] text-[#8f959e]">
                <span className="px-2">成本归属</span>
                <span>支出类型</span>
                <span>录入字段</span>
                <span />
              </div>
              {(["management", "operation"] as const).map(category => {
                const categoryTypes = expenseTypes.filter(item => item.cost_category === category)
                return <div key={category} className="grid grid-cols-[88px_minmax(0,1fr)] border-b border-[#f0f0f0] last:border-b-0">
                  <div className="px-2 pt-3 text-[13px] font-medium text-[#4e535a]">
                    {category === "management" ? "管理成本" : "运营成本"}
                  </div>
                  <div className="min-w-0">
                    {categoryTypes.length === 0 ? <div className="flex h-10 items-center text-[12px] text-[#d0d3d6]">暂无子类型</div> : categoryTypes.map(item => <div key={item.id} className="group flex min-h-10 items-center border-b border-[#f0f0f0] pr-2 text-[13px] text-[#2b2f36] transition-colors hover:bg-[#f7f8fa] last:border-b-0">
                      <span className="min-w-0 flex-1 truncate pr-3" title={item.name}>{item.name}</span>
                      <label className="flex w-[94px] cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]"><input type="checkbox" checked={item.requires_customer} disabled={updatingTypeId === item.id} onChange={event => updateTypeRequirements(item, "requires_customer", event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />用户昵称</label>
                      <label className="flex w-[70px] cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]"><input type="checkbox" checked={item.requires_platform} disabled={updatingTypeId === item.id} onChange={event => updateTypeRequirements(item, "requires_platform", event.target.checked)} className="h-3.5 w-3.5 accent-[#3370ff]" />平台</label>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 transition-opacity group-hover:opacity-100" onClick={async () => { try { await expenseApi.deleteType(item.id); loadTypes() } catch (error) { setTypeError(error instanceof Error ? error.message : "删除失败") } }} aria-label={`删除${item.name}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>)}
                  </div>
                </div>
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除支出记录</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除支出项“{deleteTarget?.purchase_content}”吗？删除后列表中将不再显示。
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
