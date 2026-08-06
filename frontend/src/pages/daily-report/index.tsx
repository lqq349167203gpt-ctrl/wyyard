import { useEffect, useState, useMemo, startTransition } from "react"
import { ChevronRight, ChevronLeft, ChevronUp, ChevronDown } from "lucide-react"
import { visitApi, classRecordApi, customerApi, memberIdentityApi, membershipCardApi, groupCaseApi, emotionalReleaseApi, ohCardReadingApi, energyKnotApi, internalCourseApi, otherProjectApi, projectDeductionApi, customerDetailApi, type VisitRecord, type ClassRecord, type Customer, type MemberIdentity, type CustomerDetail, type ActivityRecord } from "@/lib/api"
import { Download } from "lucide-react"
import { CalendarDatePicker } from "@/components/calendar-date-picker"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import DetailView from "@/pages/healing-records/components/detail-view"

const today = new Date().toISOString().split("T")[0]

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function getWeekday(d: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(d).getDay()]
}

export default function DailyReportPage() {
  const [detailDate, setDetailDate] = useState(() => {
    const saved = localStorage.getItem("shared-selected-date")
    return saved || today
  })
  useEffect(() => {
    localStorage.setItem("shared-selected-date", detailDate)
  }, [detailDate])

  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [activities, setActivities] = useState<ClassRecord[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [memberIdentities, setMemberIdentities] = useState<MemberIdentity[]>([])
  const [viewMode, setViewMode] = useState<"detail" | "summary">("summary")
  const [sortField, setSortField] = useState<string>("")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  interface FinanceRow {
    id: string
    customer_id: string
    referrer: string
    nickname: string
    item_name: string
    item_type: string
    purchase_count: number | null
    amount: number
    remaining_count: number | null
    closer_name: string
    payment_method: string
  }
  const [financeRows, setFinanceRows] = useState<FinanceRow[]>([])

  interface DeductionRow {
    id: string
    customer_id: string
    nickname: string
    card_type: string
    has_card: boolean
    manual_count: number
    activity_count: number
    remaining_count: number | null
  }
  const [deductionRows, setDeductionRows] = useState<DeductionRow[]>([])
  const [hasCardSet, setHasCardSet] = useState<Set<string>>(new Set())

  // 详情弹窗
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailType, setDetailType] = useState<"visit" | "invited" | "activity_all" | "activity_today" | "payment">("visit")
  const [detailNickname, setDetailNickname] = useState("")
  const [detailData, setDetailData] = useState<CustomerDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // 客户详情弹窗
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const openDetail = async (type: "visit" | "invited" | "activity_all" | "activity_today" | "payment", customerId: string, nickname: string) => {
    setDetailType(type)
    setDetailNickname(nickname)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      const data = await customerDetailApi.get(customerId, type === "activity_today" ? detailDate : undefined)
      setDetailData(data)
    } catch {
      setDetailData(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleExport = () => {
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const style = `<style>
      body{font-family:Microsoft YaHei,sans-serif;font-size:12px;color:#1f2329}
      table{border-collapse:collapse;width:100%}
      th,td{border:0.5px solid #e8eaed;padding:4px 6px;text-align:left}
      th{background:#f7f8fa;color:#8f959e;font-weight:normal}
      .section{font-size:13px;font-weight:bold;background:#f0f1f3}
      .section td{padding:6px}
      .wrap{white-space:pre-wrap;word-wrap:break-word;word-break:break-all}
    </style>`
    let html = `<html><head><meta charset="utf-8">${style}</head><body>`
    // 第一部分：当日客户
    html += `<table><colgroup><col width="60"><col width="50"><col width="80"><col width="60"><col width="50"><col width="50"><col width="50"><col width="50"><col width="60"><col width="120"><col width="120"><col width="100"><col width="100"><col width="70"><col width="50"><col width="40"></colgroup>`
    html += `<tr class="section"><td colspan="16">当日客户（${sortedVisits.length}人）</td></tr>`
    html += `<tr><th>引流</th><th>时间</th><th>客户昵称</th><th>身份</th><th>受邀</th><th>到店</th><th>总参与</th><th>今日</th><th>剩余次数</th><th>当日需求</th><th>客户信息</th><th>跟进点</th><th>组长反馈</th><th>今日成交</th><th>邀约</th><th>到场</th></tr>`
    for (const v of sortedVisits) {
      html += `<tr>
        <td>${esc(v.referrer || "-")}</td>
        <td>${esc(v.visit_time || "-")}</td>
        <td>${esc(v.nickname)}</td>
        <td>${esc(v.member_type || "-")}</td>
        <td>${v.invitation_count}次</td>
        <td>${v.arrived_count}次</td>
        <td>${v.activity_count}场</td>
        <td>${todayActivityCountMap[v.customer_id] || 0}场</td>
        <td>${!hasCardSet.has(v.customer_id) ? "未办卡" : v.remaining_count == null || v.remaining_count === -999 ? "不限" : v.remaining_count + "次"}</td>
        <td class="wrap">${esc(v.needs || "-")}</td>
        <td class="wrap">${esc(v.feedback || v.experience || "-")}</td>
        <td class="wrap">${esc(customers.find(c => c.id === v.customer_id)?.follow_up_node || "-")}</td>
        <td class="wrap">${esc(v.group_leader_feedback || "-")}</td>
        <td>${v.daily_amount > 0 ? "¥" + v.daily_amount.toLocaleString() : "-"}</td>
        <td>${esc(v.referrer_handler || "-")}</td>
        <td>${v.arrived ? "✓" : "✗"}</td>
      </tr>`
    }
    html += `</table><br>`
    // 第二部分：当日活动
    html += `<table><colgroup><col width="180"><col width="80"><col width="100"><col width="80"><col width="150"><col width="150"><col width="60"></colgroup>`
    html += `<tr class="section"><td colspan="7">当日活动（${activities.length}场）</td></tr>`
    html += `<tr><th>活动名称</th><th>活动类型</th><th>时间</th><th>老师</th><th>老人名单</th><th>新人名单</th><th>参与人数</th></tr>`
    for (const a of activities) {
      const teacherNames = (a.teacher_ids || []).map(id => customers.find(c => c.id === id)?.nickname || "").filter(Boolean).join("、")
      const allMemberIds = [...(a.participant_ids || []), ...(a.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))]
      const uniqueIds = [...new Set(allMemberIds)].filter(id => !a.teacher_ids?.includes(id))
      const identityTypeMap: Record<string, string> = {}
      for (const identity of memberIdentities) { if (identity.type && identity.name) identityTypeMap[identity.name] = identity.type }
      const oldMembers: string[] = [], newMembers: string[] = []
      for (const id of uniqueIds) {
        const name = customers.find(c => c.id === id)?.nickname || ""
        const memberType = customers.find(c => c.id === id)?.member_type || ""
        if (identityTypeMap[memberType] === "新人") newMembers.push(name); else oldMembers.push(name)
      }
      const time = a.start_time && a.end_time ? `${a.start_time}-${a.end_time}` : a.start_time || ""
      html += `<tr>
        <td>${esc(a.course_name)}</td>
        <td>${esc(a.course_type || "-")}</td>
        <td>${esc(time || "-")}</td>
        <td>${esc(teacherNames || "-")}</td>
        <td>${esc(oldMembers.join("、") || "-")}</td>
        <td>${esc(newMembers.join("、") || "-")}</td>
        <td>${uniqueIds.length}人</td>
      </tr>`
    }
    html += `</table><br>`
    // 第三部分：当日财务报表
    const totalAmount = financeRows.reduce((s, r) => s + r.amount, 0)
    html += `<table><colgroup><col width="60"><col width="80"><col width="70"><col width="100"><col width="60"><col width="60"><col width="60"><col width="70"><col width="80"><col width="80"></colgroup>`
    html += `<tr class="section"><td colspan="10">当日财务报表</td></tr>`
    html += `<tr><th>引流</th><th>昵称</th><th>项目类型</th><th>项目名称</th><th>购买场次</th><th>剩余卡次</th><th>成交人</th><th>付费方式</th><th>小计</th><th></th></tr>`
    for (const r of financeRows) {
      html += `<tr>
        <td>${esc(r.referrer || "-")}</td>
        <td>${esc(r.nickname)}</td>
        <td>${esc(r.item_type)}</td>
        <td>${esc(r.item_name)}</td>
        <td>${r.purchase_count != null ? r.purchase_count + "次" : "-"}</td>
        <td>${r.remaining_count == null || r.remaining_count === -999 ? "不限" : r.remaining_count + "次"}</td>
        <td>${esc(r.closer_name || "-")}</td>
        <td>${esc(r.payment_method || "-")}</td>
        <td>¥${r.amount.toLocaleString()}</td>
        <td></td>
      </tr>`
    }
    html += `<tr style="background:#f7f8fa;font-weight:bold"><td colspan="8">合计</td><td></td><td>¥${totalAmount.toLocaleString()}</td></tr>`
    html += `</table><br>`
    // 第四部分：当日销卡
    if (deductionRows.length > 0) {
      html += `<table><colgroup><col width="80"><col width="80"><col width="70"><col width="70"><col width="70"></colgroup>`
      html += `<tr class="section"><td colspan="5">当日销卡</td></tr>`
      html += `<tr><th>昵称</th><th>卡类型</th><th>人工销卡</th><th>活动销卡</th><th>剩余卡次</th></tr>`
      for (const r of deductionRows) {
        html += `<tr>
          <td>${esc(r.nickname)}</td>
          <td>${esc(r.card_type || "未办卡")}</td>
          <td>${r.manual_count > 0 ? r.manual_count + "次" : "-"}</td>
          <td>${r.activity_count > 0 ? r.activity_count + "次" : "-"}</td>
          <td>${!r.has_card ? "未办卡" : r.remaining_count == null || r.remaining_count === -999 ? "不限" : r.remaining_count + "次"}</td>
        </tr>`
      }
      html += `</table>`
    }
    html += `</body></html>`
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `每日报表_${detailDate}.xls`; a.click()
    URL.revokeObjectURL(url)
  }

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  const sortedVisits = useMemo(() => {
    const sorted = [...visits].filter(v => v.nickname).sort((a, b) => {
      let va: string | number = ""
      let vb: string | number = ""
      switch (sortField || "arrived") {
        case "member_type": va = a.member_type || ""; vb = b.member_type || ""; break
        case "visit_count": va = a.visit_count; vb = b.visit_count; break
        case "invitation_count": va = a.invitation_count; vb = b.invitation_count; break
        case "arrived_count": va = a.arrived_count; vb = b.arrived_count; break
        case "activity_count": va = a.activity_count; vb = b.activity_count; break
        case "today_activity": va = todayActivityCountMap[a.customer_id] || 0; vb = todayActivityCountMap[b.customer_id] || 0; break
        case "daily_amount": va = a.daily_amount || 0; vb = b.daily_amount || 0; break
        case "visit_time": va = a.visit_time || ""; vb = b.visit_time || ""; break
        case "referrer_handler": va = a.referrer_handler || ""; vb = b.referrer_handler || ""; break
        case "arrived": va = a.arrived ? 1 : 0; vb = b.arrived ? 1 : 0; break
      }
      const dir = sortField ? sortDir : "desc"
      if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va)
      return dir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return sorted
  }, [visits, sortField, sortDir])

  // 计算每个客户当日参与的活动场数
  const todayActivityCountMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const a of activities) {
      const allIds = [
        ...(a.participant_ids || []),
        ...(a.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean)),
      ]
      for (const id of [...new Set(allIds)]) {
        map[id] = (map[id] || 0) + 1
      }
    }
    return map
  }, [activities])

  const dateRange = useMemo(() => Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i))), [dateRangeStart])

  // detailDate 变化时，确保日期在可视范围内
  useEffect(() => {
    if (detailDate < dateRange[0] || detailDate > dateRange[dateRange.length - 1]) {
      setDateRangeStart(formatDate(addDays(new Date(detailDate), -7)))
    }
  }, [detailDate, dateRange])

  // 加载日期范围内的到场人数
  useEffect(() => {
    const endDate = formatDate(addDays(new Date(dateRangeStart), 20))
    visitApi.counts({ startDate: dateRangeStart, endDate })
      .then(setVisitCounts)
      .catch(() => {})
  }, [dateRangeStart])

  // 加载当日邀约数据
  useEffect(() => {
    setLoading(true)
    visitApi.list(detailDate)
      .then((data) => setVisits(data))
      .catch(() => setVisits([]))
      .finally(() => setLoading(false))
  }, [detailDate])

  // 加载当日活动、客户、会员身份
  useEffect(() => {
    classRecordApi.list(detailDate).then(setActivities).catch(() => setActivities([]))
  }, [detailDate])
  useEffect(() => {
    customerApi.list().then(setCustomers).catch(() => setCustomers([]))
    memberIdentityApi.list().then(setMemberIdentities).catch(() => setMemberIdentities([]))
  }, [])

  // 加载当日财务数据
  useEffect(() => {
    const customerMap: Record<string, Customer> = {}
    for (const c of customers) customerMap[c.id] = c

    Promise.all([
      membershipCardApi.list().catch(() => []),
      groupCaseApi.list().catch(() => []),
      emotionalReleaseApi.list().catch(() => []),
      ohCardReadingApi.list().catch(() => []),
      energyKnotApi.list().catch(() => []),
      internalCourseApi.list().catch(() => []),
      otherProjectApi.list().catch(() => []),
      projectDeductionApi.list().catch(() => []),
      visitApi.list(detailDate).catch(() => []),
    ]).then(([cards, groups, emotions, ohs, energies, courses, others, deductions, todayVisits]) => {
      const cardDeductionMap: Record<string, number> = {}
      for (const d of deductions as any[]) {
        if (d.deduction_date === detailDate && d.project_type === "membership-cards") {
          cardDeductionMap[d.customer_id] = (cardDeductionMap[d.customer_id] || 0) + (d.count || 1)
        }
      }
      // 每个客户的当日活动销卡次数（公益活动不扣卡）
      const activityDeductionMap: Record<string, number> = {}
      for (const a of activities) {
        if (a.is_public_welfare) continue
        const allIds = [
          ...(a.participant_ids || []),
          ...(a.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean)),
        ]
        for (const id of [...new Set(allIds)]) {
          activityDeductionMap[id] = (activityDeductionMap[id] || 0) + (a.membership_deduction_count || 1)
        }
      }

      const rows: FinanceRow[] = []
      const addItem = (item: any, type: string) => {
        if (item.deal_date !== detailDate) return
        if (item.voided) return
        if (item.is_deleted) return
        const customer = customerMap[item.customer_id]
        let itemName = ""
        let itemType = ""
        let amount = 0
        let purchaseCount: number | null = null
        let remainingCount: number | null = null
        switch (type) {
          case "membership_card":
            itemType = "会员卡"
            itemName = item.card_type || ""
            amount = item.price || 0
            purchaseCount = item.total_count ?? null
            remainingCount = item.remaining_count
            break
          case "group_case":
            itemType = "觉醒游戏"
            itemName = "-"
            amount = item.amount || 0
            purchaseCount = item.purchase_count || 0
            break
          case "emotional_release":
            itemType = "情绪释放"
            itemName = "-"
            amount = item.amount || 0
            purchaseCount = item.purchase_count || 0
            break
          case "oh_card_reading":
            itemType = "OH卡梳理"
            itemName = "-"
            amount = item.amount || 0
            purchaseCount = item.purchase_count || 0
            break
          case "energy_knot":
            itemType = "能量结"
            itemName = "-"
            amount = item.amount || 0
            purchaseCount = item.purchase_count || 0
            break
          case "internal_course":
            itemType = "内部课程"
            itemName = item.course_type || ""
            amount = item.price || 0
            break
          case "other":
            itemType = "其他项目"
            itemName = item.project_name || item.category || ""
            amount = item.fee || 0
            purchaseCount = item.total_count ?? null
            remainingCount = item.remaining_count
            break
        }
        const closerNames = (item.closers || []).map((c: any) => c.name).filter(Boolean).join("、")
          || item.closer_name || ""
        rows.push({
          id: item.id,
          customer_id: item.customer_id,
          referrer: customer?.referrer || "",
          nickname: item.nickname || customer?.nickname || "",
          item_name: itemName,
          item_type: itemType,
          purchase_count: purchaseCount,
          amount,
          remaining_count: remainingCount,
          closer_name: closerNames,
          payment_method: item.payment_method || "",
        })
      }
      for (const item of cards as any[]) addItem(item, "membership_card")
      for (const item of groups as any[]) addItem(item, "group_case")
      for (const item of emotions as any[]) addItem(item, "emotional_release")
      for (const item of ohs as any[]) addItem(item, "oh_card_reading")
      for (const item of energies as any[]) addItem(item, "energy_knot")
      for (const item of courses as any[]) addItem(item, "internal_course")
      for (const item of others as any[]) addItem(item, "other")
      setFinanceRows(rows)

      // 构建当日销卡数据
      // 客户→会员卡映射
      const customerCardMap: Record<string, any> = {}
      const cardSet = new Set<string>()
      for (const c of cards as any[]) {
        if (!c.is_deleted && !c.voided) {
          customerCardMap[c.customer_id] = customerCardMap[c.customer_id] || c
          cardSet.add(c.customer_id)
        }
      }
      // 有内部课程（含疗愈师卡）的客户也算有卡
      for (const c of courses as any[]) {
        if (!c.is_deleted && !c.voided && (!c.expiry_date || c.expiry_date >= detailDate)) {
          cardSet.add(c.customer_id)
        }
      }
      setHasCardSet(cardSet)
      // 内部课程客户 ID 集合
      const courseCustomerIds = new Set<string>()
      for (const c of courses as any[]) {
        if (!c.is_deleted && !c.voided && (!c.expiry_date || c.expiry_date >= detailDate)) {
          courseCustomerIds.add(c.customer_id)
        }
      }
      // 合并所有有销卡的客户
      const deductionCustomerIds = new Set([
        ...Object.keys(cardDeductionMap),
        ...Object.keys(activityDeductionMap),
      ])
      const dRows: DeductionRow[] = []
      for (const cid of deductionCustomerIds) {
        const customer = customerMap[cid]
        const card = customerCardMap[cid]
        const manualCount = cardDeductionMap[cid] || 0
        const activityCount = activityDeductionMap[cid] || 0
        if (manualCount === 0 && activityCount === 0) continue
        dRows.push({
          id: cid,
          customer_id: cid,
          nickname: customer?.nickname || "",
          card_type: card?.card_type || (courseCustomerIds.has(cid) ? "疗愈师" : ""),
          has_card: !!card || courseCustomerIds.has(cid),
          manual_count: manualCount,
          activity_count: activityCount,
          remaining_count: card?.remaining_count ?? null,
        })
      }
      setDeductionRows(dRows)
    })
  }, [detailDate, customers, activities])

  return (
    <div className="px-6 pt-4 pb-6 min-w-0 overflow-auto" style={{ height: 'calc(100vh - 48px)' }}>

      {/* 顶部：日期选择 */}
      <div className="border-b-[0.5px] border-[#f0f1f2]">
        <div className="flex items-center gap-2">
          <CalendarDatePicker detailDate={detailDate} onSelectDate={(d) => startTransition(() => setDetailDate(d))} />
          <span className="text-[12px] text-[#8f959e]">每日报表</span>
        </div>
        {/* 日期滚动条 */}
        <div className="flex items-center justify-between gap-1 mt-3 mb-2 h-[52px]">
          <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => setDateRangeStart(formatDate(addDays(new Date(dateRangeStart), -7)))}>
            <ChevronLeft className="h-4 w-4 text-[#4e535a]" />
          </button>
          <div className="flex-1 flex items-center justify-between overflow-x-auto">
            {dateRange.map((d) => {
              const isSelected = d === detailDate
              const isToday = d === today
              const dayCount = visitCounts[d] || 0
              return (
                <button
                  key={d}
                  className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-md transition-colors ${
                    isSelected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff]" : "hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => startTransition(() => setDetailDate(d))}
                >
                  <span className={`text-[10px] leading-none h-3 flex items-center ${isSelected ? "text-white/80" : "text-[#8f959e]"}`}>
                    {getWeekday(d)}
                  </span>
                  <span className="text-[14px] font-medium leading-none h-4 flex items-center">{parseInt(d.split("-")[2])}</span>
                  <span className={`text-[9px] leading-none h-3 flex items-center mt-0.5 ${isSelected ? "text-white/80" : dayCount > 0 ? "text-[#b0b5bb]" : "text-transparent"}`}>
                    {dayCount > 0 ? `${dayCount}人` : " "}
                  </span>
                </button>
              )
            })}
          </div>
          <button className="h-7 w-7 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => setDateRangeStart(formatDate(addDays(new Date(dateRangeStart), 7)))}>
            <ChevronRight className="h-4 w-4 text-[#4e535a]" />
          </button>
        </div>
      </div>

      {/* 第一部分：当日客户信息 */}
      <div className="min-w-0 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-medium text-[#1f2329]">当日客户<span className="text-[#8f959e] font-normal">（{sortedVisits.length}人）</span></span>
          <button
            className="h-6 ml-auto flex items-center gap-0.5 px-2 rounded border border-[#e8eaed] hover:bg-[#f0f0f0] text-[11px] text-[#8f959e]"
            onClick={handleExport}
          >
            <Download className="h-3 w-3" />
            导出
          </button>
          <button
            className="h-6 flex items-center gap-0.5 px-2 rounded border border-[#e8eaed] hover:bg-[#f0f0f0] text-[11px] text-[#8f959e]"
            onClick={() => setViewMode(viewMode === "detail" ? "summary" : "detail")}
          >
            {viewMode === "detail" ? "详情" : "缩略"}
            {viewMode === "detail" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>
        {loading ? (
          <div className="text-[12px] text-[#8f959e] py-8 text-center">加载中...</div>
        ) : visits.length === 0 ? (
          <div className="text-[12px] text-[#8f959e] py-8 text-center">当日无邀约记录</div>
        ) : (
          <div className="overflow-x-auto scrollbar-visible">
            <table className="text-[11px] w-full" style={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-[#f7f8fa] text-[#8f959e]">
                  <th className="px-[5px] py-2 text-left font-normal w-[42px] border-b-[0.5px] border-[#e8eaed]">引流</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[46px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("visit_time")}><span className="inline-flex items-center gap-0">时间<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "visit_time" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "visit_time" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-left font-normal w-[60px] border-b-[0.5px] border-[#e8eaed]">客户昵称</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[54px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("member_type")}><span className="inline-flex items-center gap-0">身份<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "member_type" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "member_type" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-center font-normal w-[40px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("invitation_count")}><span className="inline-flex items-center gap-0">受邀<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "invitation_count" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "invitation_count" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-center font-normal w-[48px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("arrived_count")}><span className="inline-flex items-center gap-0">到店<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "arrived_count" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "arrived_count" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-center font-normal w-[50px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("activity_count")}><span className="inline-flex items-center gap-0">总参与<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "activity_count" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "activity_count" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-center font-normal w-[48px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("today_activity")}><span className="inline-flex items-center gap-0">今日<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "today_activity" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "today_activity" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="px-[5px] py-2 text-center font-normal w-[57px] border-b-[0.5px] border-[#e8eaed]">剩余次数</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">当日需求</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">客户信息</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">跟进点</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">组长反馈</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[74px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("daily_amount")}><span className="inline-flex items-center gap-0">今日成交<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "daily_amount" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "daily_amount" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="pl-[5px] pr-0 py-2 text-left font-normal w-[36px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("referrer_handler")}><span className="inline-flex items-center gap-0">邀约<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "referrer_handler" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "referrer_handler" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                  <th className="pl-0 pr-[5px] py-2 text-center font-normal w-[56px] border-b-[0.5px] border-[#e8eaed] cursor-pointer select-none" onClick={() => handleSort("arrived")}><span className="inline-flex items-center gap-0">到场<span className="inline-flex flex-col leading-none"><span className={`text-[7px] ${sortField === "arrived" && sortDir === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span><span className={`text-[7px] -mt-[0px] ${sortField === "arrived" && sortDir === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span></span></span></th>
                </tr>
              </thead>
              <tbody>
                {sortedVisits.map((v, i) => (
                  <tr key={v.id} className={i % 2 === 0 ? "bg-white hover:bg-[#f7f8fa]" : "bg-[#fcfcfd] hover:bg-[#f0f1f3]"}>
                    <td className="px-[5px] py-2 text-[#8b9198] truncate border-b-[0.5px] border-[#e8eaed]">{v.referrer || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-[#92989e] text-center border-b-[0.5px] border-[#e8eaed]">{v.visit_time || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-black truncate border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => { setSelectedCustomerId(v.customer_id); setCustomerDetailOpen(true) }}>{v.nickname}</td>
                    <td className="px-[5px] py-2 text-[#8b9198] truncate border-b-[0.5px] border-[#e8eaed]">{v.member_type || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-[#1f2329] text-center border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => openDetail("invited", v.customer_id, v.nickname)}>{v.invitation_count}次</td>
                    <td className="px-[5px] py-2 text-[#1f2329] text-center border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => openDetail("visit", v.customer_id, v.nickname)}>{v.arrived_count}次</td>
                    <td className="px-[5px] py-2 text-[#1f2329] text-center border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => openDetail("activity_all", v.customer_id, v.nickname)}>{v.activity_count}场</td>
                    <td className="px-[5px] py-2 text-[#1f2329] text-center border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => openDetail("activity_today", v.customer_id, v.nickname)}>{todayActivityCountMap[v.customer_id] || 0}场</td>
                    <td className="px-[5px] py-2 text-center border-b-[0.5px] border-[#e8eaed]">{!hasCardSet.has(v.customer_id) ? <span className="text-[#c9cdd4]">未办卡</span> : v.remaining_count == null || v.remaining_count === -999 ? <span className="text-[#4e535a]">不限</span> : <span className="text-[#4e535a]">{v.remaining_count}次</span>}</td>
                    <td className={`px-[5px] py-2 text-[10px] text-[#4e535a] border-b-[0.5px] border-[#e8eaed] ${viewMode === "summary" ? "truncate" : "whitespace-pre-wrap break-words"}`}>{v.needs || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className={`px-[5px] py-2 text-[10px] text-[#4e535a] border-b-[0.5px] border-[#e8eaed] ${viewMode === "summary" ? "truncate" : "whitespace-pre-wrap break-words"}`}>{v.feedback || v.experience || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className={`px-[5px] py-2 text-[10px] text-[#4e535a] border-b-[0.5px] border-[#e8eaed] ${viewMode === "summary" ? "truncate" : "whitespace-pre-wrap break-words"}`}>{customers.find(c => c.id === v.customer_id)?.follow_up_node || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className={`px-[5px] py-2 text-[10px] text-[#4e535a] border-b-[0.5px] border-[#e8eaed] ${viewMode === "summary" ? "truncate" : "whitespace-pre-wrap break-words"}`}>{v.group_leader_feedback || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-[#1f2329] border-b-[0.5px] border-[#e8eaed] cursor-pointer hover:underline" onClick={() => v.daily_amount > 0 && openDetail("payment", v.customer_id, v.nickname)}>{v.daily_amount > 0 ? `¥${v.daily_amount.toLocaleString()}` : <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="pl-[5px] pr-[1px] py-2 text-[#6b7178] truncate border-b-[0.5px] border-[#e8eaed]">{v.referrer_handler || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="pl-[1px] pr-[5px] py-2 text-center border-b-[0.5px] border-[#e8eaed]">
                      {v.arrived ? (
                        <span className="inline-block w-4 h-4 rounded-full bg-[#34c724] text-white text-[10px] leading-4 text-center">&#10003;</span>
                      ) : (
                        <span className="inline-block w-4 h-4 rounded-full bg-[#dee0e3] text-white text-[10px] leading-4 text-center">&#10005;</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 第二部分：当日活动列表 */}
      <div className="min-w-0 mt-4">
        <div className="text-[13px] font-medium text-[#1f2329] mb-3">当日活动<span className="text-[#8f959e] font-normal">（{activities.length}场）</span></div>
        {activities.length === 0 ? (
          <div className="text-[12px] text-[#8f959e] py-8 text-center">当日无活动</div>
        ) : (
          <div className="overflow-x-auto scrollbar-visible">
            <table className="text-[12px] w-full" style={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-[#f7f8fa] text-[#8f959e]">
                  <th className="px-[5px] py-2 text-left font-normal w-[180px] border-b-[0.5px] border-[#e8eaed]">活动名称</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">活动类型</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[100px] border-b-[0.5px] border-[#e8eaed]">时间</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[90px] border-b-[0.5px] border-[#e8eaed]">老师</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">老人名单</th>
                  <th className="px-[5px] py-2 text-left font-normal border-b-[0.5px] border-[#e8eaed]">新人名单</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[60px] border-b-[0.5px] border-[#e8eaed]">参与人数</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((a, i) => {
                  const teacherNames = (a.teacher_ids || []).map(id => customers.find(c => c.id === id)?.nickname || "").filter(Boolean).join("、")
                  const allMemberIds = [
                    ...(a.participant_ids || []),
                    ...(a.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean)),
                  ]
                  const uniqueIds = [...new Set(allMemberIds)].filter(id => !a.teacher_ids?.includes(id))
                  const identityTypeMap: Record<string, string> = {}
                  for (const identity of memberIdentities) {
                    if (identity.type && identity.name) identityTypeMap[identity.name] = identity.type
                  }
                  const oldMembers: string[] = []
                  const newMembers: string[] = []
                  for (const id of uniqueIds) {
                    const name = customers.find(c => c.id === id)?.nickname || ""
                    const memberType = customers.find(c => c.id === id)?.member_type || ""
                    if (identityTypeMap[memberType] === "新人") newMembers.push(name)
                    else oldMembers.push(name)
                  }
                  return (
                    <tr key={a.id} className={i % 2 === 0 ? "bg-white hover:bg-[#f7f8fa]" : "bg-[#fcfcfd] hover:bg-[#f0f1f3]"}>
                      <td className="px-[5px] py-2 text-[#1f2329] whitespace-normal break-words border-b-[0.5px] border-[#e8eaed]">{a.course_name}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{a.course_type || <span className="text-[#c9cdd4]">-</span>}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] text-center border-b-[0.5px] border-[#e8eaed]">{a.start_time && a.end_time ? `${a.start_time}-${a.end_time}` : a.start_time || "-"}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{teacherNames || <span className="text-[#c9cdd4]">-</span>}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] whitespace-normal break-words border-b-[0.5px] border-[#e8eaed]">{oldMembers.length > 0 ? oldMembers.join("、") : <span className="text-[#c9cdd4]">-</span>}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] whitespace-normal break-words border-b-[0.5px] border-[#e8eaed]">{newMembers.length > 0 ? newMembers.join("、") : <span className="text-[#c9cdd4]">-</span>}</td>
                      <td className="px-[5px] py-2 text-[#4e535a] text-center border-b-[0.5px] border-[#e8eaed]">{uniqueIds.length}人</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 第三部分：当日财务报表 */}
      <div className="min-w-0 mt-4">
        <div className="text-[13px] font-medium text-[#1f2329] mb-3">当日财务报表</div>
        {financeRows.length === 0 ? (
          <div className="text-[12px] text-[#8f959e] py-8 text-center">当日无财务记录</div>
        ) : (
          <div className="overflow-x-auto scrollbar-visible">
            <table className="text-[12px] w-full" style={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-[#f7f8fa] text-[#8f959e]">
                  <th className="px-[5px] py-2 text-left font-normal w-[50px] border-b-[0.5px] border-[#e8eaed]">引流</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[60px] border-b-[0.5px] border-[#e8eaed]">昵称</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">项目类型</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[90px] border-b-[0.5px] border-[#e8eaed]">项目名称</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[60px] border-b-[0.5px] border-[#e8eaed]">购买场次</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[60px] border-b-[0.5px] border-[#e8eaed]">剩余卡次</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">成交人</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[100px] border-b-[0.5px] border-[#e8eaed]">付费方式</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[80px] border-b-[0.5px] border-[#e8eaed]">小计</th>
                </tr>
              </thead>
              <tbody>
                {financeRows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white hover:bg-[#f7f8fa]" : "bg-[#fcfcfd] hover:bg-[#f0f1f3]"}>
                    <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{r.referrer || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-[#1f2329] truncate border-b-[0.5px] border-[#e8eaed]">{r.nickname}</td>
                    <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{r.item_type}</td>
                    <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{r.item_name}</td>
                    <td className="px-[5px] py-2 text-center text-[#4e535a] border-b-[0.5px] border-[#e8eaed]">{r.purchase_count != null ? `${r.purchase_count}次` : <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-center border-b-[0.5px] border-[#e8eaed]">{r.remaining_count == null || r.remaining_count === -999 ? <span className="text-[#4e535a]">不限</span> : <span className="text-[#4e535a]">{r.remaining_count}次</span>}</td>
                    <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{r.closer_name || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-[#4e535a] truncate border-b-[0.5px] border-[#e8eaed]">{r.payment_method || <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-left text-[#4e535a] border-b-[0.5px] border-[#e8eaed]">¥{r.amount.toLocaleString()}</td>
                  </tr>
                ))}
                {/* 汇总行 */}
                <tr className="bg-[#f7f8fa] font-medium">
                  <td colSpan={7} className="px-[5px] py-2 text-left text-[#1f2329] border-b-[0.5px] border-[#e8eaed]">合计</td>
                  <td className="px-[5px] py-2 text-[#4e535a] border-b-[0.5px] border-[#e8eaed]">
                    {(() => {
                      const methodTotals: Record<string, number> = {}
                      for (const r of financeRows) {
                        if (r.payment_method) {
                          methodTotals[r.payment_method] = (methodTotals[r.payment_method] || 0) + r.amount
                        }
                      }
                      return Object.entries(methodTotals).map(([m, v]) => `${m} ¥${v.toLocaleString()}`).join("、") || "-"
                    })()}
                  </td>
                  <td className="px-[5px] py-2 text-left text-[#1f2329] border-b-[0.5px] border-[#e8eaed]">¥{financeRows.reduce((s, r) => s + r.amount, 0).toLocaleString()}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 第四部分：当日销卡 */}
      <div className="min-w-0 mt-4">
        <div className="text-[13px] font-medium text-[#1f2329] mb-3">当日销卡</div>
        {deductionRows.length === 0 ? (
          <div className="text-[12px] text-[#8f959e] py-8 text-center">当日无销卡记录</div>
        ) : (
          <div className="overflow-x-auto scrollbar-visible">
            <table className="text-[12px] w-full" style={{ tableLayout: "fixed", borderCollapse: "collapse" }}>
              <thead>
                <tr className="bg-[#f7f8fa] text-[#8f959e]">
                  <th className="px-[5px] py-2 text-left font-normal w-[80px] border-b-[0.5px] border-[#e8eaed]">昵称</th>
                  <th className="px-[5px] py-2 text-left font-normal w-[80px] border-b-[0.5px] border-[#e8eaed]">卡类型</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">人工销卡</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">活动销卡</th>
                  <th className="px-[5px] py-2 text-center font-normal w-[70px] border-b-[0.5px] border-[#e8eaed]">剩余卡次</th>
                </tr>
              </thead>
              <tbody>
                {deductionRows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white hover:bg-[#f7f8fa]" : "bg-[#fcfcfd] hover:bg-[#f0f1f3]"}>
                    <td className="px-[5px] py-2 text-[#1f2329] truncate border-b-[0.5px] border-[#e8eaed]">{r.nickname}</td>
                    <td className="px-[5px] py-2 truncate border-b-[0.5px] border-[#e8eaed]">{r.card_type ? <span className="text-[#4e535a]">{r.card_type}</span> : <span className="text-[#c9cdd4]">未办卡</span>}</td>
                    <td className="px-[5px] py-2 text-center text-[#4e535a] border-b-[0.5px] border-[#e8eaed]">{r.manual_count > 0 ? `${r.manual_count}次` : <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-center text-[#4e535a] border-b-[0.5px] border-[#e8eaed]">{r.activity_count > 0 ? `${r.activity_count}次` : <span className="text-[#c9cdd4]">-</span>}</td>
                    <td className="px-[5px] py-2 text-center border-b-[0.5px] border-[#e8eaed]">{!r.has_card ? <span className="text-[#c9cdd4]">未办卡</span> : r.remaining_count == null || r.remaining_count === -999 ? <span className="text-[#4e535a]">不限</span> : <span className="text-[#4e535a]">{r.remaining_count}次</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-[712px] max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-[14px]">
              {detailNickname} — {detailType === "visit" ? "到店记录" : detailType === "invited" ? "受邀记录" : detailType === "activity_all" ? "总参与记录" : detailType === "payment" ? "成交详情" : "今日参与记录"}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">加载中...</div>
          ) : !detailData ? (
            <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无数据</div>
          ) : detailType === "visit" ? (() => {
            const records = (detailData.visit_records || []).filter(v => v.arrived).sort((a, b) => (b.visit_date || "").localeCompare(a.visit_date || ""))
            return records.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无到店记录</div>
            ) : (
              <>
                <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                  <span className="w-32 shrink-0">日期</span>
                  <span className="w-20 shrink-0">邀约人</span>
                  <span className="w-24 shrink-0">需求</span>
                  <span className="flex-1">客户信息</span>
                  <span className="w-24 shrink-0">跟进点</span>
                  <span className="w-24 shrink-0">组长反馈</span>
                </div>
                {records.map(v => (
                  <div key={v.id} className="flex items-start px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a] border-b border-[#f0f0f0]">
                    <span className="w-32 shrink-0">{v.visit_date}</span>
                    <span className="w-20 shrink-0 truncate">{v.referrer_handler || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.needs || "-"}</span>
                    <span className="flex-1 whitespace-pre-wrap">{v.feedback || v.experience || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.healing_notes || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.group_leader_feedback || "-"}</span>
                  </div>
                ))}
              </>
            )
          })() : detailType === "invited" ? (() => {
            const records = (detailData.visit_records || []).sort((a, b) => (b.visit_date || "").localeCompare(a.visit_date || ""))
            return records.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无受邀记录</div>
            ) : (
              <>
                <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                  <span className="w-40 shrink-0">日期</span>
                  <span className="w-20 shrink-0">邀约人</span>
                  <span className="w-24 shrink-0">需求</span>
                  <span className="flex-1">客户信息</span>
                  <span className="w-24 shrink-0">跟进点</span>
                  <span className="w-24 shrink-0">组长反馈</span>
                </div>
                {records.map(v => (
                  <div key={v.id} className="flex items-start px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a] border-b border-[#f0f0f0]">
                    <span className="w-40 shrink-0">{v.visit_date}{!v.arrived && <span className="ml-1 text-[#a0a4ab]">（未参与）</span>}</span>
                    <span className="w-20 shrink-0 truncate">{v.referrer_handler || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.needs || "-"}</span>
                    <span className="flex-1 whitespace-pre-wrap">{v.feedback || v.experience || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.healing_notes || "-"}</span>
                    <span className="w-24 shrink-0 whitespace-pre-wrap">{v.group_leader_feedback || "-"}</span>
                  </div>
                ))}
              </>
            )
          })() : detailType === "payment" ? (() => {
            const records = (detailData.payment_records || []).filter(r => !r.voided)
            return records.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无成交记录</div>
            ) : (
              <>
                <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                  <span className="w-16 shrink-0">项目类型</span>
                  <span className="flex-1">项目名称</span>
                  <span className="w-16 shrink-0 text-center">购买场次</span>
                  <span className="w-20 shrink-0 text-right">金额</span>
                  <span className="w-16 shrink-0 text-right">成交人</span>
                </div>
                {records.map((r, i) => (
                  <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a] border-b border-[#f0f0f0]">
                    <span className="w-16 shrink-0">{r.type || "-"}</span>
                    <span className="flex-1 truncate">{r.name || "-"}</span>
                    <span className="w-16 shrink-0 text-center">{r.quantity != null ? `${r.quantity}次` : "-"}</span>
                    <span className="w-20 shrink-0 text-right">¥{r.amount.toLocaleString()}</span>
                    <span className="w-16 shrink-0 text-right truncate">{r.closer_name || "-"}</span>
                  </div>
                ))}
              </>
            )
          })() : (() => {
            const records = (detailData.activities || [])
              .filter(a => detailType === "activity_today" ? a.date === detailDate : true)
              .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
            return records.length === 0 ? (
              <div className="px-4 py-8 text-center text-[#8f959e] text-[12px]">暂无参与记录</div>
            ) : (
              <>
                <div className="flex items-center px-4 py-1.5 text-[11px] text-[#8f959e] border-b border-[#f0f0f0]">
                  <span className="w-20 shrink-0">日期</span>
                  <span className="w-16 shrink-0">类型</span>
                  <span className="flex-1">活动名称</span>
                  <span className="w-20 shrink-0">老师</span>
                  <span className="w-12 shrink-0 text-right">身份</span>
                </div>
                {records.map((a, i) => (
                  <div key={i} className="flex items-center px-4 py-2 hover:bg-[#f7f8fa] text-[12px] text-[#4e535a] border-b border-[#f0f0f0]">
                    <span className="w-20 shrink-0">{a.date}</span>
                    <span className="w-16 shrink-0">{a.type || "-"}</span>
                    <span className="flex-1 truncate">{a.name || "-"}</span>
                    <span className="w-20 shrink-0 truncate">{a.host || "-"}</span>
                    <span className="w-12 shrink-0 text-right">{a.role || "-"}</span>
                  </div>
                ))}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* 客户详情弹窗 */}
      <Dialog open={customerDetailOpen} onOpenChange={(open) => { setCustomerDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <DetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setCustomerDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
