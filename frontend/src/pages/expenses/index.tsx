import { useCallback, useRef, useState } from "react"
import { Inbox, Pencil, ReceiptText, Trash2, X } from "lucide-react"

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
import type { Expense, ExpenseInput } from "@/lib/api"

const PAGE_SIZE = 20

type ExpenseForm = Omit<ExpenseInput, "amount"> & { amount: string }

function currentLocalMinute() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function emptyForm(): ExpenseForm {
  return {
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

  return (
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">支出</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">管理与查看全部支出记录</span>
      </div>

      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="flex h-8 items-center overflow-hidden rounded-[4px] border border-[#dee0e3] bg-white">
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
          {(dateFrom || dateTo) && (
            <button
              onClick={clearDateFilter}
              className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
            >
              <X className="h-3.5 w-3.5" />清空
            </button>
          )}
          <div className="flex-1" />
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
                  <TableCell>
                    <span className="block truncate text-[12px] text-[#2b2f36]" title={item.purchase_content}>{item.purchase_content}</span>
                  </TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#c4506a]">
                    ¥{item.amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[12px] text-[#4e535a]">{item.platform}</span>
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
