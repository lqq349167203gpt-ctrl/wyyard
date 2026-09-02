import { useEffect, useState, useMemo, useCallback, useRef, startTransition } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, ChevronLeft, Lock, Unlock } from "lucide-react"
import VisitsDetailView from "@/components/visits/detail-view"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, visitApi, dailyGroupingApi, spaceApi, visitVerificationApi, type CustomerLight, type Space, type VisitVerification } from "@/lib/api"
import type { VisitRowSummary } from "@/components/visits/batch-input-table"

import CustomerDetailView from "@/pages/healing-records/components/detail-view"
import { SpaceDropdown } from "@/components/space-dropdown"
import { CalendarDatePicker } from "@/components/calendar-date-picker"
import { useEditPermissions } from "@/hooks/use-edit-permissions"

const today = new Date().toLocaleDateString("sv-SE")

function formatDate(d: Date): string {
  return d.toLocaleDateString("sv-SE")
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}
function getWeekday(d: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(d).getDay()]
}

export default function ClassRecordsPage() {
  const navigate = useNavigate()
  const editPermissions = useEditPermissions()
  const [allCustomers, setAllCustomers] = useState<CustomerLight[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spacesLoaded, setSpacesLoaded] = useState(false)
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("selected-space-id") || "" } catch { return "" }
  })

  const [detailDate, setDetailDate] = useState(() => {
    const saved = localStorage.getItem("shared-selected-date") || localStorage.getItem("visit_selected_date")
    return saved || today
  })
  useEffect(() => {
    localStorage.setItem("shared-selected-date", detailDate)
    localStorage.setItem("visit_selected_date", detailDate)
  }, [detailDate])
  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)
  const [activityCustomerId, setActivityCustomerId] = useState<string | null>(null)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [activityList, setActivityList] = useState<{ type: string; name: string; role: string; teacher: string }[]>([])
  const [activityNickname, setActivityNickname] = useState("")

  // 共享状态
  const [dayVisits, setDayVisits] = useState<{ id: string; nickname: string; member_type: string }[]>([])
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const [calendarVisitCounts, setCalendarVisitCounts] = useState<Record<string, number>>({})
  const [verificationMap, setVerificationMap] = useState<Record<string, VisitVerification>>({})
  const [verificationSubmitting, setVerificationSubmitting] = useState(false)
  const [verificationConfirmOpen, setVerificationConfirmOpen] = useState(false)
  const verificationFlushRef = useRef<(() => Promise<void>) | null>(null)

  // 人员分组
  const [groups, setGroups] = useState<{ name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]>([])

  // 空间未配置提示弹窗
  const [noSpacesDialogOpen, setNoSpacesDialogOpen] = useState(false)

  const load = () => {
    customerApi.light()
      .then((customers) => {
        setAllCustomers(customers)
      })
      .catch((e) => { console.error("customerApi.light failed:", e) })
    spaceApi.list()
      .then((data) => {
        setSpaces(data)
        const nextSpaceId = data.some(space => space.id === selectedSpaceId)
          ? selectedSpaceId
          : data[0]?.id || ""
        if (nextSpaceId !== selectedSpaceId) {
          setSelectedSpaceId(nextSpaceId)
          if (nextSpaceId) localStorage.setItem("selected-space-id", nextSpaceId)
        }
      })
      .catch(() => {})
      .finally(() => setSpacesLoaded(true))
  }

  useEffect(() => { load() }, [])

  // 加载人员分组
  const groupsLoadedDateRef = useRef<string>("")
  useEffect(() => {
    dailyGroupingApi.get(detailDate).then((data) => {
      groupsLoadedDateRef.current = detailDate
      setGroups(data.groups || [])
    }).catch(() => { groupsLoadedDateRef.current = detailDate; setGroups([]) })
  }, [detailDate])

  // 人员删除后，同步清理分组中的该人员并持久化
  useEffect(() => {
    // 仅当 groups 和 dayVisits 都已加载为当前日期时才清理
    if (groupsLoadedDateRef.current !== detailDate) return
    if (groups.length === 0 || dayVisits.length === 0) return
    const visitIdSet = new Set(dayVisits.map(v => v.id))
    const hasStale = groups.some(g =>
      (g.leader_id && !visitIdSet.has(g.leader_id)) ||
      (g.deputy_id && !visitIdSet.has(g.deputy_id)) ||
      g.member_ids.some(id => !visitIdSet.has(id))
    )
    if (!hasStale) return
    const cleaned = groups.map(g => ({
      ...g,
      leader_id: g.leader_id && visitIdSet.has(g.leader_id) ? g.leader_id : "",
      deputy_id: g.deputy_id && visitIdSet.has(g.deputy_id) ? g.deputy_id : "",
      member_ids: g.member_ids.filter(id => visitIdSet.has(id)),
    })).filter(g => g.leader_id || g.deputy_id || g.member_ids.length > 0)
    setGroups(cleaned)
    dailyGroupingApi.upsert({ date: detailDate, groups: cleaned }).catch(() => {})
  }, [detailDate, dayVisits, groups])

  // 加载日期范围内的到场人数（轻量 API，日期滑块需要）
  const refreshVisitCounts = useCallback(() => {
    if (!spacesLoaded || !selectedSpaceId) {
      setVisitCounts({})
      return
    }
    const endDate = formatDate(addDays(new Date(dateRangeStart), 20))
    visitApi.counts({ startDate: dateRangeStart, endDate, spaceId: selectedSpaceId })
      .then(setVisitCounts)
      .catch(() => {})
  }, [dateRangeStart, selectedSpaceId, spacesLoaded])
  useEffect(() => { refreshVisitCounts() }, [refreshVisitCounts])

  const handleSpaceSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedSpaceId(id)
    })
    localStorage.setItem("selected-space-id", id)
  }, [])

  const dateRange = useMemo(() => Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i))), [dateRangeStart])

  // detailDate 变化时，确保日期在可视范围内
  useEffect(() => {
    if (detailDate < dateRange[0] || detailDate > dateRange[dateRange.length - 1]) {
      setDateRangeStart(formatDate(addDays(new Date(detailDate), -7)))
    }
  }, [detailDate, dateRange])

  // 权限检查
  const userPermissions = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("userPermissions") || "[]") } catch { return [] }
  }, [])
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} }
  }, [])
  const isSuperAdmin = currentUser?.role === "超级管理员"
  const canManageVerification = isSuperAdmin || editPermissions.visit_lock
  const hasPerm = (key: string) => isSuperAdmin || userPermissions.includes(key) || userPermissions.includes("class-records")

  const handleVisitsDataLoaded = useCallback((visits: VisitRowSummary[]) => {
    setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
  }, [])

  const loadVerificationRange = useCallback((startDate: string, endDate: string) => {
    if (!selectedSpaceId) return
    visitVerificationApi.list(startDate, endDate, selectedSpaceId).then((items) => {
      setVerificationMap((current) => {
        const next = { ...current }
        items.forEach((item) => { next[item.date] = item })
        return next
      })
    }).catch(() => {})
  }, [selectedSpaceId])

  useEffect(() => {
    if (!selectedSpaceId) { setVerificationMap({}); return }
    setVerificationMap({})
    loadVerificationRange(dateRange[0], dateRange[dateRange.length - 1])
  }, [dateRange, loadVerificationRange, selectedSpaceId])

  const calendarVisitCountSeqRef = useRef(0)
  useEffect(() => {
    calendarVisitCountSeqRef.current += 1
    setCalendarVisitCounts({})
  }, [selectedSpaceId])

  const handleCalendarMonthChange = useCallback((month: string) => {
    const [year, monthNumber] = month.split("-").map(Number)
    const endDay = new Date(year, monthNumber, 0).getDate()
    const startDate = `${month}-01`
    const endDate = `${month}-${String(endDay).padStart(2, "0")}`
    loadVerificationRange(startDate, endDate)
    const seq = ++calendarVisitCountSeqRef.current
    if (!selectedSpaceId) {
      setCalendarVisitCounts({})
      return
    }
    visitApi.counts({ startDate, endDate, spaceId: selectedSpaceId })
      .then((counts) => {
        if (seq === calendarVisitCountSeqRef.current) setCalendarVisitCounts(counts)
      })
      .catch(() => {
        if (seq === calendarVisitCountSeqRef.current) setCalendarVisitCounts({})
      })
  }, [loadVerificationRange, selectedSpaceId])

  const currentVerification = verificationMap[detailDate]
  const isDayVerified = currentVerification?.is_verified === true
  const verificationStatuses = useMemo(
    () => Object.fromEntries(Object.entries(verificationMap).map(([date, item]) => [date, item.is_verified])),
    [verificationMap],
  )

  const submitVerification = async () => {
    if (!selectedSpaceId || verificationSubmitting) return
    setVerificationSubmitting(true)
    try {
      if (!isDayVerified) await verificationFlushRef.current?.()
      const result = isDayVerified
        ? await visitVerificationApi.unverify(detailDate, selectedSpaceId)
        : await visitVerificationApi.verify(detailDate, selectedSpaceId)
      setVerificationMap((current) => ({ ...current, [detailDate]: result }))
    } finally {
      setVerificationSubmitting(false)
      setVerificationConfirmOpen(false)
    }
  }

  return (
    <div className="px-6 pt-4 pb-6 flex flex-col min-h-0 min-w-0" style={{ height: 'calc(100vh - 48px)' }}>

      {/* 主内容区 */}
      <div className="flex flex-col min-h-0 flex-1 gap-2">
      <div className="border-b-[0.5px] border-[#f0f1f2]">
      {/* 选中日期显示 + 操作按钮 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0 relative">
          <CalendarDatePicker
            detailDate={detailDate}
            onSelectDate={(d) => startTransition(() => setDetailDate(d))}
            dateStatuses={verificationStatuses}
            dateCounts={calendarVisitCounts}
            onMonthChange={handleCalendarMonthChange}
            verifiedDotColor="green"
          />
          <div className="ml-1.5"><SpaceDropdown spaces={spaces} selectedSpaceId={selectedSpaceId} onSelect={handleSpaceSelect} /></div>
        </div>
        <span className={`ml-2 text-[12px] ${isDayVerified ? "text-[#3370ff]" : "text-[#8f959e]"}`}>
          {isDayVerified ? `已核对${currentVerification?.verified_by ? ` · ${currentVerification.verified_by}` : ""}` : "未核对"}
        </span>
        {canManageVerification && (
          <button
            type="button"
            onClick={() => setVerificationConfirmOpen(true)}
            disabled={!selectedSpaceId || verificationSubmitting}
            className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] text-[#4e535a] transition-colors hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDayVerified ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {isDayVerified ? "解锁" : "核对并锁定"}
          </button>
        )}
        <div className="flex-1" />
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
                  <span className={`text-[9px] leading-none h-3 flex items-center mt-0.5 ${isSelected ? "text-white/80" : "text-[#b0b5bb]"}`}>
                    {dayCount > 0 ? `${dayCount}人` : ""}
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

      {/* 内容区 */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <VisitsDetailView
            externalDate={detailDate}
            onExternalDateChange={(d) => startTransition(() => setDetailDate(d))}
            hideDateBar
            onCustomerClick={(id) => { setSelectedCustomerId(id); setCustomerDetailOpen(true) }}
            onActivityClick={(id) => {
              const customer = allCustomers.find(c => c.id === id)
              setActivityNickname(customer?.nickname || customer?.name || "")
              setActivityCustomerId(id)
              visitApi.list(detailDate, id, selectedSpaceId).then(visits => {
                const acts = (visits[0]?.activities || []).map(a => ({ type: a.type, name: a.name, role: a.role, teacher: a.owner_name }))
                setActivityList(acts)
                setActivityDialogOpen(true)
              }).catch(() => {
                setActivityList([])
                setActivityDialogOpen(true)
              })
            }}
            onDataLoaded={handleVisitsDataLoaded}
            onCountsRefresh={refreshVisitCounts}
            spaceId={selectedSpaceId}
            onRequireSpaces={spaces.length === 0 ? () => setNoSpacesDialogOpen(true) : undefined}
            groups={groups}
            verified={isDayVerified}
            onFlushRef={(flush) => { verificationFlushRef.current = flush }}
          />
        </div>
      </div>

      {/* 空间未配置提示 */}
      <AlertDialog open={noSpacesDialogOpen} onOpenChange={setNoSpacesDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>需要先配置空间，才能添加到场人员。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setNoSpacesDialogOpen(false); navigate("/courses/spaces") }}>
              前往配置
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={verificationConfirmOpen} onOpenChange={setVerificationConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isDayVerified ? "解锁当天邀约" : "确认当天邀约无误"}</AlertDialogTitle>
            <AlertDialogDescription>
              {isDayVerified ? "解锁后可继续修改当天全部邀约资料。" : "核对后，除来访需求、客户信息和跟进点外，其余资料及操作都会锁定。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={submitVerification}>{isDayVerified ? "确认解锁" : "确认并锁定"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 客户详情弹窗 */}
      <Dialog open={customerDetailOpen} onOpenChange={(open) => { setCustomerDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-[1180px] max-h-[90vh] overflow-y-auto p-0 gap-0">
          <CustomerDetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setCustomerDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>

      {/* 参与活动弹窗 */}
      <Dialog open={activityDialogOpen} onOpenChange={(open) => { setActivityDialogOpen(open); if (!open) { setActivityCustomerId(null); setActivityList([]) } }}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <div className="px-4 py-3 border-b border-[#f0f0f0]">
            <span className="text-[13px] font-medium text-[#2b2f36]">{activityNickname}</span>
            <span className="text-[12px] text-[#8f959e] ml-2">参与活动</span>
          </div>
          <div className="px-4 py-2 max-h-[300px] overflow-y-auto">
            {activityList.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#8f959e]">暂无活动</div>
            ) : (
              <div className="divide-y divide-[#f0f0f0]">
                {activityList.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 py-2">
                    <span className="text-[11px] text-[#8f959e] bg-[#f5f6f8] px-1.5 py-0.5 rounded shrink-0">{a.type}</span>
                    <span className="text-[12px] text-[#2b2f36] shrink-0">{a.name}</span>
                    {a.teacher && <span className="text-[11px] text-[#8f959e] bg-[#f7f8f9] px-1.5 py-0.5 rounded shrink-0">{a.teacher}</span>}
                    <span className="text-[12px] text-[#8f959e] shrink-0 ml-auto">{a.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  )
}
