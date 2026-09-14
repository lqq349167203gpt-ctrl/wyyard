import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loginRecordApi, type UsageOverview, type AccountActivityRecord, type AccountActivityType } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { PaginationBar } from "@/components/pagination-bar"
import { useServerPagination } from "@/hooks/use-server-pagination"

type Filters = { date_from: string; date_to: string; source: string; account_id: string }
const day = (d: Date) => d.toLocaleDateString("sv-SE")
const duration = (n: number) => n > 0 ? n < 60 ? `${n}秒` : `${Math.floor(n / 60)}分钟` : "—"
const dateTime = (s: string | null) => s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "—"
const labels: Record<string, string> = { login: "登录", page_view: "访问页面", operation: "业务操作", usage: "页面时长", pc: "PC端", miniprogram: "管理端小程序" }

function Details({ filters, pageName = "" }: { filters: Filters; pageName?: string }) {
  const [kind, setKind] = useState("")
  const [keyword, setKeyword] = useState("")
  const [search, setSearch] = useState("")
  const fetch = useCallback((p: number, size: number) => loginRecordApi.listPaginated({ ...filters, source: filters.source as "pc" | "miniprogram" || undefined, account_id: filters.account_id || undefined, event_type: kind as AccountActivityType || undefined, page_name: pageName || undefined, keyword: search || undefined }, p, size), [filters, kind, pageName, search])
  const paging = useServerPagination<AccountActivityRecord>(fetch, { pageSize: 20 })
  const previous = useRef(fetch)
  useEffect(() => { if (previous.current !== fetch) { previous.current = fetch; paging.resetPage() } }, [fetch, paging.resetPage])
  return <div className="space-y-3">
    <SelectDropdown value={kind} onChange={setKind} options={[{ value: "", label: "全部记录" }, ...["login", "page_view", "operation", "usage"].map(value => ({ value, label: labels[value] }))]} className="w-36" />
    <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setSearch(keyword.trim()) }}><input aria-label="搜索操作内容" placeholder="搜索页面或操作内容" value={keyword} onChange={e => setKeyword(e.target.value)} className="h-8 rounded border px-2" /><Button size="sm" variant="outline">查询</Button></form>
    <p className="text-xs text-[#8f959e]">页面时长为所在活跃区间，不代表单次操作耗时；登录仅列实际登录记录。</p>
    {paging.error && <p role="alert" className="text-red-600">明细加载失败，请重试。</p>}
    <Table><TableHeader><TableRow>{["时间", "使用人", "类型", "页面", "内容", "终端", "IP"].map(t => <TableHead key={t}>{t}</TableHead>)}</TableRow></TableHeader><TableBody>
      {paging.paginatedItems.map(r => <TableRow key={r.id}><TableCell className="whitespace-nowrap text-xs">{dateTime(r.created_at)}</TableCell><TableCell>{r.owner}</TableCell><TableCell>{labels[r.event_type]}</TableCell><TableCell>{r.page_name || "—"}</TableCell><TableCell className="max-w-[320px] truncate" title={r.content}>{r.content}{r.event_type === "usage" ? ` · ${duration(r.duration_seconds)}` : ""}</TableCell><TableCell>{labels[r.source] || r.source}</TableCell><TableCell className="text-xs">{r.ip || "—"}</TableCell></TableRow>)}
      {!paging.paginatedItems.length && <TableRow><TableCell colSpan={7} className="h-48 text-center text-[#8f959e]">{paging.loading ? "加载中…" : "未采集到相关记录"}</TableCell></TableRow>}
    </TableBody></Table>
    <PaginationBar currentPage={paging.currentPage} totalPages={paging.totalPages} totalItems={paging.totalItems} startIndex={paging.startIndex} endIndex={paging.endIndex} onPageChange={paging.goToPage} />
  </div>
}

