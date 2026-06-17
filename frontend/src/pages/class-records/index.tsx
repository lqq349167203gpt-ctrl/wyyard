import { useEffect, useState, useMemo, useCallback, startTransition } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, ChevronLeft } from "lucide-react"
import VisitsDetailView from "@/components/visits/detail-view"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, visitApi, dailyGroupingApi, spaceApi, type Customer, type VisitRecord, type Space } from "@/lib/api"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

import CustomerDetailView from "@/pages/healing-records/components/detail-view"
import { SpaceDropdown } from "@/components/space-dropdown"
import { CalendarDatePicker } from "@/components/calendar-date-picker"

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

export default function ClassRecordsPage() {
  const navigate = useNavigate()
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("selected-space-id") || "" } catch { return "" }
  })

  const [detailDate, setDetailDate] = useState(() => {
    const saved = localStorage.getItem("visit_selected_date")
    return saved || today
  })
  useEffect(() => { localStorage.setItem("visit_selected_date", detailDate) }, [detailDate])
  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)

  // 共享状态
  const [dayVisits, setDayVisits] = useState<{ id: string; nickname: string; member_type: string }[]>([])
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const { permissions: cp, ready: cpReady } = useCustomerPermissions("class_records")

  // 人员分组
  const [groups, setGroups] = useState<{ name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]>([])

  // 空间未配置提示弹窗
  const [noSpacesDialogOpen, setNoSpacesDialogOpen] = useState(false)

  const load = () => {
    customerApi.list()
      .then((customers) => {
        setAllCustomers(customers)
      })
      .catch((e) => { console.error("customerApi.list failed:", e) })
    spaceApi.list().then((data) => {
      setSpaces(data)
      if (!selectedSpaceId && data.length > 0) {
        setSelectedSpaceId(data[0].id)
        localStorage.setItem("selected-space-id", data[0].id)
      }
    }).catch(() => {})
  }

  useEffect(() => { load() }, [])

  // 加载人员分组
  useEffect(() => {
    dailyGroupingApi.get(detailDate).then((data) => {
      setGroups(data.groups || [])
    }).catch(() => setGroups([]))
  }, [detailDate])

  // 人员删除后，同步清理分组中的该人员并持久化
  useEffect(() => {
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
  }, [dayVisits, groups])

  // 加载日期范围内的到场人数（轻量 API，日期滑块需要）
  useEffect(() => {
    if (!cpReady) return
    const memberTypes = cp.join(",")
    const endDate = formatDate(addDays(new Date(dateRangeStart), 20))
    visitApi.counts({ memberTypes: memberTypes || undefined, startDate: dateRangeStart, endDate, spaceId: selectedSpaceId || undefined })
      .then(setVisitCounts)
      .catch(() => {})
  }, [dateRangeStart, cpReady, cp, selectedSpaceId])

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
  const hasPerm = (key: string) => isSuperAdmin || userPermissions.includes(key) || userPermissions.includes("class-records")

  const handleVisitsDataLoaded = useCallback((visits: VisitRecord[]) => {
    setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
  }, [])

  return (
    <div className="px-6 pt-4 pb-6 flex flex-col min-h-0 min-w-0" style={{ height: 'calc(100vh - 48px)' }}>

      {/* 主内容区 */}
      <div className="flex flex-col min-h-0 flex-1 gap-2">
      <div className="bg-[#f8faff] rounded-lg px-4 py-[14px] border-b-[0.5px] border-[#e8e8e8]">
      {/* 选中日期显示 + 操作按钮 */}
      <div className="flex items-center gap-1.5">
        <CalendarDatePicker detailDate={detailDate} onSelectDate={(d) => startTransition(() => setDetailDate(d))} />
        <SpaceDropdown spaces={spaces} selectedSpaceId={selectedSpaceId} onSelect={handleSpaceSelect} />
      </div>
        {/* 日期滚动条 */}
        <div className="flex items-center justify-between gap-1 mt-1 h-[52px]">
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

      {/* 内容区 */}
      <div className="flex flex-col flex-1 min-h-0 min-w-0">
        <div className="flex-1 overflow-y-auto min-w-0">
          <VisitsDetailView
            externalDate={detailDate}
            onExternalDateChange={(d) => startTransition(() => setDetailDate(d))}
            hideDateBar
            onCustomerClick={(id) => { setSelectedCustomerId(id); setCustomerDetailOpen(true) }}
            onDataLoaded={handleVisitsDataLoaded}
            spaceId={selectedSpaceId}
            onRequireSpaces={spaces.length === 0 ? () => setNoSpacesDialogOpen(true) : undefined}
            groups={groups}
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

      {/* 客户详情弹窗 */}
      <Dialog open={customerDetailOpen} onOpenChange={(open) => { setCustomerDetailOpen(open); if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          <CustomerDetailView
            selectedCustomerId={selectedCustomerId}
            onClearSelection={() => setCustomerDetailOpen(false)}
            hideSearch
          />
        </DialogContent>
      </Dialog>

      </div>
    </div>
  )
}
