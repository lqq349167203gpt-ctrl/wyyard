import { Fragment, useCallback, useEffect, useState } from "react"
import { Search } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import { EmptyValue } from "@/components/empty-value"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import DetailView from "@/pages/healing-records/components/detail-view"
import { customerFollowUpApi, type CustomerFollowUpNote, type CustomerFollowUpRow } from "@/lib/api"

const PAGE_SIZE = 20
/** 三类内容都能改：来访需求 / 客户信息 / 跟进点 */
/** 列表列（列标题与每张日期卡片共用同一套宽度，保证上下对齐） */
const LIST_COLUMNS = [
  { key: "customer", label: "客户", width: "10%" },
  { key: "identity", label: "客户身份", width: "8%" },
  { key: "activities", label: "当天参加的活动", width: "13%" },
  { key: "visit_need", label: "来访需求", width: "19%" },
  { key: "customer_info", label: "客户信息", width: "19%" },
  { key: "follow_up", label: "跟进点", width: "19%" },
  { key: "updated", label: "更新时间", width: "12%" },
]
const NOTE_FIELDS = [
  { key: "visit_need" as const, label: "来访需求" },
  { key: "customer_info" as const, label: "客户信息" },
  { key: "follow_up" as const, label: "跟进点" },
]


function formatDate(value: string) {
  if (!value) return "—"
  const [year, month, day] = value.split("-")
  return year && month && day ? `${month}月${day}日` : value
}


function formatTime(value: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}


