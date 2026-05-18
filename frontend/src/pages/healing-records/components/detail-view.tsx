import { useState, useRef, useEffect, useCallback } from "react"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { uploadApi, visitApi, type Customer, type Material, type VisitRecord } from "@/lib/api"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { X, Upload, Edit, Trash2, FileText, Film } from "lucide-react"
import { PaginationBar } from "@/components/pagination-bar"

interface SearchResult {
  id: string
  nickname: string
  name: string
  member_type: string
}

interface HealingRec {
  id: string
  customer_id: string
  customer_name: string
  date: string
  title: string
  growth_record: string
  teacher: string
  materials: Material[]
  created_at: string
  updated_at: string
}

interface DetailData {
  customer: Customer
  purchase_summary: { type: string; name: string; total_purchased: number; total_amount: number; used: number | string; remaining: number | string; effective_date: string; expiry_date: string }[]
  activities: { type: string; date: string; name: string; role: string; host: string; is_public_welfare?: boolean }[]
  healing_records: HealingRec[]
  payment_records: { type: string; name: string; quantity: number; amount: number; effective_date: string; expiry_date: string; closer_name: string }[]
}

const API = "http://127.0.0.1:8000"

export default function DetailView({
  selectedCustomerId,
  onClearSelection,
  hideSearch = false,
}: {
  selectedCustomerId: string | null
  onClearSelection: () => void
  hideSearch?: boolean
}) {
  const [keyword, setKeyword] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRec, setEditingRec] = useState<HealingRec | null>(null)
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [activeTab, setActiveTab] = useState<"activities" | "healing" | "payment">("activities")
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [healingPage, setHealingPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const skipSearchRef = useRef(false)

  useEffect(() => { visitApi.list().then(setVisits).catch(() => {}) }, [])
  // 客户到店日期集合（用于标记未参加活动）
  const arrivedDates = new Set(visits.filter(v => v.customer_id === detail?.customer?.id && v.arrived).map(v => v.visit_date))

  // 搜索防抖用 effect
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      setResults([])
      return
    }
    if (!keyword.trim()) {
      setResults([])
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(
          `${API}/api/healing-records/search-customers?q=${encodeURIComponent(keyword.trim())}`,
          { signal: ctrl.signal }
        )
        if (r.ok) {
          const data = await r.json()
          setResults(data)
        }
      } catch (e: any) {
        if (e.name !== "AbortError") console.error(e)
      }
    }, 300)
    return () => { clearTimeout(timer); ctrl.abort() }
  }, [keyword])

  const loadDetail = useCallback(async (cid: string) => {
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/customer-detail/${cid}`)
      if (!res.ok) return
      setDetail(await res.json())
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (selectedCustomerId) loadDetail(selectedCustomerId) }, [selectedCustomerId, loadDetail])

  const onSelect = (r: SearchResult) => {
    skipSearchRef.current = true
    setKeyword(r.nickname || r.name)
    setResults([])
    loadDetail(r.id)
  }

  const onClear = () => { setDetail(null); setKeyword(""); setResults([]); onClearSelection() }

  const refresh = () => { if (detail) loadDetail(detail.customer.id) }

  const saveRec = async (data: any) => {
    const url = editingRec ? `${API}/api/healing-records/${editingRec.id}` : `${API}/api/healing-records`
    const method = editingRec ? "PATCH" : "POST"
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    setFormOpen(false)
    setEditingRec(null)
    refresh()
  }

  const delRec = async (id: string) => {
    if (!confirm("确认删除？")) return
    await fetch(`${API}/api/healing-records/${id}`, { method: "DELETE" })
    refresh()
  }

  const bar = (
    <div className="flex items-center gap-4">
      <div className="relative w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8f959e]" />
        <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="搜索用户昵称或姓名" className="h-8 pl-8 text-[12px]" />
        {results.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white border border-[#dee0e3] rounded-md shadow-lg z-50 mt-1">
            {results.map(r => (
              <button key={r.id} className="w-full px-3 py-2 text-left text-[12px] hover:bg-[#f7f8fa] flex items-center gap-2 border-b border-[#f0f0f0] last:border-b-0" onClick={() => onSelect(r)}>
                <span className="text-[#2b2f36] font-medium">{r.nickname || r.name}</span>
                {r.member_type && <span className="text-[12px] text-[#8f959e]">({r.member_type})</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      {detail && (
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#4e535a]">当前: <b className="text-[#2b2f36]">{detail.customer.nickname || detail.customer.name}</b></span>
          <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={onClear}>清除</Button>
        </div>
      )}
    </div>
  )

  // 未选择客户
  if (!selectedCustomerId && !hideSearch) {
    return (
      <div className="space-y-2">
        {bar}
        <div className="py-20 text-center text-[12px] text-muted-foreground">请选择客户</div>
      </div>
    )
  }
  if (!selectedCustomerId && hideSearch) {
    return <div className="bg-white rounded-lg py-20 text-center text-[12px] text-muted-foreground">搜索用户以查看详细档案</div>
  }

  if (loading || !detail) {
    return <div className="py-16 text-center text-[12px] text-muted-foreground">加载中...</div>
  }

  const c = detail.customer
  const firstVisit = c.created_at ? new Date(c.created_at).toLocaleDateString("zh-CN") : ""

  return (
    <div className={hideSearch ? "p-2" : "space-y-2"}>
      {!hideSearch && bar}

      {/* 基本信息 */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-3 border-b"><h3 className="text-[12px] font-medium text-[#2b2f36]">基本信息</h3></div>
        <div className="p-4 grid grid-cols-3 gap-y-3 gap-x-6">
          {[["昵称",c.nickname],["姓名",c.name],["年龄",c.age],["身份",c.member_type],["电话",c.phone],["微信",c.wechat],["初次到访",firstVisit],["到店次数",String(c.visit_count)],["引流人",c.referrer],["来源",c.traffic_source]].map(([l,v])=>(
            <div key={l} className="flex items-baseline gap-2">
              <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{l}</span>
              <span className="text-[12px] text-[#2b2f36]">{v||"-"}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 购买汇总 */}
      {detail!.purchase_summary.length > 0 && (() => {
        // 合并会员活动数据
        const memberCards = detail!.purchase_summary.filter(s => s.type === "会员活动")
        const otherItems = detail!.purchase_summary.filter(s => s.type !== "会员活动")

        return (
          <div className="bg-white rounded-lg">
            <div className="px-4 pt-2.5 border-t border-[#f0f0f0]" />
            <div className="px-4 pb-4 space-y-3">
              {memberCards.length > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">会员活动</span>
                  <span className="text-[12px] text-[#2b2f36]">
                    {memberCards.map((card, idx) => (
                      <span key={idx} className="inline-flex items-baseline gap-2">
                        {idx > 0 && <span className="text-[#8f959e] ml-1">丨</span>}
                        <span>{card.name}</span>
                        <span>{card.remaining === "不限" ? "不限次" : (typeof card.remaining === "number" && card.remaining < 0 ? <span className="text-[#c4506a]">剩余{card.remaining}次/共{card.total_purchased}次</span> : `剩余${card.remaining}次/共${card.total_purchased}次`)}</span>
                        <span>{card.effective_date || "-"}~{card.expiry_date || "不限"}</span>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {otherItems.map((s, i) => (
                <div key={i} className="flex items-baseline gap-2">
                  <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{s.type}</span>
                  {s.type === "内部课程" && (
                    <span className="inline-flex items-baseline gap-2">
                      <span className="text-[12px] text-[#2b2f36]">{s.name}</span>
                      <span className="text-[12px] text-[#2b2f36]">{s.effective_date || "-"}/{s.expiry_date || "-"}</span>
                    </span>
                  )}
                  {(s.type === "觉醒游戏" || s.type === "情绪释放" || s.type === "能量结") && (
                    <span className="text-[12px]">{typeof s.remaining === "number" && s.remaining < 0 ? <span className="text-[#c4506a]">剩余{s.remaining}次/共{s.total_purchased}次</span> : `剩余${s.remaining}次/共${s.total_purchased}次`}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* 记录标签页 */}
      <div className="bg-white rounded-lg">
        {/* 标签页按钮 */}
        <div className="px-4 pt-2.5 flex gap-0 border-b border-[#f0f0f0]">
          {[
            { key: "activities" as const, label: "活动记录" },
            { key: "healing" as const, label: "疗愈记录" },
            { key: "payment" as const, label: "收费记录" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setActivitiesPage(1)
                setHealingPage(1)
                setPaymentPage(1)
              }}
              className={`px-3 py-2 text-[12px] transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "text-[#3370ff] border-[#3370ff]"
                  : "text-[#4e535a] border-transparent hover:text-[#2b2f36]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 标签页内容 */}
        <div className="p-4">
          {/* 活动记录 */}
          {activeTab === "activities" && (() => {
            const pageSize = 5
            const totalPages = Math.ceil(detail!.activities.length / pageSize)
            const paginatedActivities = detail!.activities.slice((activitiesPage - 1) * pageSize, activitiesPage * pageSize)
            return detail!.activities.length===0 ? <div className="text-[12px] text-[#8f959e] text-center py-6">暂无</div> : (
              <div>
                <Table className="border-b border-[#f0f0f0]"><TableHeader><TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">日期</TableHead><TableHead>活动名称</TableHead><TableHead>角色</TableHead><TableHead>课程老师</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedActivities.map((a, i) => {
                    const notArrived = !arrivedDates.has(a.date)
                    return (
                      <TableRow key={i}>
                        <TableCell className="pl-4 text-[12px]">
                          {a.date}
                          {notArrived && <span className="text-[#8f959e] bg-[#f0f0f0] px-1 py-0.5 rounded ml-1.5 text-[11px]">未参加</span>}
                        </TableCell>
                        <TableCell className="text-[12px]">
                          {a.is_public_welfare && <span className="text-[#8f959e] bg-[#f0f0f0] px-1 py-0.5 rounded mr-1.5 text-[11px]">公益</span>}
                          {a.name || "-"}
                        </TableCell>
                        <TableCell className="text-[12px]">{a.role}</TableCell>
                        <TableCell className="text-[12px]">{a.host || "-"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody></Table>
                {totalPages > 1 && (
                  <div className="px-4 py-2">
                    <PaginationBar currentPage={activitiesPage} totalPages={totalPages} totalItems={detail!.activities.length} startIndex={(activitiesPage-1)*pageSize+1} endIndex={Math.min(activitiesPage*pageSize, detail!.activities.length)} onPageChange={setActivitiesPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 疗愈记录 */}
          {activeTab === "healing" && (() => {
            const pageSize = 5
            const totalPages = Math.ceil(detail!.healing_records.length / pageSize)
            const paginatedRecords = detail!.healing_records.slice((healingPage - 1) * pageSize, healingPage * pageSize)
            return detail!.healing_records.length===0 ? <p className="text-[12px] text-[#8f959e] text-center py-6">暂无疗愈记录</p> : (
              <div>
                <div className="space-y-3">
                  {paginatedRecords.map(r=>(
                    <div key={r.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#8f959e]">{r.date}</span>
                          <span className="text-[12px] text-[#2b2f36] font-medium">{r.title}</span>
                          {r.teacher && <span className="text-[12px] text-[#4e535a]">老师: {r.teacher}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={()=>{setEditingRec(r);setFormOpen(true)}}><Edit className="h-3.5 w-3.5"/></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={()=>delRec(r.id)}><Trash2 className="h-3.5 w-3.5 text-destructive"/></Button>
                        </div>
                      </div>
                      {r.growth_record && <p className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{r.growth_record}</p>}
                      {r.materials?.length>0 && <div className="flex flex-wrap gap-2">{r.materials.map(m=>(
                        <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 rounded bg-[#f5f6f7] text-[12px] text-[#4e535a] hover:bg-[#eff0f1]">
                          {m.name.match(/\.(mp4|mov|avi|mkv)$/i)?<Film className="h-3 w-3"/>:<FileText className="h-3 w-3"/>}{m.name}
                        </a>
                      ))}</div>}
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-3 pt-3">
                    <PaginationBar currentPage={healingPage} totalPages={totalPages} totalItems={detail!.healing_records.length} startIndex={(healingPage-1)*pageSize+1} endIndex={Math.min(healingPage*pageSize, detail!.healing_records.length)} onPageChange={setHealingPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 收费记录 */}
          {activeTab === "payment" && (() => {
            const pageSize = 5
            const totalPages = Math.ceil(detail!.payment_records.length / pageSize)
            const paginatedRecords = detail!.payment_records.slice((paymentPage - 1) * pageSize, paymentPage * pageSize)
            return detail!.payment_records.length===0 ? <div className="text-[12px] text-[#8f959e] text-center py-6">暂无</div> : (
              <div>
                <Table className="border-b border-[#f0f0f0]"><TableHeader><TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">类型</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>生效日期</TableHead>
                  <TableHead>到期日期</TableHead>
                  <TableHead>成交人</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedRecords.map((r,i)=>(
                    <TableRow key={i}>
                      <TableCell className="pl-4 text-[12px]">{r.type}</TableCell>
                      <TableCell className="text-[12px]">{r.name || "-"}</TableCell>
                      <TableCell className="text-[12px]">{r.quantity}</TableCell>
                      <TableCell className="text-[12px]">¥{r.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-[12px]">{r.effective_date || "-"}</TableCell>
                      <TableCell className="text-[12px]">{r.expiry_date || (r.type === "会员活动" ? "不限" : "-")}</TableCell>
                      <TableCell className="text-[12px]">{r.closer_name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody></Table>
                {totalPages > 1 && (
                  <div className="px-4 py-2">
                    <PaginationBar currentPage={paymentPage} totalPages={totalPages} totalItems={detail!.payment_records.length} startIndex={(paymentPage-1)*pageSize+1} endIndex={Math.min(paymentPage*pageSize, detail!.payment_records.length)} onPageChange={setPaymentPage} />
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>

      {/* 基础信息 */}
      <div className="bg-white rounded-lg">
        <div className="px-4 py-3 border-b">
          <h3 className="text-[12px] font-medium text-[#2b2f36]">基础信息 / 评估 / 标签</h3>
        </div>
        <div className="p-4 space-y-4">
          {[["基础信息",c.basic_info],["客户评估",c.assessment],["客户标签",c.tags]].map(([l,v])=>(
            <div key={l}><span className="text-[12px] text-[#8f959e] tracking-widest">{l}</span><p className="text-[12px] text-[#4e535a] mt-1 whitespace-pre-wrap">{v||"-"}</p></div>
          ))}
        </div>
      </div>

      {/* 弹窗 */}
      <RecordForm open={formOpen} onOpenChange={setFormOpen} rec={editingRec} cid={c.id} cname={c.nickname||c.name} onSave={saveRec}/>
    </div>
  )
}

// RecordForm 组件
function RecordForm({
  open, onOpenChange, rec, cid, cname, onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rec: HealingRec | null
  cid: string
  cname: string
  onSave: (data: any) => void
}) {
  const [date, setDate] = useState(rec?.date || "")
  const [title, setTitle] = useState(rec?.title || "")
  const [teacher, setTeacher] = useState(rec?.teacher || "")
  const [growth, setGrowth] = useState(rec?.growth_record || "")
  const [mats, setMats] = useState<Material[]>(rec?.materials || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // 老师搜索
  const [, setTeacherKeyword] = useState("")
  const [teacherResults, setTeacherResults] = useState<{ id: string; nickname: string; name: string }[]>([])
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false)
  const teacherTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const doSearchTeachers = useCallback(async (q: string) => {
    try {
      const res = await fetch(`${API}/api/customers?keyword=${encodeURIComponent(q)}`)
      if (res.ok) {
        const data = await res.json()
        setTeacherResults(data.slice(0, 5))
        setShowTeacherDropdown(true)
      }
    } catch {}
  }, [])

  const onTeacherInput = (val: string) => {
    setTeacher(val)
    setTeacherKeyword(val)
    if (teacherTimerRef.current) clearTimeout(teacherTimerRef.current)
    if (!val.trim()) { setTeacherResults([]); setShowTeacherDropdown(false); return }
    teacherTimerRef.current = setTimeout(() => doSearchTeachers(val.trim()), 300)
  }

  useEffect(() => { if (rec) { setDate(rec.date); setTitle(rec.title); setTeacher(rec.teacher || ""); setGrowth(rec.growth_record || ""); setMats(rec.materials || []) } }, [rec])

  useEffect(() => {
    const handleClickOutside = () => setShowTeacherDropdown(false)
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSave = () => {
    if (!date || !title.trim()) return
    onSave({
      customer_id: cid,
      customer_name: cname,
      date, title,
      teacher,
      growth_record: growth,
      materials: mats.map(m => ({ id: m.id, name: m.name, url: m.url })),
    })
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const results = await Promise.all(Array.from(files).map(f => uploadApi.uploadMaterial(f)))
      setMats(prev => [...prev, ...results])
    } catch (err) { console.error(err) }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] p-0 gap-0">
        <div className="px-5 py-3 border-b border-[#f0f0f0]">
          <h3 className="text-[12px] font-normal">{rec ? "编辑" : "新增"}疗愈记录</h3>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">日期</span>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">标题</span>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="记录标题" className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-2 relative">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">老师</span>
            <div className="relative">
              <Input
                value={teacher}
                onChange={e => onTeacherInput(e.target.value)}
                onFocus={() => { if (teacherResults.length > 0) setShowTeacherDropdown(true) }}
                placeholder="搜索选择"
                className="h-8 text-[12px]"
              />
              {showTeacherDropdown && teacherResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 bg-white border border-[#dee0e3] rounded-md shadow-lg z-50 mt-1">
                  {teacherResults.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-[12px] hover:bg-[#f7f8fa] border-b border-[#f0f0f0] last:border-b-0"
                      onClick={() => { setTeacher(t.nickname || t.name); setTeacherKeyword(""); setTeacherResults([]); setShowTeacherDropdown(false) }}
                    >
                      {t.nickname || t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[56px_1fr] items-start gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2">成长记录</span>
            <Textarea value={growth} onChange={e => setGrowth(e.target.value)} rows={4} className="text-[12px] resize-none" />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-start gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-1">附件</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleUpload} />
              <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload className="h-3 w-3 mr-1" />{uploading ? "上传中..." : "上传"}
              </Button>
              {mats.map(m => (
                <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#f5f6f7] text-[12px] text-[#4e535a]">{m.name}<button onClick={() => setMats(p => p.filter(x => x.id !== m.id))}><X className="h-3 w-3 hover:text-[#c4506a]" /></button></span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSave}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}