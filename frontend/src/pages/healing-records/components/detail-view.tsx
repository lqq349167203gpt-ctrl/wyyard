import { useState, useRef, useEffect, useCallback } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { uploadApi, customerApi, healingRecordApi, customerDetailApi, communicationRecordApi, type Customer, type CustomerLight, type Material, type CustomerDetail, type CommunicationRecord, type ActivityRecord } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { X, Upload, Copy, Inbox } from "lucide-react"
import { PaginationBar } from "@/components/pagination-bar"

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

/** 空值占位：极淡极短圆角小横（4×2），复用于档案字段 / 联系方式 / 跟进点等所有无信息位置 */
const DvEmpty = ({ className = "" }: { className?: string }) => (
  <span className={`inline-block align-middle h-[2px] w-[4px] rounded-full bg-[#e5e8eb] shrink-0 ${className}`} />
)


export default function DetailView({
  selectedCustomerId,
  onClearSelection,
  hideSearch = false,
  defaultTab = "healing",
}: {
  selectedCustomerId: string | null
  onClearSelection: () => void
  hideSearch?: boolean
  defaultTab?: "activities" | "healing" | "payment" | "purchase"
}) {
  const [customerList, setCustomerList] = useState<CustomerLight[]>([])
  const [searchValue, setSearchValue] = useState("")
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRec, setEditingRec] = useState<HealingRec | null>(null)
  const [activeTab, setActiveTab] = useState<"activities" | "healing" | "communication" | "followups" | "payment" | "purchase">(defaultTab)
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [healingPage, setHealingPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const [purchasePage, setPurchasePage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [commRecords, setCommRecords] = useState<CommunicationRecord[]>([])
  const [commPage, setCommPage] = useState(1)
  const [followupsPage, setFollowupsPage] = useState(1)
  const loadSeqRef = useRef(0)

  useEffect(() => { customerApi.clearLightCache(); customerApi.light().then(setCustomerList).catch(() => {}) }, [])
  // 客户到店日期集合（用于标记未参加活动）
  const arrivedDates = new Set((detail?.visit_records || []).filter(v => v.arrived).map(v => v.visit_date))

  const loadDetail = useCallback(async (cid: string) => {
    const seq = ++loadSeqRef.current
    setLoading(true)
    setLoadError(null)
    setCopied(false)
    setActivitiesPage(1); setHealingPage(1); setPaymentPage(1); setPurchasePage(1); setFollowupsPage(1)
    try {
      const data = await customerDetailApi.get(cid)
      if (seq !== loadSeqRef.current) return
      setDetail(data)
      // 加载沟通记录
      const nickname = data.customer?.nickname
      if (nickname) {
        communicationRecordApi.list(nickname).then(setCommRecords).catch(() => setCommRecords([]))
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return
      setLoadError("加载失败，请重试")
      console.error(e)
    } finally {
      if (seq === loadSeqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => { if (selectedCustomerId) loadDetail(selectedCustomerId) }, [selectedCustomerId, loadDetail])

  const onClear = () => { setDetail(null); setSearchValue(""); onClearSelection() }

  const refresh = () => { if (detail) loadDetail(detail.customer.id) }

  const saveRec = async (data: any) => {
    if (saving) return
    setSaving(true)
    try {
      if (editingRec) {
        await healingRecordApi.update(editingRec.id, data)
      } else {
        await healingRecordApi.create(data)
      }
      setFormOpen(false)
      setEditingRec(null)
      refresh()
    } catch (e) {
      alert("保存失败：" + (e instanceof Error ? e.message : "未知错误"))
    } finally {
      setSaving(false)
    }
  }

  const bar = (
    <div className="flex items-center gap-4">
      <div className="w-[300px]">
        <CustomerSearchInput
          customers={customerList}
          value={searchValue}
          onChange={(v) => setSearchValue(v as string)}
          onSelectItem={(customer) => { loadDetail(customer.id) }}
          placeholder="搜索用户昵称或姓名"
        />
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

  if (loading || (!detail && !loadError)) {
    return <div className="py-16 text-center text-[12px] text-muted-foreground">加载中...</div>
  }
  if (loadError) {
    return (
      <div className="py-16 text-center space-y-2">
        <p className="text-[12px] text-[#c4506a]">{loadError}</p>
        <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => selectedCustomerId && loadDetail(selectedCustomerId)}>重试</Button>
      </div>
    )
  }

  if (!detail) return null

  const c = detail.customer
  const arrivedRecords = (detail?.visit_records || []).filter(v => v.arrived).sort((a, b) => a.visit_date.localeCompare(b.visit_date))
  const firstVisit = arrivedRecords.length > 0 ? arrivedRecords[0].visit_date : ""
  // 指标：参与活动场数 = 活动日期属于已到店日期集合的场数；消费额 = 未退费交易求和
  const arrivedActivityCount = (detail?.activities || []).filter(a => arrivedDates.has(a.date)).length
  const totalSpend = (detail?.payment_records || []).filter(g => !g.voided).reduce((sum, g) => sum + g.amount, 0)
  const workInfo = c.work_status ? `${c.work_status}${c.work_description ? ` · ${c.work_description}` : ""}` : (c.work_description || "")
  const archiveFields: [string, string][] = [
    ["到访目的", c.tags || ""],
    ["创伤经历", c.basic_info || ""],
    ["当下卡点", c.assessment || ""],
    ["工作情况", workInfo],
    ["其他信息", c.other_info || ""],
  ]
  const todayStr = new Date().toLocaleDateString("sv-SE")
  // 次数余量摘要：余量为 0 或已过期的项目不显示；内部课程按不限次展示
  const remainSummary = (detail?.purchase_summary || [])
    .filter(s => !(typeof s.remaining === "number" && s.remaining === 0))
    .filter(s => !s.expiry_date || s.expiry_date >= todayStr)
    .slice(0, 4)
  const trafficLabel = c.traffic_source === "朋友圈" ? "所属人" : c.traffic_source === "好友推荐" ? "好友昵称" : "流量链接"


  return (
    <div className={hideSearch ? "dv-root antialiased bg-[#f4f5f6] p-2 h-[90vh] flex flex-col gap-3" : "dv-root antialiased bg-[#f4f5f6] h-[calc(100vh-70px)] flex flex-col gap-3"}>
      <style>{`
        .dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }
        .dv-scroll { scrollbar-width: thin; scrollbar-color: rgba(33,38,49,.14) transparent; }
        .dv-scroll::-webkit-scrollbar { width: 5px; }
        .dv-scroll::-webkit-scrollbar-track { background: transparent; }
        .dv-scroll::-webkit-scrollbar-thumb { background: rgba(33,38,49,.12); border-radius: 999px; }
        .dv-scroll:hover::-webkit-scrollbar-thumb { background: rgba(33,38,49,.24); }
      `}</style>
      {!hideSearch && bar}

      <div className="flex-1 min-h-0 flex gap-3">
        {/* 左栏：身份档案（整栏独立滚动） */}
        <aside className="w-[300px] shrink-0 min-h-0 overflow-y-auto dv-scroll flex flex-col gap-2.5 pr-[3px]">
          {/* 身份块 */}
          <div className="bg-white rounded-[14px] shadow-[0_2px_4px_rgba(33,38,49,.05)] px-4 pt-[17px] pb-[13px] shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-[46px] h-[46px] rounded-full bg-[#eef0f2] text-[#79838f] text-[18px] font-bold flex items-center justify-center shrink-0">
                {(c.nickname || c.name || "客").charAt(0)}
              </div>
              <div className="min-w-0">
                <div className="text-[17px] font-extrabold leading-[1.3] text-[#212631] truncate">{c.nickname || <span className="text-[#d0d3d6]">-</span>}</div>
                <div className="mt-0.5 text-[12px] text-[#79838f] truncate">
                  {(() => {
                    const parts: React.ReactNode[] = []
                    if (c.name) parts.push(<b key="n" className="text-[#212631] font-semibold">{c.name}</b>)
                    if (c.gender) parts.push(c.gender)
                    if (c.age) parts.push(`${c.age} 岁`)
                    return parts.length > 0
                      ? parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)
                      : <span className="text-[#d0d3d6]">-</span>
                  })()}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-[5px] mt-2.5">
              {c.member_type && (
                <span className="px-[9px] py-[2px] rounded-full text-[11px] font-semibold bg-[#ffe8d9] text-[#c25a1b]">{c.member_type}</span>
              )}
              {c.follow_up_status && (
                <span className="rounded-[4px] bg-[#f2f3f5] px-[9px] py-[2px] text-[11px] font-normal text-[#4e535a]">
                  {c.follow_up_status}
                </span>
              )}
              {c.service_teacher ? (
                <span className="px-[9px] py-[2px] rounded-full text-[11px] font-semibold bg-[#e0ebff] text-[#2f5cc4]">服务老师 · {c.service_teacher}</span>
              ) : (
                <span className="px-[9px] py-[2px] rounded-full text-[11px] font-semibold bg-[#f1f0ed] text-[#a8b1bd]">服务老师 -</span>
              )}
            </div>
            {/* 指标：累计到店 → 参与活动 → 累计消费（.stat 左对齐，padding 9/12/8） */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="bg-[#212631] rounded-[10px] px-3 pt-[9px] pb-2">
                <div className="text-[#a3c0ff] text-[14px] font-extrabold leading-[1.25] tabular-nums">{c.visit_count}<span className="text-[10.5px] font-semibold"> 次</span></div>
                <div className="text-[#a8b1bd] text-[10.5px] mt-px">累计到店</div>
              </div>
              <div className="bg-[#212631] rounded-[10px] px-3 pt-[9px] pb-2">
                <div className="text-[#a3c0ff] text-[14px] font-extrabold leading-[1.25] tabular-nums">{arrivedActivityCount}<span className="text-[10.5px] font-semibold"> 场</span></div>
                <div className="text-[#a8b1bd] text-[10.5px] mt-px">参与活动</div>
              </div>
              <div className="bg-[#212631] rounded-[10px] px-3 pt-[9px] pb-2">
                <div className="text-[#a3c0ff] text-[14px] font-extrabold leading-[1.25] tabular-nums">¥{totalSpend.toLocaleString()}</div>
                <div className="text-[#a8b1bd] text-[10.5px] mt-px">累计消费</div>
              </div>
            </div>
            <div className="mt-[11px] pt-[9px] border-t border-dashed border-[#eceef0] flex items-baseline justify-between text-[11.5px] text-[#a8b1bd]">
              <span>首次到访</span>
              <b className="text-[#212631] font-semibold tabular-nums">{firstVisit || "-"}</b>
            </div>
          </div>

          {/* 联系与来源 */}
          <div className="bg-white rounded-[14px] shadow-[0_2px_4px_rgba(33,38,49,.05)] px-4 py-3 shrink-0">
            <h3 className="text-[12.5px] font-bold text-[#212631] mb-0.5">联系与来源</h3>
            {([["电话", c.phone], ["微信", c.wechat], ["引流人", c.referrer], ["承接人", c.referrer_handler], ["流量来源", c.traffic_source]] as [string, React.ReactNode][]).map(([l, v]) => (
              <div key={l} className="flex items-center justify-between gap-2.5 py-[6px] border-b border-[#f3f4f5] text-[12px]">
                <span className="text-[#a8b1bd] shrink-0">{l}</span>
                <span className="text-[#212631] font-medium text-right truncate">{v || <DvEmpty />}</span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2.5 py-[6px] text-[12px]">
              <span className="text-[#a8b1bd] shrink-0">{trafficLabel}</span>
              {c.traffic_source_detail ? (
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[#2f5cc4] truncate max-w-[106px]" title={c.traffic_source_detail}>{c.traffic_source_detail}</span>
                  <button
                    className="shrink-0 flex items-center gap-1 border border-[#e3e6e9] bg-[#f8f9fa] text-[#79838f] hover:text-[#212631] hover:bg-[#eef0f2] text-[10.5px] px-[7px] py-px rounded-md"
                    onClick={() => { navigator.clipboard.writeText(c.traffic_source_detail); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  >
                    <Copy className="h-3 w-3" />{copied ? "已复制" : "复制"}
                  </button>
                </span>
              ) : (
                <DvEmpty />
              )}
            </div>
          </div>

          {/* 次数余量摘要卡：填充左栏剩余空间，无数据时整卡隐藏 */}
          {remainSummary.length > 0 && (
            <div className="bg-white rounded-[14px] shadow-[0_2px_4px_rgba(33,38,49,.05)] px-4 pt-3 pb-[13px] flex-1">
              <h3 className="text-[12.5px] font-bold text-[#212631] mb-0.5">次数余量</h3>
              {remainSummary.map((s, i) => {
                const unlimited = s.remaining === "不限" || s.total_purchased === "不限" || s.type === "内部课程"
                return (
                <div key={i} className="pt-[7px] pb-[9px] border-b border-[#f3f4f5] last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2 mb-[5px] text-[12px]">
                    <span className="font-semibold text-[#212631] truncate" title={s.name || s.type}>{s.name || s.type}</span>
                    <span className="tabular-nums text-[#79838f] text-[11px] shrink-0">
                      {unlimited
                        ? <><b className="text-[13px] font-extrabold text-[#212631]">∞</b> 不限次</>
                        : <>剩余 <b className={`text-[13px] font-extrabold ${typeof s.remaining === "number" && s.remaining <= 1 ? "text-[#f08a3c]" : "text-[#212631]"}`}>{typeof s.remaining === "number" ? Math.max(0, s.remaining) : s.remaining}</b> / {s.total_purchased}</>
                      }
                    </span>
                  </div>
                  {unlimited ? (
                    <div className="h-[5px] rounded-full bg-[#3370ff]" />
                  ) : (
                    typeof s.remaining === "number" && typeof s.total_purchased === "number" && s.total_purchased > 0 && (
                      <div className="h-[5px] rounded-full bg-[#eef0f2] overflow-hidden">
                        <i
                          className={`block h-full rounded-full ${s.remaining <= 1 ? "bg-[#f08a3c]" : "bg-[#212631]"}`}
                          style={{ width: `${Math.min(100, Math.max(0, s.remaining) / s.total_purchased * 100)}%` }}
                        />
                      </div>
                    )
                  )}
                  {s.expiry_date && (
                    <div className="mt-[5px] text-[10.5px] tabular-nums text-[#a8b1bd]">{s.expiry_date} 到期</div>
                  )}
                </div>
                )
              })}
              <div className="mt-[9px] pt-2 border-t border-dashed border-[#eceef0] text-[10.5px] text-[#a8b1bd]">详细见剩余次数 tab</div>
            </div>
          )}
        </aside>

        {/* 右栏：上档案 + 下记录 */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col gap-3">
          {/* 核心档案区：5 个字段全宽行式，高度随内容自适应、封顶 260px，单字段 4 行行内滚动 */}
          <section className="shrink-0 max-h-[260px] bg-white rounded-[14px] shadow-[0_2px_4px_rgba(33,38,49,.05)] px-[18px] py-1 overflow-y-auto dv-scroll">
            {archiveFields.map(([label, value]) => (
              <div key={label} className="flex gap-[14px] py-2.5 border-b border-[rgba(33,38,49,0.06)] last:border-b-0">
                <span className="w-[64px] shrink-0 text-[12px] font-semibold text-[#a8b1bd] pt-px">{label}</span>
                {value ? (
                  <p className="flex-1 min-w-0 text-[12.5px] leading-[1.6] text-[#3a4150] whitespace-pre-wrap max-h-[88px] overflow-y-auto dv-scroll pr-[5px]">{value}</p>
                ) : (
                  <span className="flex-1 min-w-0 flex items-center"><DvEmpty /></span>
                )}
              </div>
            ))}
          </section>


          {/* 记录区 */}
          <div className="flex-1 min-h-0 bg-white rounded-[14px] shadow-[0_2px_4px_rgba(33,38,49,.05)] px-5 pb-2.5 flex flex-col overflow-hidden">
            {/* 标签页按钮：选中态青柠下划线 */}
            <div className="flex gap-[2px] border-b border-[#eef0f1] shrink-0">
              {[
                { key: "healing" as const, label: "跟进点", cnt: (detail?.visit_records || []).length },
                { key: "communication" as const, label: "沟通记录", cnt: commRecords.length },
                { key: "activities" as const, label: "活动记录", cnt: (detail?.activities || []).length },
                { key: "followups" as const, label: "用户回访", cnt: (detail?.activity_followups || []).length },
                { key: "purchase" as const, label: "剩余次数", cnt: null as number | null },
                { key: "payment" as const, label: "交易记录", cnt: (detail?.payment_records || []).length },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key as any)
                    setActivitiesPage(1)
                    setHealingPage(1)
                    setPaymentPage(1)
                    setPurchasePage(1)
                    setFollowupsPage(1)
                  }}
                  className={`relative px-3.5 pt-3 pb-2.5 text-[13px] whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? "text-[#212631] font-bold"
                      : "text-[#79838f] font-semibold hover:text-[#212631]"
                  }`}
                >
                  {tab.label}
                  {typeof tab.cnt === "number" && (
                    <span className="ml-[3px] text-[10.5px] font-medium text-[#a8b1bd] tabular-nums">{tab.cnt}</span>
                  )}
                  {activeTab === tab.key && (
                    <span className="absolute left-3.5 right-3.5 -bottom-px h-[3px] rounded-t-[3px] bg-[#3370ff]" />
                  )}
                </button>
              ))}
            </div>

            {/* 标签页内容：内部滚动 */}
            <div className="flex-1 min-h-0 overflow-y-auto dv-scroll pt-3 pb-4">
          {/* 跟进点 */}
          {activeTab === "healing" && (() => {
            const records = (detail?.visit_records || []).sort((a, b) => b.visit_date.localeCompare(a.visit_date))
            const pageSize = 8
            const totalPages = Math.ceil(records.length / pageSize)
            const paginatedRecords = records.slice((healingPage - 1) * pageSize, healingPage * pageSize)
            return records.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div>
            ) : (
              <div>
                {paginatedRecords.map((v) => (
                  <div key={v.id} className="bg-[#fafbfc] border border-[#eef0f1] rounded-[10px] px-3.5 py-2.5 mb-[9px] last:mb-0">
                    <div className="flex items-center gap-[9px] mb-[7px]">
                      <span className="text-[12.5px] font-bold text-[#212631] tabular-nums">{(() => { const [y, m, d] = v.visit_date.split("-"); return `${y}/${parseInt(m)}/${parseInt(d)}` })()}{v.arrival_time && ` ${v.arrival_time}`}</span>
                      {v.arrived ? (
                        <span className="text-[10.5px] font-semibold text-[#157a3c] bg-[#dcf5e4] px-2 py-px rounded-full">已到店</span>
                      ) : (
                        <span className="text-[10.5px] font-semibold text-[#79838f] bg-[#f1f0ed] px-2 py-px rounded-full">未到店</span>
                      )}
                    </div>
                    <div className="grid grid-cols-[84px_1fr] gap-y-1 gap-x-3">
                      <span className="text-[12px] text-[#a8b1bd] pt-px">当日需求</span>
                      <p className="text-[12px] leading-[1.55] text-[#3a4150] whitespace-pre-wrap">{v.needs || <DvEmpty />}</p>
                      <span className="text-[12px] text-[#a8b1bd] pt-px">组长反馈</span>
                      <p className="text-[12px] leading-[1.55] text-[#3a4150] whitespace-pre-wrap">{v.group_leader_feedback || <DvEmpty />}</p>
                      {(() => {
                        const hr = detail?.healing_records.find(r => r.date === v.visit_date)
                        const record = hr?.growth_record || v.healing_notes
                        return (
                          <>
                            <span className="text-[12px] text-[#a8b1bd] pt-px">跟进点</span>
                            <p className="text-[12px] leading-[1.55] whitespace-pre-wrap">
                              {record
                                ? <span className="inline text-[#212631] bg-[linear-gradient(transparent_62%,rgba(201,242,75,.55)_62%)]">{record}</span>
                                : <DvEmpty />}
                            </p>
                          </>
                        )
                      })()}
                      <span className="text-[12px] text-[#a8b1bd] pt-px">客户信息</span>
                      <p className="text-[12px] leading-[1.55] text-[#3a4150] whitespace-pre-wrap">{v.feedback || v.experience || <DvEmpty />}</p>
                    </div>
                  </div>
                ))}
                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#f0f0f0]">
                    <PaginationBar currentPage={healingPage} totalPages={totalPages} totalItems={records.length} startIndex={(healingPage-1)*pageSize+1} endIndex={Math.min(healingPage*pageSize, records.length)} onPageChange={setHealingPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 沟通记录 */}
          {activeTab === "communication" && (() => {
            const sorted = [...commRecords].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
            const pageSize = 8
            const totalPages = Math.ceil(sorted.length / pageSize)
            const paginatedRecords = sorted.slice((commPage - 1) * pageSize, commPage * pageSize)
            return sorted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div>
            ) : (
              <div>
                {paginatedRecords.map((r, idx) => {
                  const createdTime = r.created_at ? new Date(r.created_at) : null
                  const dateStr = createdTime ? `${createdTime.getFullYear()}/${createdTime.getMonth()+1}/${createdTime.getDate()}` : ""
                  const timeStr = createdTime ? ` ${createdTime.getHours().toString().padStart(2,"0")}:${createdTime.getMinutes().toString().padStart(2,"0")}` : ""
                  return (
                    <div key={r.id} className={`flex gap-3 py-2.5 ${idx > 0 ? "border-t border-[#f3f4f5]" : ""}`}>
                      <div className="w-[130px] shrink-0">
                        <div className="text-[12px] font-bold text-[#212631] tabular-nums">{dateStr}{timeStr}</div>
                        <div className="text-[12px] text-[#79838f] mt-px">{r.creator || ""}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] leading-[1.6] text-[#3a4150] whitespace-pre-wrap">{r.content}</p>
                      </div>
                    </div>
                  )
                })}
                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#f0f0f0]">
                    <PaginationBar currentPage={commPage} totalPages={totalPages} totalItems={sorted.length} startIndex={(commPage-1)*pageSize+1} endIndex={Math.min(commPage*pageSize, sorted.length)} onPageChange={setCommPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 活动记录：V2 时间线卡片（按天分组，同日多场在同一日期节点下纵向堆叠） */}
          {activeTab === "activities" && (() => {
            const activities = detail?.activities || []
            // 按日期倒序分组：同一天的活动合并到同一个日期节点
            const dayGroups: { date: string; items: ActivityRecord[] }[] = []
            ;[...activities].sort((a, b) => b.date.localeCompare(a.date)).forEach((a) => {
              const last = dayGroups[dayGroups.length - 1]
              if (last && last.date === a.date) last.items.push(a)
              else dayGroups.push({ date: a.date, items: [a] })
            })
            const pageSize = 5 // 按天分页：每页 5 天（而非按记录条数）
            const totalPages = Math.ceil(dayGroups.length / pageSize)
            const paginatedDays = dayGroups.slice((activitiesPage - 1) * pageSize, activitiesPage * pageSize)
            // 角色 pastel 标签配色：参与者蓝 / 协助者紫 / 案主橙 / 其它角色中性
            const roleTagClass = (role: string) =>
              role === "参与者" ? "text-[#2f5cc4] bg-[#e0ebff]"
                : role === "协助者" ? "text-[#6a48d8] bg-[#ece6ff]"
                : role === "案主" ? "text-[#c25a1b] bg-[#ffe8d9]"
                : "text-[#79838f] bg-[#f1f0ed]"
            return activities.length===0 ? <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div> : (
              <div>
                <div className="relative px-4 pt-3 pb-1">
                  {/* 时间线竖轨：对齐每个日期节点圆点的圆心 */}
                  <div className="absolute left-[116px] top-6 bottom-4 w-[2px] rounded-full bg-[#eef0f2]" />
                  {paginatedDays.map((g) => {
                    const dayAbsent = !arrivedDates.has(g.date)
                    const [gy, gm, gd] = g.date.split("-")
                    const dateValid = Boolean(gy && gm && gd)
                    const dateLabel = dateValid ? `${gy}/${Number(gm)}/${Number(gd)}` : g.date
                    // 星期由前端从 date 计算（本地时区，避免 ISO 解析偏移）
                    const weekDay = dateValid ? `周${"日一二三四五六"[new Date(Number(gy), Number(gm) - 1, Number(gd)).getDay()]}` : ""
                    return (
                      <div key={g.date} className="relative flex gap-[18px] py-[7px]">
                        {/* 左侧日期栏 */}
                        <div className="w-[78px] shrink-0 pt-[12px] text-right">
                          <div className={`text-[12.5px] font-extrabold leading-[1.3] tabular-nums ${dayAbsent ? "text-[#79838f]" : "text-[#212631]"}`}>{dateLabel}</div>
                          <div className="mt-[2px] text-[10.5px] text-[#a8b1bd]">{weekDay}</div>
                          {g.items.length >= 2 && (
                            <span className="mt-[6px] inline-block whitespace-nowrap rounded-full bg-[#3370ff] px-[8px] py-[3px] text-[10px] font-bold leading-none text-white tabular-nums">当日 {g.items.length} 场</span>
                          )}
                        </div>
                        {/* 日期节点圆点：青柠＝正常参加，空心＝未参加 */}
                        <div className="relative z-[1] flex w-[40px] shrink-0 justify-center pt-[16px]">
                          <span className={`h-[10px] w-[10px] rounded-full border-[2px] border-white ${dayAbsent ? "bg-white shadow-[0_0_0_1.5px_#d5d9de]" : "bg-[#3370ff] shadow-[0_0_0_1.5px_#3370ff]"}`} />
                        </div>
                        {/* 右侧活动卡片：同日多场纵向堆叠 */}
                        <div className="flex min-w-0 flex-1 flex-col gap-[10px] -ml-1">
                          {g.items.map((a, i) => {
                            const notArrived = !arrivedDates.has(a.date)
                            return (
                              <div key={`${g.date}-${i}`} className={notArrived
                                ? "rounded-[14px] border border-dashed border-[#e8eaec] bg-[#fbfbfa] px-4 py-3"
                                : "rounded-[14px] border border-[#f0f1f3] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(33,38,49,.03)]"}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`text-[13.5px] font-bold ${notArrived ? "text-[#79838f]" : "text-[#212631]"}`}>{a.name || <span className="text-[#d0d3d6]">-</span>}</span>
                                  {a.is_public_welfare && <span className="whitespace-nowrap rounded-md bg-[#dcf5e4] px-[7px] py-[3px] text-[10px] font-semibold leading-none text-[#157a3c]">公益</span>}
                                  {notArrived && <span className="whitespace-nowrap rounded-md bg-[#f1f0ed] px-[7px] py-[3px] text-[10px] font-semibold leading-none text-[#79838f]">未参加</span>}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-x-[14px] gap-y-1 text-[11.5px] text-[#79838f]">
                                  <span className="inline-flex items-center gap-[5px]">
                                    <svg className="h-[12px] w-[12px] shrink-0 stroke-[#a8b1bd]" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                    角色
                                  </span>
                                  {a.role
                                    ? <span className={`whitespace-nowrap rounded-md px-[7px] py-[3px] text-[10px] font-semibold leading-none ${roleTagClass(a.role)}`}>{a.role}</span>
                                    : <DvEmpty />}
                                  <span className="inline-flex items-center gap-[5px]">
                                    <svg className="h-[12px] w-[12px] shrink-0 stroke-[#a8b1bd]" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                                    课程老师 · {a.host || <span className="text-[#d0d3d6]">-</span>}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#f0f0f0]">
                    <PaginationBar currentPage={activitiesPage} totalPages={totalPages} totalItems={dayGroups.length} unit="天" startIndex={(activitiesPage-1)*pageSize+1} endIndex={Math.min(activitiesPage*pageSize, dayGroups.length)} onPageChange={setActivitiesPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 用户回访：与具体活动绑定，展示提交时的活动信息快照 */}
          {activeTab === "followups" && (() => {
            const followups = [...(detail?.activity_followups || [])]
              .sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))
            const pageSize = 6
            const totalPages = Math.ceil(followups.length / pageSize)
            const paginatedRecords = followups.slice(
              (followupsPage - 1) * pageSize,
              followupsPage * pageSize,
            )
            const formatFollowupTime = (value: string) => {
              if (!value) return "-"
              const time = new Date(value)
              if (Number.isNaN(time.getTime())) return value
              return `${time.getFullYear()}/${String(time.getMonth() + 1).padStart(2, "0")}/${String(time.getDate()).padStart(2, "0")} ${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`
            }
            return followups.length === 0 ? (
              <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无用户回访</div>
            ) : (
              <div>
                <div className="divide-y divide-[#f0f1f2]">
                  {paginatedRecords.map(record => {
                    const activityTime = record.start_time
                      ? `${record.start_time}${record.end_time ? `–${record.end_time}` : ""}`
                      : ""
                    return (
                      <div key={record.id} className="px-3 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-[13px] font-medium text-[#2b2f36]">
                                {record.activity_name || "-"}
                              </span>
                              <span className="rounded-[4px] bg-[#f1f3f5] px-1.5 py-0.5 text-[12px] text-[#68717d]">
                                {record.activity_category || "活动"}
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#8f959e]">
                              <span className="tabular-nums">
                                活动时间：{record.activity_date || "-"}{activityTime ? ` ${activityTime}` : ""}
                              </span>
                              <span>老师/带领人：{record.teacher || "-"}</span>
                              <span>用户身份：{record.customer_role || "-"}</span>
                            </div>
                          </div>
                          <span className="shrink-0 text-[12px] tabular-nums text-[#a3a9b1]">
                            回访于 {formatFollowupTime(record.updated_at)}
                          </span>
                        </div>
                        <p className="mt-2 rounded-[4px] bg-[#fafafa] px-3 py-2 text-[13px] font-normal leading-[1.65] text-[#3d444d] whitespace-pre-wrap break-words">
                          {record.content}
                        </p>
                      </div>
                    )
                  })}
                </div>
                {totalPages > 1 && (
                  <div className="px-4 py-2 border-t border-[#f0f0f0]">
                    <PaginationBar
                      currentPage={followupsPage}
                      totalPages={totalPages}
                      totalItems={followups.length}
                      startIndex={(followupsPage - 1) * pageSize + 1}
                      endIndex={Math.min(followupsPage * pageSize, followups.length)}
                      onPageChange={setFollowupsPage}
                    />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 项目次数 */}
          {activeTab === "purchase" && (() => {
            const today = new Date().toLocaleDateString("sv-SE")
            const allItems = detail?.purchase_summary || []
            const memberItems = allItems.filter(s => s.type === "会员卡")
            const otherItems = allItems.filter(s => s.type !== "会员卡")

            // 会员卡：未过期在前，已过期在后
            const memberSorted = [...memberItems].sort((a, b) => {
              const aExpired = a.expiry_date && a.expiry_date < today
              const bExpired = b.expiry_date && b.expiry_date < today
              return (aExpired ? 1 : 0) - (bExpired ? 1 : 0)
            })
            // 总次数 = 所有卡 total_count 之和
            const firstItem = memberItems[0]
            const memberGrandTotal = firstItem?.grand_total ?? memberItems.reduce((sum, s) => {
              return sum + (typeof s.total_purchased === "number" ? s.total_purchased : 0)
            }, 0)
            // 剩余次数 = effective_remaining（已扣减未追踪活动和欠费）
            const effectiveItem = memberItems.find(s => s.effective_remaining !== undefined && s.effective_remaining !== null)
            const memberTotal = effectiveItem && typeof effectiveItem.effective_remaining === "number"
              ? effectiveItem.effective_remaining
              : memberItems.reduce((sum, s) => {
                  const expired = s.expiry_date && s.expiry_date < today
                  const notStarted = s.effective_date && s.effective_date > today
                  if (expired || notStarted) return sum
                  if (typeof s.remaining === "number") return sum + s.remaining
                  return sum
                }, 0)
            const memberHasUnlimited = memberItems.some(s => {
              const expired = s.expiry_date && s.expiry_date < today
              const notStarted = s.effective_date && s.effective_date > today
              return !expired && !notStarted && s.remaining === "不限"
            })

            // 其他类型排序
            const sortedOthers = [...otherItems].sort((a, b) => {
              const aExpired = a.expiry_date && a.expiry_date < today
              const bExpired = b.expiry_date && b.expiry_date < today
              const aNoCount = typeof a.remaining === "number" && a.remaining === 0
              const bNoCount = typeof b.remaining === "number" && b.remaining === 0
              return ((aExpired || aNoCount) ? 1 : 0) - ((bExpired || bNoCount) ? 1 : 0)
            })

            const pageSize = 5
            const totalPages = Math.ceil(sortedOthers.length / pageSize)
            const paginatedOthers = sortedOthers.slice((purchasePage - 1) * pageSize, purchasePage * pageSize)

            return (
              <div>
                {/* 会员卡 — 无卡不显示 */}
                {memberItems.length > 0 && (
                <div className="flex items-center gap-2 py-3 border-b border-[#f0f0f0]">
                  <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[60px] text-right">会员卡</span>
                  <div className="text-[12px] text-[#2b2f36] flex-1 min-w-0 pl-[6px]">
                    {(() => {
                      const totalManual = memberItems.reduce((sum, s) => sum + (s.manual_deductions || 0), 0)
                      const icDeduct = memberItems[0]?.internal_course_deductions || 0
                      const cardDeductions = memberItems
                        .filter(s => !s.voided)
                        .map(s => {
                          const isUnlimited = s.remaining === "不限" || s.total_purchased === "不限"
                          const count = isUnlimited ? (s.unlimited_deductions || 0) : (s.activity_deductions || 0)
                          return count > 0 ? `${s.name}扣卡${count}次` : ''
                        })
                        .filter(Boolean)
                      const parts: string[] = []
                      if (!memberHasUnlimited) parts.push(`总${memberGrandTotal}次`)
                      else parts.push("不限")
                      parts.push(...cardDeductions)
                      if (totalManual > 0) parts.push(`销卡${totalManual}次`)
                      if (icDeduct > 0) parts.push(`内部课程抵扣${icDeduct}次`)
                      return (
                        <span>
                          {memberHasUnlimited ? "不限次" : (typeof memberTotal === "number" && memberTotal < 0 ? <span className="text-[#c4506a]">剩余{memberTotal}次</span> : `剩余${memberTotal}次`)}
                          <span className="ml-1 text-[11px] text-[#8f959e]">（{parts.join("/")}）</span>
                        </span>
                      )
                    })()}
                    {memberSorted.length > 0 && memberSorted.map((s, i) => {
                      const expired = s.expiry_date && s.expiry_date < today
                      const notStarted = s.effective_date && s.effective_date > today
                      const voided = s.voided === true
                      return (
                        <span key={i} className="ml-3 text-[11px] text-[#8f959e]">
                          <span className={voided ? "text-[#c4506a] line-through" : expired ? "text-[#c4506a]" : notStarted ? "text-[#8f959e]" : ""}>
                            {s.name}
                            {voided
                              ? " 已退费"
                              : s.remaining === "不限" || s.total_purchased === "不限"
                                ? " 不限次"
                                : typeof s.remaining === "number" && typeof s.total_purchased === "number"
                                  ? ` ${Math.max(0, s.remaining)}次/${s.total_purchased}次`
                                  : ''}
                            {s.effective_date && ` ${s.effective_date}~${s.expiry_date || "不限"}`}
                            {expired && "（已过期）"}
                            {notStarted && "（未生效）"}
                          </span>
                        </span>
                      )
                    })}
                  </div>
                </div>
                )}

                {/* 其他类型 */}
                {sortedOthers.length > 0 ? (
                  <div className="divide-y divide-[#f0f0f0]">
                    {paginatedOthers.map((s, i) => {
                      const expired = s.expiry_date && s.expiry_date < today
                      const noCount = typeof s.remaining === "number" && s.remaining === 0
                      return (
                        <div key={i} className="flex items-center gap-2 py-3">
                          <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[60px] text-right">{s.type}</span>
                          <span className="text-[12px] text-[#2b2f36] flex-1 min-w-0 pl-[6px]">
                            {s.type === "内部课程" ? (
                              <span className="inline-flex items-baseline gap-2">
                                <span>{s.name}</span>
                                <span className="tabular-nums text-[11px] text-[#79838f]"><b className="text-[13px] font-extrabold text-[#212631]">∞</b> 不限次</span>
                                <span>{s.effective_date || <span className="text-[#d0d3d6]">-</span>}/{s.expiry_date || <span className="text-[#d0d3d6]">-</span>}</span>
                              </span>
                            ) : s.type === "其他项目" ? (
                              <span className="inline-flex items-baseline gap-2">
                                <span>{s.name}</span>
                                <span>{s.activity_mode || "线下"}</span>
                                <span>{s.remaining === "不限" ? "不限次" : (typeof s.remaining === "number" && s.remaining < 0 ? <span className="text-[#c4506a]">剩余{s.remaining}次/共{s.total_purchased}次</span> : `剩余${s.remaining}次/共${s.total_purchased}次`)}</span>
                                <span>{s.effective_date || <span className="text-[#d0d3d6]">-</span>}~{s.expiry_date || "不限"}</span>
                              </span>
                            ) : (
                              <span>{typeof s.remaining === "number" && s.remaining < 0 ? <span className="text-[#c4506a]">剩余{s.remaining}次/共{s.total_purchased}次</span> : `剩余${s.remaining}次/共${s.total_purchased}次`}</span>
                            )}
                          </span>
                          {expired && <span className="text-[12px] text-[#c4506a] bg-[#fef0f0] px-1.5 py-0.5 rounded shrink-0">已过期</span>}
                          {noCount && !expired && <span className="text-[12px] text-[#8f959e] bg-[#f0f1f2] px-1.5 py-0.5 rounded shrink-0">无次数</span>}
                        </div>
                      )
                    })}
                  </div>
                ) : memberItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div>
                ) : null}
                {totalPages > 1 && (
                  <div className="px-4 py-2">
                    <PaginationBar currentPage={purchasePage} totalPages={totalPages} totalItems={sortedOthers.length} startIndex={(purchasePage-1)*pageSize+1} endIndex={Math.min(purchasePage*pageSize, sortedOthers.length)} onPageChange={setPurchasePage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 交易记录 */}
          {activeTab === "payment" && (() => {
            const paymentRecords = detail?.payment_records || []
            const pageSize = 5
            const totalPages = Math.ceil(paymentRecords.length / pageSize)
            const paginatedRecords = paymentRecords.slice((paymentPage - 1) * pageSize, paymentPage * pageSize)
            return paymentRecords.length===0 ? <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div> : (
              <div>
                <Table className="border-b border-[#f0f0f0]"><TableHeader className="[&_tr]:!h-8">
                  <TableRow className="hover:bg-transparent !h-8">
                  <TableHead className="pl-4 !h-7 text-[12px]">类型</TableHead>
                  <TableHead className="!h-7 text-[12px]">名称</TableHead>
                  <TableHead className="!h-7 text-[12px]">数量</TableHead>
                  <TableHead className="!h-7 text-[12px]">金额</TableHead>
                  <TableHead className="!h-7 text-[12px]">生效日期</TableHead>
                  <TableHead className="!h-7 text-[12px]">到期日期</TableHead>
                  <TableHead className="!h-7 text-[12px]">状态</TableHead>
                  <TableHead className="!h-7 text-[12px]">成交人</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedRecords.map((r,i)=>{
                    const today = new Date().toISOString().slice(0,10)
                    let status: React.ReactNode = <span className="text-[#d0d3d6]">-</span>
                    let statusClass = ""
                    if (r.voided) {
                      status = "已退费"
                      statusClass = "text-[#c4506a]"
                    } else if (r.effective_date && r.effective_date > today) {
                      status = "未开始"
                      statusClass = "text-[#8f959e]"
                    } else if (r.expiry_date && r.expiry_date < today) {
                      status = "已过期"
                      statusClass = "text-[#c4506a]"
                    } else if (r.effective_date || r.expiry_date) {
                      status = "生效中"
                      statusClass = "text-[#3370ff]"
                    }
                    return (
                    <TableRow key={i} className="!h-9">
                      <TableCell className="pl-4 py-1 text-[12px]">{r.type}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.name || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.quantity}</TableCell>
                      <TableCell className="py-1 text-[12px]">¥{r.amount.toLocaleString()}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.effective_date || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.expiry_date || (r.type === "会员卡" ? "不限" : <span className="text-[#d0d3d6]">-</span>)}</TableCell>
                      <TableCell className={`py-1 text-[12px] ${statusClass}`}>{status}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.closer_name || <span className="text-[#d0d3d6]">-</span>}</TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody></Table>
                {totalPages > 1 && (
                  <div className="px-4 py-2">
                    <PaginationBar currentPage={paymentPage} totalPages={totalPages} totalItems={detail?.payment_records.length ?? 0} startIndex={(paymentPage-1)*pageSize+1} endIndex={Math.min(paymentPage*pageSize, detail?.payment_records.length ?? 0)} onPageChange={setPaymentPage} />
                  </div>
                )}
              </div>
            )
          })()}
            </div>
          </div>
        </div>
      </div>

      {/* 弹窗 */}
      <RecordForm open={formOpen} onOpenChange={setFormOpen} rec={editingRec} cid={c.id} cname={c.nickname||c.name} onSave={saveRec} customers={customerList} saving={saving}/>
    </div>
  )
}

// RecordForm 组件
function RecordForm({
  open, onOpenChange, rec, cid, cname, onSave, customers, saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  rec: HealingRec | null
  cid: string
  cname: string
  onSave: (data: any) => void
  customers: Customer[] | CustomerLight[]
  saving?: boolean
}) {
  const enterToNext = useEnterToNext()
  const [date, setDate] = useState(rec?.date || "")
  const [title, setTitle] = useState(rec?.title || "")
  const [teacher, setTeacher] = useState(rec?.teacher || "")
  const [growth, setGrowth] = useState(rec?.growth_record || "")
  const [mats, setMats] = useState<Material[]>(rec?.materials || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    if (rec) {
      setDate(rec.date); setTitle(rec.title); setTeacher(rec.teacher || ""); setGrowth(rec.growth_record || ""); setMats(rec.materials || [])
    } else {
      setDate(""); setTitle(""); setTeacher(""); setGrowth(""); setMats([])
    }
  }, [rec, open])

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
      const results = await Promise.allSettled(Array.from(files).map(f => uploadApi.uploadMaterial(f)))
      const succeeded = results.filter((r): r is PromiseFulfilledResult<Material> => r.status === "fulfilled").map(r => r.value)
      setMats(prev => [...prev, ...succeeded])
      const failed = results.filter(r => r.status === "rejected")
      if (failed.length > 0) alert(`${failed.length} 个文件上传失败`)
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = "" }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[480px] max-w-[90vw] p-0 gap-0">
        <div className="px-5 py-3 border-b border-[#f0f0f0]">
          <h3 className="text-[12px] font-normal">{rec ? "编辑" : "新增"}跟进记录</h3>
        </div>
        <div className="px-5 py-4 space-y-3" {...enterToNext}>
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">日期</span>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">标题</span>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="记录标题" className="h-8 text-[12px]" />
          </div>
          <div className="grid grid-cols-[56px_1fr] items-center gap-2">
            <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">老师</span>
            <CustomerSearchInput
              customers={customers}
              value={teacher}
              onChange={(v) => setTeacher(v as string)}
              placeholder="搜索选择"
            />
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
        <div className="flex justify-end gap-2 px-5 py-3 border-t-[0.5px] border-[#f0f0f0]">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
