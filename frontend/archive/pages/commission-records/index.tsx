// 归档于 2026-08-14：分成页面已从系统移除，历史代码保留用于数据追溯。
import { useCallback, useEffect, useState } from "react"
import { Inbox, Pencil, Plus, Trash2, X } from "lucide-react"
import { customerApi, financialApi } from "@/lib/api"
import type { CommissionRecord, CustomerLight } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const PAGE_SIZE = 20
const thisMonth = () => new Date().toISOString().slice(0, 7)
const blank = () => ({ month: thisMonth(), person_id: "", person_name: "", amount: "", notes: "" })

function EmptyValue() {
  return <span className="inline-block h-[2px] w-[4px] shrink-0 rounded-full bg-[#e5e8eb] align-middle" />
}

export default function CommissionRecordsPage() {
  const [month, setMonth] = useState("")
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<CommissionRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CommissionRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState(blank)
  const [error, setError] = useState("")
  useEffect(() => { customerApi.light().then(setCustomers).catch(() => {}) }, [])
  const fetchRecords = useCallback((page: number, pageSize: number) => financialApi.listCommissions(page, pageSize, month), [month])
  const pager = useServerPagination(fetchRecords, { pageSize: PAGE_SIZE })
  const openCreate = () => { setEditing(null); setForm(blank()); setError(""); setDialogOpen(true) }
  const openEdit = (item: CommissionRecord) => { setEditing(item); setForm({ month: item.month, person_id: item.person_id, person_name: item.person_name, amount: String(item.amount), notes: item.notes }); setError(""); setDialogOpen(true) }
  const save = async () => {
    const amount = Number(form.amount)
    if (!form.month || !form.person_id || !form.person_name.trim() || !Number.isFinite(amount) || amount <= 0) { setError("请选择人员，并完整填写月份和有效金额"); return }
    const payload = { ...form, amount, person_name: form.person_name.trim() }
    if (editing) await financialApi.updateCommission(editing.id, payload); else await financialApi.createCommission(payload)
    setDialogOpen(false); editing ? pager.refresh() : pager.goToPage(1)
  }
  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await financialApi.deleteCommission(deleteTarget.id)
      setDeleteTarget(null)
      pager.refresh()
    } finally {
      setDeleting(false)
    }
  }
  return <div className="dv-root flex h-full flex-col gap-3 bg-[#f4f5f6] p-4">
    <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
    <div className="flex h-[52px] flex-wrap items-center gap-2 rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
      <span className="whitespace-nowrap text-[15px] font-medium text-[#212631]">分成</span>
      <span className="ml-2.5 whitespace-nowrap text-[11.5px] text-[#a8b1bd]">按月份登记分成，用于营业利润统计</span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]"><div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5"><input type="month" aria-label="分成月份筛选" value={month} onChange={(event) => { setMonth(event.target.value); pager.resetPage() }} className={`h-8 rounded-[7px] border border-[#e1e4e7] bg-white px-2.5 text-[12px] outline-none focus:border-[#3370ff] ${month ? "text-[#2b2f36]" : "text-[#a8b1bd]"}`} /><button className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]" onClick={() => { setMonth(""); pager.resetPage() }}><X className="h-3.5 w-3.5" />清空</button><div className="flex-1" /><Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" />新增分成</Button></div>
      {pager.loading ? <div className="flex flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div> : pager.totalItems === 0 ? <div className="flex flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无数据</span></div> : <Table style={{ tableLayout: "fixed" }}><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-4" style={{ width: "120px" }}>分成月份</TableHead><TableHead style={{ width: "160px" }}>人员</TableHead><TableHead style={{ width: "120px" }}>金额</TableHead><TableHead>备注</TableHead><TableHead style={{ width: "100px" }}>创建人</TableHead><TableHead className="pr-4 text-right" style={{ width: "88px" }}>操作</TableHead></TableRow></TableHeader><TableBody>{pager.paginatedItems.map(item => <TableRow key={item.id} className="group hover:bg-[#f7f8fa]"><TableCell className="pl-4 text-[12px] text-[#2b2f36] tabular-nums">{item.month}</TableCell><TableCell><span className="text-[13px] font-medium text-[#212631]">{item.person_name}</span></TableCell><TableCell className="text-[12px] text-[#c4506a] tabular-nums">¥{item.amount.toLocaleString()}</TableCell><TableCell><span className="block truncate text-[12px] text-[#a8b1bd]" title={item.notes}>{item.notes || <EmptyValue />}</span></TableCell><TableCell className="text-[12px] text-[#a8b1bd]">{item.created_by || <EmptyValue />}</TableCell><TableCell className="pr-4 text-right"><div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></TableCell></TableRow>)}</TableBody></Table>}
      <PaginationBar currentPage={pager.currentPage} totalPages={pager.totalPages} totalItems={pager.totalItems} startIndex={pager.startIndex} endIndex={pager.endIndex} onPageChange={pager.goToPage} />
    </div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="w-[400px] max-w-[90vw] gap-0 p-0" initialFocus={false}><DialogHeader className="border-b border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">{editing ? "编辑分成" : "新增分成"}</DialogTitle></DialogHeader><div className="space-y-4 px-6 py-5">
      <label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">分成月份</span><Input type="month" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">人员</span><CustomerSearchInput customers={customers} value={form.person_name} placeholder="输入客户昵称或姓名搜索..." filterSelected={false} onChange={value => { const personName = typeof value === "string" ? value : ""; const customer = customers.find(item => item.nickname === personName); setForm({ ...form, person_name: personName, person_id: customer?.id || "" }) }} /></label>
      <label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">金额</span><Input type="number" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
      <label className="grid grid-cols-[64px_1fr] items-start gap-3"><span className="pt-2 text-right text-[12px] text-[#4e535a]">备注</span><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[84px] resize-none text-[12px]" /></label>{error && <p className="pl-[76px] text-[12px] text-[#c4506a]">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button><Button size="sm" onClick={save}>保存</Button></div>
    </div></DialogContent></Dialog>
    <AlertDialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除分成记录</AlertDialogTitle>
          <AlertDialogDescription>确定删除“{deleteTarget?.month} · {deleteTarget?.person_name}”这条分成记录吗？删除后列表中将不再显示。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "删除"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
