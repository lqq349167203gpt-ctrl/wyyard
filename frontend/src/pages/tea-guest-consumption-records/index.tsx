import { useCallback, useRef, useState } from "react"
import { Inbox, Pencil, Plus, Trash2, X } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useServerPagination } from "@/hooks/use-server-pagination"
import {
  teaGuestConsumptionApi,
  type TeaGuestConsumptionInput,
  type TeaGuestConsumptionRecord,
  type TeaGuestPaymentMethod,
} from "@/lib/api"

const PAGE_SIZE = 20
const PAYMENT_METHODS: TeaGuestPaymentMethod[] = ["美团", "支付宝", "微信", "抖音"]

type ConsumptionForm = Omit<TeaGuestConsumptionInput, "guest_count" | "unit_price"> & {
  guest_count: string
  unit_price: string
}

function currentLocalMinute() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function emptyForm(): ConsumptionForm {
  return {
    consumption_time: currentLocalMinute(),
    guest_count: "",
    unit_price: "",
    payment_method: "微信",
    notes: "",
  }
}

function formatMoney(value: number) {
  return `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatTime(value: string) {
  return value ? value.replace("T", " ") : "-"
}

export default function TeaGuestConsumptionRecordsPage() {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("")
  const filtersRef = useRef({ dateFrom: "", dateTo: "", paymentMethod: "" })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<TeaGuestConsumptionRecord | null>(null)
  const [form, setForm] = useState<ConsumptionForm>(emptyForm)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TeaGuestConsumptionRecord | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchRecords = useCallback((page: number, pageSize: number) => {
    const filters = filtersRef.current
    return teaGuestConsumptionApi.listPaginated(page, pageSize, {
      date_from: filters.dateFrom || undefined,
      date_to: filters.dateTo || undefined,
      payment_method: filters.paymentMethod || undefined,
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
  } = useServerPagination<TeaGuestConsumptionRecord>(fetchRecords, { pageSize: PAGE_SIZE })

  const updateFilter = (field: "dateFrom" | "dateTo" | "paymentMethod", value: string) => {
    if (field === "dateFrom") setDateFrom(value)
    if (field === "dateTo") setDateTo(value)
    if (field === "paymentMethod") setPaymentMethod(value)
    filtersRef.current[field] = value
    goToPage(1)
  }

  const clearFilters = () => {
    setDateFrom("")
    setDateTo("")
    setPaymentMethod("")
    filtersRef.current = { dateFrom: "", dateTo: "", paymentMethod: "" }
    goToPage(1)
  }

  const openCreate = () => {
    setEditingItem(null)
    setForm(emptyForm())
    setFormError("")
    setDialogOpen(true)
  }

  const openEdit = (item: TeaGuestConsumptionRecord) => {
    setEditingItem(item)
    setForm({
      consumption_time: item.consumption_time,
      guest_count: String(item.guest_count),
      unit_price: String(item.unit_price),
      payment_method: item.payment_method,
      notes: item.notes || "",
    })
    setFormError("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    const guestCount = Number(form.guest_count)
    const unitPrice = Number(form.unit_price)
    if (!form.consumption_time) {
      setFormError("请选择消费时间")
      return
    }
    if (!Number.isInteger(guestCount) || guestCount <= 0) {
      setFormError("请输入大于 0 的整数茶客数量")
      return
    }
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      setFormError("请输入大于 0 的单价")
      return
    }
    const payload: TeaGuestConsumptionInput = {
      consumption_time: form.consumption_time,
      guest_count: guestCount,
      unit_price: unitPrice,
      payment_method: form.payment_method,
      notes: form.notes.trim(),
    }
    setSaving(true)
    setFormError("")
    try {
      if (editingItem) {
        await teaGuestConsumptionApi.update(editingItem.id, payload)
        refresh()
      } else {
        await teaGuestConsumptionApi.create(payload)
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
      await teaGuestConsumptionApi.delete(deleteTarget.id)
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

  const previewTotal = Number(form.guest_count) > 0 && Number(form.unit_price) > 0
    ? Number(form.guest_count) * Number(form.unit_price)
    : 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[#f4f5f6] p-4">
      <section className="flex h-[56px] shrink-0 items-center justify-between rounded-[4px] bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div>
          <h1 className="text-[18px] font-medium text-[#212631]">消费记录</h1>
          <p className="mt-0.5 text-[12px] text-[#8f959e]">茶客业务独立记录，不计入无忧茶院现有业务数据</p>
        </div>
        <Button size="sm" className="h-8 bg-[#3370ff] px-3 text-[12px] hover:bg-[#2865e8]" onClick={openCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" />新增记录
        </Button>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[4px] bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="flex h-8 items-center overflow-hidden rounded-[4px] border border-[#e1e4e7] bg-white">
            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={event => updateFilter("dateFrom", event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "text-[#8f959e]"}`}
            />
            <span className="px-1 text-[12px] text-[#8f959e]">~</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={event => updateFilter("dateTo", event.target.value)}
              className={`h-full border-none bg-transparent px-2 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "text-[#8f959e]"}`}
            />
          </div>
          <Select value={paymentMethod || "all"} onValueChange={value => updateFilter("paymentMethod", value === "all" ? "" : value || "")}>
            <SelectTrigger className="h-8 w-[132px] rounded-[4px] border-[#e1e4e7] bg-white text-[12px]">
              <span className="flex-1 text-left">{paymentMethod || "全部"}</span>
            </SelectTrigger>
            <SelectContent align="start" className="rounded-[4px]">
              <SelectItem value="all" className="text-[12px]">全部支付方式</SelectItem>
              {PAYMENT_METHODS.map(method => <SelectItem key={method} value={method} className="text-[12px]">{method}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={clearFilters} className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            <X className="h-3.5 w-3.5" />清空
          </button>
          <span className="ml-auto text-[12px] text-[#8f959e]">共 {totalItems} 条记录</span>
        </div>

        {loading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">加载中...</span>
          </div>
        ) : totalItems === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16">
            <Inbox className="h-8 w-8 text-[#d0d3d6]" />
            <span className="text-[12px] text-[#8f959e]">暂无消费记录</span>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <Table style={{ tableLayout: "fixed" }}>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4" style={{ width: "180px" }}>消费时间</TableHead>
                  <TableHead style={{ width: "120px" }}>茶客数量</TableHead>
                  <TableHead style={{ width: "140px" }}>单价</TableHead>
                  <TableHead style={{ width: "150px" }}>总金额</TableHead>
                  <TableHead style={{ width: "120px" }}>支付方式</TableHead>
                  <TableHead>备注</TableHead>
                  <TableHead style={{ width: "100px" }}>创建人</TableHead>
                  <TableHead className="pr-4 text-right" style={{ width: "88px" }}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map(item => (
                  <TableRow key={item.id} className="group hover:bg-[#f7f8fa]">
                    <TableCell className="pl-4 text-[12px] tabular-nums text-[#2b2f36]">{formatTime(item.consumption_time)}</TableCell>
                    <TableCell className="text-[13px] tabular-nums text-[#2b2f36]">{item.guest_count} 人</TableCell>
                    <TableCell className="text-[12px] tabular-nums text-[#4e535a]">{formatMoney(item.unit_price)}</TableCell>
                    <TableCell className="text-[13px] font-medium tabular-nums text-[#212631]">{formatMoney(item.total_amount)}</TableCell>
                    <TableCell className="text-[13px] text-[#4e535a]">{item.payment_method}</TableCell>
                    <TableCell>
                      {item.notes
                        ? <span className="block truncate text-[12px] text-[#8f959e]" title={item.notes}>{item.notes}</span>
                        : <span className="inline-block h-[2px] w-[10px] rounded-full bg-[#e5e8eb] align-middle" />}
                    </TableCell>
                    <TableCell className="text-[12px] text-[#8f959e]">{item.created_by || <span className="inline-block h-[2px] w-[10px] rounded-full bg-[#e5e8eb] align-middle" />}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)} aria-label="编辑消费记录">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)} aria-label="删除消费记录">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} onPageChange={goToPage} />
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[440px] max-w-[90vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-6 pb-4 pt-5">
            <DialogTitle className="text-[14px] font-normal">{editingItem ? "编辑消费记录" : "新增消费记录"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">消费时间</span>
              <Input type="datetime-local" value={form.consumption_time} onChange={event => setForm({ ...form, consumption_time: event.target.value })} className="h-8 text-[12px]" />
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">茶客数量</span>
              <Input type="number" min="1" step="1" value={form.guest_count} onChange={event => setForm({ ...form, guest_count: event.target.value })} placeholder="请输入人数" className="h-8 text-[12px] tabular-nums" />
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">单价</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[12px] text-[#8f959e]">¥</span>
                <Input type="number" min="0.01" step="0.01" value={form.unit_price} onChange={event => setForm({ ...form, unit_price: event.target.value })} placeholder="0.00" className="h-8 pl-6 text-[12px] tabular-nums" />
              </div>
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">总金额</span>
              <div className="flex h-8 items-center rounded-[4px] bg-[#f5f6f7] px-3 text-[13px] font-medium tabular-nums text-[#212631]">{formatMoney(previewTotal)}</div>
            </div>
            <div className="grid grid-cols-[76px_1fr] items-center gap-3">
              <span className="text-right text-[12px] text-[#4e535a]">支付方式</span>
              <Select value={form.payment_method} onValueChange={value => value && setForm({ ...form, payment_method: value as TeaGuestPaymentMethod })}>
                <SelectTrigger className="h-8 w-full rounded-[4px] text-[12px]"><SelectValue /></SelectTrigger>
                <SelectContent align="start" className="rounded-[4px]">
                  {PAYMENT_METHODS.map(method => <SelectItem key={method} value={method} className="text-[12px]">{method}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[76px_1fr] items-start gap-3">
              <span className="pt-2 text-right text-[12px] text-[#4e535a]">备注</span>
              <Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="可填写补充说明" maxLength={2000} className="min-h-[80px] resize-none text-[12px]" />
            </div>
            {formError && <p className="pl-[89px] text-[12px] text-[#c4506a]">{formError}</p>}
            <div className="flex justify-end gap-2 border-t border-[#f0f0f0] pt-4">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除消费记录</AlertDialogTitle>
            <AlertDialogDescription>确定删除 {deleteTarget ? formatTime(deleteTarget.consumption_time) : ""} 的消费记录吗？删除后列表中将不再显示。</AlertDialogDescription>
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