export default function LoginRecordsPage() {
  const [filters, setFilters] = useState<Filters>(() => ({ date_from: day(new Date(Date.now() - 6 * 86400000)), date_to: day(new Date()), source: "", account_id: "" }))
  const [data, setData] = useState<UsageOverview | null>(null)
  const [names, setNames] = useState<{ value: string; label: string }[]>([])
  const [tab, setTab] = useState("people")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [reload, setReload] = useState(0)
  const [status, setStatus] = useState("")
  const [sort, setSort] = useState("days")
  const [selected, setSelected] = useState<{ name: string; id?: string; personId?: string } | null>(null)
  const [personData, setPersonData] = useState<UsageOverview | null>(null)
  const [detailError, setDetailError] = useState(false)
  useEffect(() => {
    let current = true
    if (!filters.date_from || !filters.date_to || filters.date_from > filters.date_to) { setError("请选择有效的日期范围"); setBusy(false); return }
    setBusy(true); setError("")
    loginRecordApi.overview(filters).then(result => {
      if (!current) return
      setData(result)
      if (!filters.account_id) setNames(result.people.map(p => ({ value: p.account_id, label: p.owner })))
    }).catch(() => { if (current) setError("统计加载失败，请重试") }).finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [filters, reload])
  useEffect(() => {
    let current = true
    setPersonData(null); setDetailError(false)
    const id = selected?.id || selected?.personId
    if (id) loginRecordApi.overview({ ...filters, account_id: id }).then(result => { if (current) setPersonData(result) }).catch(() => { if (current) setDetailError(true) })
    return () => { current = false }
  }, [selected, filters])
  const detailFilters = useMemo(() => ({ ...filters, account_id: selected?.personId || filters.account_id }), [filters, selected?.personId])
  const drawerData = selected?.personId ? personData : data
  const update = (key: keyof Filters, value: string) => { setFilters(f => ({ ...f, [key]: value })); setSelected(null) }
  const preset = (count: number) => setFilters(f => ({ ...f, date_from: day(new Date(Date.now() - (count - 1) * 86400000)), date_to: day(new Date()) }))
  const people = [...(data?.people || [])].filter(p => !status || (status === "used" ? p.days > 0 : p.days === 0)).sort((a, b) => sort === "seconds" ? b.seconds - a.seconds : sort === "latest" ? (b.latest || "").localeCompare(a.latest || "") : b.days - a.days)
  const functions = [...(data?.functions || [])].sort((a, b) => sort === "operations" ? b.operations - a.operations : sort === "visits" ? b.visits - a.visits : b.people - a.people)
  const cards = data?.cards
  const functionTable = (rows: UsageOverview["functions"]) => <Table><TableHeader><TableRow>{["功能页面", "使用人数 / 当前有权限", "使用人天", "访问次数", "操作记录数"].map(t => <TableHead key={t}>{t}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map(p => <TableRow key={p.name}><TableCell><button className="text-[#3370ff]" onClick={() => setSelected({ name: p.name, personId: selected?.id || selected?.personId })}>{p.name}</button></TableCell><TableCell>{p.people} / {p.eligible ?? "未确认"}</TableCell><TableCell>{p.days}</TableCell><TableCell>{p.visits}</TableCell><TableCell>{p.operations}</TableCell></TableRow>)}</TableBody></Table>
  return <div className="space-y-4 px-6 pb-6 pt-4 text-[13px] text-[#2b2f36]">
    <header><h1 className="text-lg font-medium">使用统计</h1><p className="mt-1 text-xs text-[#8f959e]">了解谁在使用系统、经常使用哪些功能；时长与操作量不直接代表功能价值。</p></header>
    <div className="flex flex-wrap items-center gap-3 rounded border border-[#e8e8e8] bg-white p-3">
      <span>统计范围</span><input aria-label="开始日期" type="date" value={filters.date_from} onChange={e => update("date_from", e.target.value)} className="h-8 rounded border px-2" /><span className="text-[#8f959e]">至</span><input aria-label="结束日期" type="date" value={filters.date_to} onChange={e => update("date_to", e.target.value)} className="h-8 rounded border px-2" />
      <Button variant="outline" size="sm" onClick={() => preset(1)}>今天</Button><Button variant="outline" size="sm" onClick={() => preset(7)}>近7天</Button><Button variant="outline" size="sm" onClick={() => preset(30)}>近30天</Button>
      <SelectDropdown value={filters.account_id} onChange={v => update("account_id", v)} options={[{ value: "", label: "全部使用人" }, ...names]} className="w-36" />
      <SelectDropdown value={filters.source} onChange={v => update("source", v)} options={[{ value: "", label: "全部终端" }, { value: "pc", label: "PC端" }, { value: "miniprogram", label: "管理端小程序" }]} className="w-40" />
      <Button variant="outline" size="sm" onClick={() => setReload(n => n + 1)}>刷新</Button>
    </div>
    {error && <p role="alert" className="text-red-600">{error}（原数据未更新）</p>}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[["已使用人数", cards?.used], ["本期未使用人数", cards?.unused], ["经常使用人数", cards?.frequent], ["人均使用天数", cards?.average_days]].map(([label, value]) => <div key={label} className="rounded border border-[#e8e8e8] bg-white px-4 py-3"><div className="text-xs text-[#8f959e]">{label}</div><div className="mt-2 text-2xl font-medium tabular-nums">{value ?? "—"}</div></div>)}</div>
    <p className="text-xs text-[#8f959e]">仅统计当前启用且在所选结束日期前创建的账号。经常使用：本期至少使用 {cards?.frequent_threshold ?? "—"} 天（每7天折算3天，向上取整）。无记录不代表从未使用；权限人数为当前参考，非历史覆盖率。</p>
    <div className="flex items-center gap-6 border-b border-[#e8e8e8]">{[["people", "人员使用"], ["functions", "功能使用"], ["details", "使用明细"]].map(([key, label]) => <button key={key} onClick={() => { setTab(key); setSort("days") }} className={`border-b-2 pb-2 text-sm ${tab === key ? "border-[#3370ff] text-[#3370ff]" : "border-transparent"}`}>{label}</button>)}<span className="ml-auto text-xs text-[#8f959e]">{busy ? "正在更新…" : ""}</span></div>
    <section className="min-h-[380px] space-y-3 rounded border border-[#e8e8e8] bg-white p-3">
      {tab !== "details" && <div className="flex gap-3">{tab === "people" && <SelectDropdown value={status} onChange={setStatus} options={[{ value: "", label: "全部人员" }, { value: "used", label: "本期已使用" }, { value: "unused", label: "本期未使用" }]} className="w-36" />}<SelectDropdown value={sort} onChange={setSort} options={tab === "people" ? [{ value: "days", label: "使用天数排序" }, { value: "seconds", label: "有效时长排序" }, { value: "latest", label: "最近使用排序" }] : [{ value: "days", label: "使用人数排序" }, { value: "visits", label: "访问次数排序" }, { value: "operations", label: "操作记录排序" }]} className="w-40" /></div>}
      {tab === "people" && <Table><TableHeader><TableRow>{["姓名", "使用状态", "使用天数", "常用功能", "最近使用", "有效时长", "额外估算"].map(t => <TableHead key={t}>{t}</TableHead>)}</TableRow></TableHeader><TableBody>{people.map(p => <TableRow key={p.account_id}><TableCell><button className="text-[#3370ff]" onClick={() => setSelected({ id: p.account_id, name: p.owner })}>{p.owner}</button></TableCell><TableCell>{p.status}</TableCell><TableCell>{p.days}</TableCell><TableCell className="max-w-[260px] truncate" title={p.pages.join("、")}>{p.pages.join("、") || <span className="text-[#d0d3d6]">—</span>}</TableCell><TableCell className="text-xs">{dateTime(p.latest)}</TableCell><TableCell>{duration(p.seconds)}</TableCell><TableCell className="text-[#8f959e]">{duration(p.estimated_seconds)}</TableCell></TableRow>)}</TableBody></Table>}
      {tab === "functions" && <>{functionTable(functions)}<p className="text-xs text-[#8f959e]">使用人天：每人每天使用该页面计1次。操作记录可能包含自动保存，不等于主动点击次数；未出现的功能不能直接判断为无人使用。</p></>}
      {tab !== "details" && !busy && !(tab === "people" ? people.length : functions.length) && <p className="py-20 text-center text-[#8f959e]">当前范围内暂无统计记录</p>}
      {tab === "details" && <Details key={reload} filters={filters} />}
    </section>
    <p className="text-xs text-[#8f959e]">有效时长来自活跃心跳，同一人的重叠时段合并；额外估算仅展示心跳未覆盖的访问/操作后最多5分钟，不计入有效时长。</p>
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}><DialogContent className="left-auto right-0 top-0 h-full max-h-screen w-[min(900px,95vw)] max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none" initialFocus={false}><DialogHeader><DialogTitle>{selected?.name} · 使用详情</DialogTitle></DialogHeader>
      {selected?.id ? <>{detailError ? <p role="alert">人员详情加载失败，请关闭后重试。</p> : personData ? functionTable(personData.functions) : <p>加载中…</p>}<Button variant="outline" onClick={() => { update("account_id", selected.id!); setTab("details") }}>查看此人的操作明细</Button></> : selected && <><div className="flex flex-wrap gap-2">{drawerData?.functions.find(f => f.name === selected.name)?.actions.map(a => <span key={a.name} className="rounded border px-3 py-2">{a.name}：{a.count}</span>)}</div><p className="text-xs text-[#8f959e]">使用人员：{drawerData?.people.filter(p => drawerData.functions.find(f => f.name === selected.name)?.account_ids.includes(p.account_id)).map(p => p.owner).join("、") || "未采集到记录"}</p><Details filters={detailFilters} pageName={selected.name} /></>}
    </DialogContent></Dialog>
  </div>
}
