import { useCallback, useRef, useState } from "react"
import { Inbox, Pencil, Plus, Trash2, X } from "lucide-react"
import { financialApi } from "@/lib/api"
import type { StaffBenefitRecord } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"

const PAGE_SIZE = 20
const today = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ benefit_date: today(), content: "", amount: "", notes: "" })

function EmptyValue() {
  return <span className="inline-block h-[2px] w-[4px] shrink-0 rounded-full bg-[#e5e8eb] align-middle" />
}

export default function StaffBenefitsPage() {
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const filters = useRef({ from: "", to: "" })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StaffBenefitRecord | null>(null)
  const [form, setForm] = useState(blank)
  const [error, setError] = useState("")
  const fetchRecords = useCallback((page: number, pageSize: number) => financialApi.listBenefits(page, pageSize, filters.current.from, filters.current.to), [])
  const pager = useServerPagination(fetchRecords, { pageSize: PAGE_SIZE })
  const changeDate = (field: "from" | "to", value: string) => { if (field === "from") setDateFrom(value); else setDateTo(value); filters.current[field] = value; pager.goToPage(1) }
  const openCreate = () => { setEditing(null); setForm(blank()); setError(""); setDialogOpen(true) }
  const openEdit = (item: StaffBenefitRecord) => { setEditing(item); setForm({ benefit_date: item.benefit_date, content: item.content, amount: String(item.amount), notes: item.notes }); setError(""); setDialogOpen(true) }
  const save = async () => {
    const amount = Number(form.amount)
    if (!form.benefit_date || !form.content.trim() || !Number.isFinite(amount) || amount <= 0) { setError("请完整填写日期、福利内容和有效金额"); return }
    const payload = { ...form, content: form.content.trim(), amount }
    if (editing) await financialApi.updateBenefit(editing.id, payload); else await financialApi.createBenefit(payload)
    setDialogOpen(false); editing ? pager.refresh() : pager.goToPage(1)
  }
  return <div className="dv-root flex h-full flex-col gap-3 bg-[#f4f5f6] p-4">
    <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
    <div className="flex h-[52px] flex-wrap items-center gap-2 rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
      <span className="whitespace-nowrap text-[15px] font-medium text-[#212631]">人员福利</span>
      <span className="ml-2.5 whitespace-nowrap text-[11.5px] text-[#a8b1bd]">登记人员福利支出，用于营业利润统计</span>
    </div>
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]"><div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-2.5"><div className="flex h-8 items-center overflow-hidden rounded-[7px] border border-[#e1e4e7] bg-white"><input type="date" value={dateFrom} max={dateTo || undefined} onChange={e => changeDate("from", e.target.value)} className={`h-full border-none bg-transparent px-2.5 text-[12px] outline-none ${dateFrom ? "text-[#2b2f36]" : "date-empty text-[#a8b1bd]"}`} /><span className="px-1 text-[12px] text-[#8f959e]">~</span><input type="date" value={dateTo} min={dateFrom || undefined} onChange={e => changeDate("to", e.target.value)} className={`h-full border-none bg-transparent px-2.5 text-[12px] outline-none ${dateTo ? "text-[#2b2f36]" : "date-empty text-[#a8b1bd]"}`} /></div><button className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]" onClick={() => { setDateFrom(""); setDateTo(""); filters.current = { from: "", to: "" }; pager.goToPage(1) }}><X className="h-3.5 w-3.5" />清空</button><div className="flex-1" /><Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={openCreate}><Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" />新增福利</Button></div>
      {pager.loading ? <div className="flex flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div> : pager.totalItems === 0 ? <div className="flex flex-col items-center justify-center gap-2 py-16"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无数据</span></div> : <Table style={{ tableLayout: "fixed" }}><TableHeader><TableRow className="hover:bg-transparent"><TableHead className="pl-4" style={{ width: "130px" }}>日期</TableHead><TableHead style={{ width: "220px" }}>福利内容</TableHead><TableHead style={{ width: "120px" }}>金额</TableHead><TableHead>备注</TableHead><TableHead style={{ width: "100px" }}>创建人</TableHead><TableHead className="pr-4 text-right" style={{ width: "88px" }}>操作</TableHead></TableRow></TableHeader><TableBody>{pager.paginatedItems.map(item => <TableRow key={item.id} className="group hover:bg-[#f7f8fa]"><TableCell className="pl-4 text-[12px] text-[#2b2f36] tabular-nums">{item.benefit_date}</TableCell><TableCell><span className="block truncate text-[13px] font-medium text-[#212631]" title={item.content}>{item.content}</span></TableCell><TableCell className="text-[12px] text-[#c4506a] tabular-nums">¥{item.amount.toLocaleString()}</TableCell><TableCell><span className="block truncate text-[12px] text-[#a8b1bd]" title={item.notes}>{item.notes || <EmptyValue />}</span></TableCell><TableCell className="text-[12px] text-[#a8b1bd]">{item.created_by || <EmptyValue />}</TableCell><TableCell className="pr-4 text-right"><div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={async () => { await financialApi.deleteBenefit(item.id); pager.refresh() }}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></TableCell></TableRow>)}</TableBody></Table>}
      <PaginationBar currentPage={pager.currentPage} totalPages={pager.totalPages} totalItems={pager.totalItems} startIndex={pager.startIndex} endIndex={pager.endIndex} onPageChange={pager.goToPage} />
    </div>
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="w-[400px] max-w-[90vw] gap-0 p-0"><DialogHeader className="border-b border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">{editing ? "编辑福利" : "新增福利"}</DialogTitle></DialogHeader><div className="space-y-4 px-6 py-5">
      <label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">日期</span><Input type="date" value={form.benefit_date} onChange={e => setForm({ ...form, benefit_date: e.target.value })} /></label><label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">福利内容</span><Input value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} placeholder="例如：节日礼品" /></label><label className="grid grid-cols-[64px_1fr] items-center gap-3"><span className="text-right text-[12px] text-[#4e535a]">金额</span><Input type="number" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label><label className="grid grid-cols-[64px_1fr] items-start gap-3"><span className="pt-2 text-right text-[12px] text-[#4e535a]">备注</span><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[84px] resize-none text-[12px]" /></label>{error && <p className="pl-[76px] text-[12px] text-[#c4506a]">{error}</p>}<div className="flex justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button><Button size="sm" onClick={save}>保存</Button></div>
    </div></DialogContent></Dialog>
  </div>
}