export default function CustomerFollowUpsPage() {
  const [rows, setRows] = useState<CustomerFollowUpRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState("")
  const [searchKeyword, setSearchKeyword] = useState("")
  // 日期筛选（放在列表卡片里，改了就查，不需要点按钮）
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // 编辑自己填的那一条（来访需求 / 客户信息 / 跟进点）
  const [editing, setEditing] = useState<{ row: CustomerFollowUpRow; field: "visit_need" | "customer_info" | "follow_up" } | null>(null)
  const [draft, setDraft] = useState("")
  const [saving, setSaving] = useState(false)
  // 点昵称看客户详情（权限沿用客户浏览权限，由后端校验）
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)

  const fetchRows = useCallback(async (nextPage: number, nextKeyword: string, from = dateFrom, to = dateTo) => {
    setLoading(true)
    setError("")
    try {
      const result = await customerFollowUpApi.list({ keyword: nextKeyword, date_from: from, date_to: to, page: nextPage, page_size: PAGE_SIZE })
      setRows(result.items || [])
      setTotal(result.total || 0)
      setTotalPages(result.total_pages || 1)
      setPage(result.page || nextPage)
    } catch (e) {
      setRows([])
      setTotal(0)
      setTotalPages(1)
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchRows(1, "") }, [fetchRows])

  // 搜索框输入即查
  useEffect(() => {
    const timer = setTimeout(() => setSearchKeyword(keyword.trim()), 300)
    return () => clearTimeout(timer)
  }, [keyword])

  const runSearch = () => {
    setSearchKeyword(keyword.trim())
    fetchRows(1, keyword.trim())
  }

  const resetSearch = () => {
    setKeyword("")
    setSearchKeyword("")
    fetchRows(1, "")
  }

  const openEditor = (row: CustomerFollowUpRow, field: "visit_need" | "customer_info" | "follow_up") => {
    setEditing({ row, field })
    // 没填过的也能填：草稿为空，保存时走新增
    setDraft(row[field]?.content || "")
  }

  const saveNote = async () => {
    if (!editing) return
    const note = editing.row[editing.field]
    const content = draft.trim()
    if (!content) { setError("内容不能为空"); return }
    setSaving(true)
    setError("")
    try {
      const saved = note
        ? await customerFollowUpApi.update(note.id, content)
        : await customerFollowUpApi.create(editing.row.visit_id, editing.field, content)
      const updated: CustomerFollowUpNote = { id: saved.id, content, updated_at: saved.updated_at }
      setRows(current => current.map(item => item.id === editing.row.id ? { ...item, [editing.field]: updated } : item))
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(page * PAGE_SIZE, total)
  // 按到店日期分组（同一天的人放一起，一眼看出哪天来了谁）
  const dateGroups = (() => {
    const map = new Map<string, CustomerFollowUpRow[]>()
    rows.forEach(row => {
      const key = row.visit_date || ""
      const list = map.get(key)
      if (list) list.push(row)
      else map.set(key, [row])
    })
    return [...map.entries()].map(([date, items]) => ({ date, items }))
  })()
  const dialogSaveLabel = editing && !editing.row[editing.field] ? "填写" : "保存"

  return (
    <div className="min-h-full bg-[#f4f5f6] p-4 pb-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-white px-5 py-4 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div>
          <h1 className="text-[15px] font-medium text-[#1f2329]">客户跟进</h1>
          <p className="mt-1 text-[12px] text-[#8f959e]">这里只列你自己填写过的来访需求、客户信息与跟进点；点昵称可以看客户详情，点内容可以改。</p>
        </div>
      </div>

      {searchKeyword && (
        <div className="mb-3 flex items-center gap-2 text-[12px] text-[#8f959e]">
          <span>搜索：{searchKeyword}</span>
          <button type="button" onClick={resetSearch} className="text-[#3370ff] hover:underline">清除</button>
        </div>
      )}

      {error && <div className="mb-3 rounded-[4px] border border-[#f1d9dc] bg-[#fff8f8] px-3 py-2 text-[12px] text-[#b94a58]">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        {/* 日期筛选放在列表卡片内，改完即时查询 */}
        <div className="flex items-center gap-2 border-b border-[#f0f0f0] px-4 py-2">
          <span className="text-[12px] text-[#8f959e]">昵称</span>
          <Input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder="按昵称或姓名搜索"
            className="h-7 w-[200px] rounded-[4px] border border-[#dee0e3] text-[11px] shadow-none focus-visible:ring-0"
          />
          <span className="text-[12px] text-[#8f959e]">日期</span>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={event => setDateFrom(event.target.value)} className="h-7 rounded-[4px] border border-[#dee0e3] px-2 text-[11px] text-[#2b2f36] outline-none" aria-label="开始日期" />
          <span className="text-[11px] text-[#8f959e]">-</span>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={event => setDateTo(event.target.value)} className="h-7 rounded-[4px] border border-[#dee0e3] px-2 text-[11px] text-[#2b2f36] outline-none" aria-label="结束日期" />
          {(dateFrom || dateTo) && (
            <button type="button" onClick={() => { setDateFrom(""); setDateTo("") }} className="text-[12px] text-[#3370ff] hover:underline">清除</button>
          )}
        </div>
        {/* 列标题只出现一次，每个日期一张卡片 */}
        <div className="px-4 pt-3">
          <table className="w-full table-fixed border-collapse text-[11px] text-[#9aa1a9]">
            <colgroup>{LIST_COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
            <thead>
              <tr>
                {LIST_COLUMNS.map((column, index) => (
                  <th key={column.key} className={`py-2 text-left font-normal ${index === 0 ? "pl-3" : ""}`}>{column.label}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <div className="space-y-3 px-4 pb-3">
          {!rows.length && !loading && (
            <div className="py-14 text-center text-[13px] text-[#8f959e]">
              {searchKeyword ? "没有匹配的跟进记录" : "你还没有填写过来访需求、客户信息或跟进点"}
            </div>
          )}
          {loading && !rows.length && <div className="py-14 text-center text-[13px] text-[#8f959e]">加载中…</div>}
          {dateGroups.map(group => (
            <div key={group.date} className="overflow-hidden rounded-[6px] border border-[#eceef0]">
              <div className="flex items-center justify-between gap-3 bg-[#fafbfc] px-3 py-2">
                <span className="text-[12.5px] font-medium text-[#2b2f36]">{group.date || "未记录日期"}</span>
                <span className="text-[11px] text-[#9aa1a9]">{group.items.length} 人</span>
              </div>
              <table className="w-full table-fixed border-collapse">
                <colgroup>{LIST_COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
                <tbody>
                  {group.items.map(row => (
                    <tr key={row.id} className="border-t border-[#f5f6f7] align-top">
                      <td className="break-words px-3 py-2.5 pl-3 text-[12px] text-[#2b2f36]">
                        <button type="button" onClick={() => setDetailCustomerId(row.customer_id)} className="text-left hover:underline" title="查看客户详情">
                          {row.customer_name || "未命名"}
                        </button>
                      </td>
                      <td className="break-words px-3 py-2.5 text-[12px] text-[#4e535a]">{row.customer_identity || <EmptyValue />}</td>
                      <td className="break-words px-3 py-2.5 text-[12px] text-[#4e535a]">
                        {(row.activities || []).length ? row.activities.join("、") : <EmptyValue />}
                      </td>
                      {NOTE_FIELDS.map(({ key }) => {
                        const note = row[key]
                        return (
                          <td key={key} className="px-3 py-2.5">
                            {note ? (
                              <button
                                type="button"
                                onClick={() => openEditor(row, key)}
                                className="block w-full break-words text-left text-[12px] leading-5 text-[#4e535a] hover:text-[#3370ff]"
                                title="点击修改（内容过长时只显示前三行）"
                              >
                                <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{note.content}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openEditor(row, key)}
                                className="flex h-8 w-full items-center rounded-[4px] border border-[#e8eaed] bg-white px-2.5 text-left text-[12px] text-[#a8b0ba] transition-colors hover:border-[#b9cdf8] hover:text-[#4e535a]"
                              >
                                点击填写
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="break-words px-3 py-2.5 text-[12px] text-[#8f959e]">{formatTime(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="px-4 pb-3">
          <PaginationBar
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            startIndex={startIndex}
            endIndex={endIndex}
            onPageChange={next => fetchRows(next, searchKeyword)}
          />
        </div>
      </div>

      {/* 填写 / 修改自己那一条：来访需求 / 客户信息 / 跟进点 */}
      <Dialog open={!!editing} onOpenChange={open => { if (!open && !saving) setEditing(null) }}>
        <DialogContent initialFocus={false} className="w-[520px] max-w-[92vw] max-h-[88vh] gap-0 overflow-hidden rounded-[6px] border-[0.5px] border-[#e8eaed] p-0">
          <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 pb-2 pt-3">
            <DialogTitle className="text-[14px] font-normal">
              {editing?.row[editing.field] ? "修改" : "填写"}
              {NOTE_FIELDS.find(item => item.key === editing?.field)?.label || "内容"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[64vh] space-y-2 overflow-y-auto px-5 py-4">
            <p className="text-[12px] text-[#8f959e]">
              {editing?.row.customer_name || "客户"} · {formatDate(editing?.row.visit_date || "")}
              {(editing?.row.activities || []).length ? ` · ${editing!.row.activities.join("、")}` : ""}
            </p>
            <textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              maxLength={5000}
              rows={6}
              placeholder="写清楚这次来的情况和下一步跟进安排"
              className="w-full rounded-[4px] border-[0.5px] border-[#e1e4e7] px-3 py-2 text-[12.5px] leading-5 text-[#2b2f36] outline-none placeholder:text-[#b0b5bb] focus:border-[#b9cdf8]"
            />
          </div>
          <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] gap-2 px-5 py-2.5">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={saving} className="h-8 w-[88px] rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
            <Button size="sm" onClick={saveNote} disabled={saving} className="h-8 w-[104px] rounded-[4px] border border-[#3370ff] bg-[#3370ff] text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{saving ? "保存中" : dialogSaveLabel}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 客户详情：与客户资料页同一个详情组件，权限由后端按账号浏览权限校验 */}
      <Dialog open={!!detailCustomerId} onOpenChange={open => { if (!open) setDetailCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DetailView selectedCustomerId={detailCustomerId} onClearSelection={() => setDetailCustomerId(null)} hideSearch />
        </DialogContent>
      </Dialog>
    </div>
  )
}
