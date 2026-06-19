import { useState, useRef, useEffect, useCallback } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { uploadApi, customerApi, healingRecordApi, customerDetailApi, type Customer, type CustomerLight, type Material, type CustomerDetail } from "@/lib/api"
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


export default function DetailView({
  selectedCustomerId,
  onClearSelection,
  hideSearch = false,
}: {
  selectedCustomerId: string | null
  onClearSelection: () => void
  hideSearch?: boolean
}) {
  const [customerList, setCustomerList] = useState<CustomerLight[]>([])
  const [searchValue, setSearchValue] = useState("")
  const [detail, setDetail] = useState<CustomerDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editingRec, setEditingRec] = useState<HealingRec | null>(null)
  const [activeTab, setActiveTab] = useState<"activities" | "healing" | "payment" | "purchase">("activities")
  const [activitiesPage, setActivitiesPage] = useState(1)
  const [healingPage, setHealingPage] = useState(1)
  const [paymentPage, setPaymentPage] = useState(1)
  const [purchasePage, setPurchasePage] = useState(1)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { customerApi.clearLightCache(); customerApi.light().then(setCustomerList).catch(() => {}) }, [])
  // 客户到店日期集合（用于标记未参加活动）
  const arrivedDates = new Set((detail?.visit_records || []).filter(v => v.arrived).map(v => v.visit_date))

  const loadDetail = useCallback(async (cid: string) => {
    setLoading(true)
    setCopied(false)
    try {
      const data = await customerDetailApi.get(cid)
      setDetail(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
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
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  const bar = (
    <div className="flex items-center gap-4">
      <div className="w-[280px]">
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

  if (loading || !detail) {
    return <div className="py-16 text-center text-[12px] text-muted-foreground">加载中...</div>
  }

  const c = detail.customer
  const arrivedRecords = (detail?.visit_records || []).filter(v => v.arrived).sort((a, b) => a.visit_date.localeCompare(b.visit_date))
  const firstVisit = arrivedRecords.length > 0 ? arrivedRecords[0].visit_date : "-"
  const createdDate = c.created_at ? c.created_at.slice(0, 10) : "-"

  return (
    <div className={hideSearch ? "p-2 h-[calc(75vh+50px)] flex flex-col" : "space-y-2 h-[calc(100vh-130px)] flex flex-col"}>
      {!hideSearch && bar}

      {/* 顶部标签行 — 核心指标一目了然 */}
      <div className="bg-white rounded-lg shrink-0 px-4 py-3 flex items-center gap-3 flex-wrap">
        <span className="text-[14px] font-medium text-[#2b2f36]">{c.nickname || "-"}</span>
        {c.name && <span className="text-[12px] text-[#8f959e]">{c.name}</span>}
        {c.member_type && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#f0f1f2] text-[#646a73]">{c.member_type}</span>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#f0f5ff] text-[#3370ff]">到店 {c.visit_count} 次</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] bg-[#f0f5ff] text-[#3370ff]">消费 ¥{detail!.payment_records.reduce((sum, g) => sum + g.amount, 0).toLocaleString()}</span>
        <span className="text-[11px] text-[#8f959e] ml-auto">首次到访 {firstVisit}</span>
      </div>

      {/* 双栏详情 */}
      <div className="bg-white rounded-lg shrink-0 flex">
        {/* 左栏：联系方式 + 来源信息 */}
        <div className="flex-1 min-w-0 border-r border-[#f0f0f0]">
          <div className="px-4 pt-3 pb-1"><span className="text-[11px] text-[#8f959e] font-medium">联系方式</span></div>
          <div className="px-4 pb-3 grid grid-cols-2 gap-y-2 gap-x-6">
            {[["年龄",c.age],["电话",c.phone],["微信",c.wechat],["创建日期",createdDate]].map(([l,v])=>(
              <div key={l} className="flex items-baseline gap-2">
                <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{l}</span>
                <span className="text-[12px] text-[#2b2f36]">{v||"-"}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-[#f0f0f0]" />
          <div className="px-4 pt-2 pb-1"><span className="text-[11px] text-[#8f959e] font-medium">来源信息</span></div>
          <div className="px-4 pb-3 grid grid-cols-2 gap-y-2 gap-x-6">
            {[["引流人",c.referrer||"-"],["承接人",c.referrer_handler||"-"],["流量来源",c.traffic_source||"-"]].map(([l,v])=>(
              <div key={l} className="flex items-baseline gap-2">
                <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{l}</span>
                <span className="text-[12px] text-[#2b2f36]">{v||"-"}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">{c.traffic_source === "朋友圈" ? "所属人" : c.traffic_source === "好友推荐" ? "好友昵称" : "流量链接"}</span>
              {c.traffic_source_detail ? (
                <>
                  <span className="text-[12px] text-[#2b2f36] truncate max-w-[200px]">{c.traffic_source_detail}</span>
                  <button
                    className="shrink-0 text-[#8f959e] hover:text-[#4e535a]"
                    onClick={() => { navigator.clipboard.writeText(c.traffic_source_detail); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  {copied && <span className="text-[11px] text-[#8f959e]">已复制</span>}
                </>
              ) : (
                <span className="text-[12px] text-[#2b2f36]">-</span>
              )}
            </div>
          </div>
          <div className="border-t border-[#f0f0f0]" />
          <div className="px-4 pt-2 pb-3">
            <span className="text-[11px] text-[#8f959e] font-medium mr-2">疗愈老师</span>
            <span className="text-[12px] text-[#2b2f36]">
              {(c.positions||[]).filter(p=>["成就君","能量结老师","课程老师"].includes(p)).length === 0
                ? "-"
                : (c.positions||[]).filter(p=>["成就君","能量结老师","课程老师"].includes(p)).map((p,i)=>(
                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-[#f0f1f2] text-[#646a73] mr-1">{p}</span>
                  ))
              }
            </span>
          </div>
        </div>

        {/* 右栏：背景信息 */}
        <div className="flex-1 min-w-0">
          <div className="px-4 pt-3 pb-1"><span className="text-[11px] text-[#8f959e] font-medium">工作情况</span></div>
          <div className="px-4 pb-2">
            <span className="text-[12px] text-[#4e535a] whitespace-pre-wrap">
              {c.work_status ? `${c.work_status}${c.work_description ? ` · ${c.work_description}` : ""}` : (c.work_description || "-")}
            </span>
          </div>
          {[["创伤经历",c.basic_info],["当下卡点",c.assessment],["到访目的",c.tags],["其他信息",c.other_info]].map(([l,v])=>(
            <div key={l}>
              <div className="border-t border-[#f0f0f0]" />
              <div className="px-4 pt-2 pb-1"><span className="text-[11px] text-[#8f959e] font-medium">{l}</span></div>
              <div className="px-4 pb-2">
                <span className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{v||"-"}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 记录标签页 */}
      <div className="bg-white rounded-lg -mt-2.5 flex-1 min-h-0 flex flex-col">
        {/* 标签页按钮 */}
        <div className="px-4 pt-2.5 flex gap-0 border-b border-[#f0f0f0] shrink-0">
          {[
            { key: "activities" as const, label: "活动记录" },
            { key: "healing" as const, label: "跟进记录" },
            { key: "purchase" as const, label: "剩余次数" },
            { key: "payment" as const, label: "交易记录" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveTab(tab.key)
                setActivitiesPage(1)
                setHealingPage(1)
                setPaymentPage(1)
                setPurchasePage(1)
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
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-[10px] pb-4">
          {/* 活动记录 */}
          {activeTab === "activities" && (() => {
            const activities = detail!.activities || []
            const pageSize = 5
            const totalPages = Math.ceil(activities.length / pageSize)
            const paginatedActivities = activities.slice((activitiesPage - 1) * pageSize, activitiesPage * pageSize)
            return activities.length===0 ? <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div> : (
              <div>
                <Table className="border-b border-[#f0f0f0]"><TableHeader className="[&_tr]:!h-8">
                  <TableRow className="hover:bg-transparent !h-8">
                  <TableHead className="pl-4 !h-7 text-[12px]">日期</TableHead><TableHead className="!h-7 text-[12px]">活动名称</TableHead><TableHead className="!h-7 text-[12px]">角色</TableHead><TableHead className="!h-7 text-[12px]">课程老师</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedActivities.map((a, i) => {
                    const notArrived = !arrivedDates.has(a.date)
                    return (
                      <TableRow key={i} className="!h-9">
                        <TableCell className="pl-4 py-1 text-[12px]">
                          {a.date}
                          {notArrived && <span className="text-[#8f959e] bg-[#f0f0f0] px-1 py-0.5 rounded ml-1.5 text-[10px]">未参加</span>}
                        </TableCell>
                        <TableCell className="py-1 text-[12px]">
                          {a.is_public_welfare && <span className="text-[#8f959e] bg-[#f0f0f0] px-1 py-0.5 rounded mr-1.5 text-[10px]">公益</span>}
                          {a.name || "-"}
                        </TableCell>
                        <TableCell className="py-1 text-[12px]">{a.role}</TableCell>
                        <TableCell className="py-1 text-[12px]">{a.host || "-"}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody></Table>
                {totalPages > 1 && (
                  <div className="px-4 py-2">
                    <PaginationBar currentPage={activitiesPage} totalPages={totalPages} totalItems={activities.length} startIndex={(activitiesPage-1)*pageSize+1} endIndex={Math.min(activitiesPage*pageSize, activities.length)} onPageChange={setActivitiesPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 疗愈记录 — 到店记录 */}
          {activeTab === "healing" && (() => {
            const visitRecords = (detail!.visit_records || []).sort((a, b) => b.visit_date.localeCompare(a.visit_date) || (b.arrival_time || "").localeCompare(a.arrival_time || ""))
            const pageSize = 8
            const totalPages = Math.ceil(visitRecords.length / pageSize)
            const paginatedRecords = visitRecords.slice((healingPage - 1) * pageSize, healingPage * pageSize)
            return visitRecords.length===0 ? <div className="flex flex-col items-center justify-center py-12 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无记录</span></div> : (
              <div>
                <div>
                  {paginatedRecords.map((v, idx) => (
                    <div key={v.id} className={`flex gap-4 py-2 ${idx > 0 ? "border-t border-[#f0f0f0]" : ""}`}>
                      <div className="w-[100px] shrink-0 pt-0.5">
                        <div className="text-[12px] text-[#4e535a]">{(() => { const [y, m, d] = v.visit_date.split("-"); return `${y}/${parseInt(m)}/${parseInt(d)}` })()}{v.arrival_time && ` ${v.arrival_time}`}</div>
                        <div className="mt-0.5">
                          {v.arrived ? (
                            <span className="text-[11px] text-[#3370ff] bg-[#f0f4ff] px-1.5 py-0.5 rounded">已到店</span>
                          ) : (
                            <span className="text-[11px] text-[#8f959e] bg-[#f0f0f0] px-1.5 py-0.5 rounded">未到店</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                          <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">当日需求</span>
                          <p className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{v.needs || <span className="text-[#8f959e]">-</span>}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">组长反馈</span>
                          <p className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{v.group_leader_feedback || <span className="text-[#8f959e]">-</span>}</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">客户反馈</span>
                          <p className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{v.feedback || v.experience || <span className="text-[#8f959e]">-</span>}</p>
                        </div>
                        {(() => {
                          const hr = detail!.healing_records.find(r => r.date === v.visit_date)
                          const record = hr?.growth_record || v.healing_notes
                          return (
                            <div className="flex items-start gap-2">
                              <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[56px] text-right">跟进记录</span>
                              <p className="text-[12px] text-[#4e535a] whitespace-pre-wrap">{record || <span className="text-[#8f959e]">-</span>}</p>
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-1.5 pt-1.5">
                    <PaginationBar currentPage={healingPage} totalPages={totalPages} totalItems={visitRecords.length} startIndex={(healingPage-1)*pageSize+1} endIndex={Math.min(healingPage*pageSize, visitRecords.length)} onPageChange={setHealingPage} />
                  </div>
                )}
              </div>
            )
          })()}

          {/* 项目次数 */}
          {activeTab === "purchase" && (() => {
            const today = new Date().toLocaleDateString("sv-SE")
            const allItems = detail!.purchase_summary || []
            const memberItems = allItems.filter(s => s.type === "会员卡")
            const otherItems = allItems.filter(s => s.type !== "会员卡")

            // 会员卡：未过期在前，已过期在后
            const memberSorted = [...memberItems].sort((a, b) => {
              const aExpired = a.expiry_date && a.expiry_date < today
              const bExpired = b.expiry_date && b.expiry_date < today
              return (aExpired ? 1 : 0) - (bExpired ? 1 : 0)
            })
            const memberTotal = memberItems.reduce((sum, s) => {
              const expired = s.expiry_date && s.expiry_date < today
              if (expired) return sum
              if (typeof s.remaining === "number") return sum + s.remaining
              return sum
            }, 0)
            const memberHasUnlimited = memberItems.some(s => {
              const expired = s.expiry_date && s.expiry_date < today
              return !expired && s.remaining === "不限"
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
                {/* 会员卡 — 始终显示 */}
                <div className="flex items-start gap-2 py-3 border-b border-[#f0f0f0]">
                  <span className="text-[12px] text-[#8f959e] tracking-widest shrink-0 w-[60px] text-right pt-0.5">会员卡</span>
                  <div className="text-[12px] text-[#2b2f36] flex-1 min-w-0 pl-[6px]">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {memberHasUnlimited ? "不限次" : `剩余${memberTotal}次`}
                      </span>
                    </div>
                    {memberSorted.length > 0 && (
                      <div className="mt-1 text-[11px] text-[#8f959e] flex flex-wrap items-center gap-y-0.5">
                        {memberSorted.map((s, i) => {
                          const expired = s.expiry_date && s.expiry_date < today
                          return (
                            <span key={i} className="inline-flex items-center">
                              {i > 0 && <span className="mx-1.5">|</span>}
                              <span className={expired ? "text-[#c4506a]" : ""}>
                                {s.name}{" "}
                                {s.remaining === "不限" ? "不限次" : `${Math.max(0, s.remaining as number)}次`}{" "}
                                {s.effective_date && `${s.effective_date}~${s.expiry_date || "不限"}`}
                                {expired && "（已过期）"}
                              </span>
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>

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
                                <span>{s.effective_date || "-"}/{s.expiry_date || "-"}</span>
                              </span>
                            ) : s.type === "其他项目" ? (
                              <span className="inline-flex items-baseline gap-2">
                                <span>{s.name}</span>
                                <span>{s.activity_mode || "线下"}</span>
                                <span>{s.remaining === "不限" ? "不限次" : (typeof s.remaining === "number" && s.remaining < 0 ? <span className="text-[#c4506a]">剩余{s.remaining}次/共{s.total_purchased}次</span> : `剩余${s.remaining}次/共${s.total_purchased}次`)}</span>
                                <span>{s.effective_date || "-"}~{s.expiry_date || "不限"}</span>
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
            const paymentRecords = detail!.payment_records || []
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
                  <TableHead className="!h-7 text-[12px]">成交人</TableHead>
                </TableRow></TableHeader><TableBody>
                  {paginatedRecords.map((r,i)=>(
                    <TableRow key={i} className="!h-9">
                      <TableCell className="pl-4 py-1 text-[12px]">{r.type}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.name || "-"}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.quantity}</TableCell>
                      <TableCell className="py-1 text-[12px]">¥{r.amount.toLocaleString()}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.effective_date || "-"}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.expiry_date || (r.type === "会员卡" ? "不限" : "-")}</TableCell>
                      <TableCell className="py-1 text-[12px]">{r.closer_name || "-"}</TableCell>
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
    if (rec) {
      setDate(rec.date); setTitle(rec.title); setTeacher(rec.teacher || ""); setGrowth(rec.growth_record || ""); setMats(rec.materials || [])
    } else {
      setDate(""); setTitle(""); setTeacher(""); setGrowth(""); setMats([])
    }
  }, [rec])

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
      if (failed.length > 0) console.error(`${failed.length} 个文件上传失败`)
    } catch (err) { console.error(err) }
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
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>取消</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}