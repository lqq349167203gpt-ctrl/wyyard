import { useEffect, useState, useRef, useMemo, useCallback, startTransition } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { BookOpen, ChevronRight, ChevronLeft, X } from "lucide-react"
import VisitsDetailView from "@/components/visits/detail-view"
import GroupingView from "@/components/grouping-view"
import { Button } from "@/components/ui/button"

import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { classRecordApi, groupCaseSessionApi, emotionalReleaseSessionApi, energyKnotSessionApi, internalCourseSessionApi, ohCardReadingSessionApi, courseApi, customerApi, visitApi, dailyGroupingApi, spaceApi, membershipCardApi, type ClassRecord, type GroupCaseSession, type EmotionalReleaseSession, type EnergyKnotSession, type InternalCourseSession, type OhCardReadingSession, type Course, type Customer, type VisitRecord, type Space, type MembershipCard } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"
import ArrivalConfirmationView from "./arrival-confirmation"
import ActivityCardList from "./activity-card-list"
import CustomerDetailView from "@/pages/healing-records/components/detail-view"
import { SpaceDropdown } from "@/components/space-dropdown"
import { CalendarDatePicker } from "@/components/calendar-date-picker"
import { useClassRecordDialogs } from "./use-class-record-dialogs"
import { useGcsDialogs } from "./use-gcs-dialogs"
import { useErsDialogs } from "./use-ers-dialogs"
import { useEksDialogs } from "./use-eks-dialogs"
import { useIcsDialogs } from "./use-ics-dialogs"
import { useOcrDialogs } from "./use-ocr-dialogs"

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

export default function ClassRecordsPage({ standaloneTab }: { standaloneTab?: "activities" }) {
  const navigate = useNavigate()
  const enterToNext = useEnterToNext()
  const [records, setRecords] = useState<ClassRecord[]>([])
  const [groupCaseSessions, setGroupCaseSessions] = useState<GroupCaseSession[]>([])
  const [emotionalReleaseSessions, setEmotionalReleaseSessions] = useState<EmotionalReleaseSession[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [teachers, setTeachers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("selected-space-id") || "" } catch { return "" }
  })

  const [detailDate, setDetailDate] = useState(today)
  const [dateRangeStart, setDateRangeStart] = useState(() => formatDate(addDays(new Date(), -7)))
  const [detailTab, setDetailTab] = useState<"visitors" | "activities" | "arrival_confirmation" | "grouping">(() => {
    try {
      const perms: string[] = JSON.parse(localStorage.getItem("userPermissions") || "[]")
      const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
      const isSA = currentUser?.role === "超级管理员"
      const has = (k: string) => isSA || perms.includes(k) || perms.includes("class-records")
      if (has("class-records-visitors")) return "visitors"
      if (has("class-records-activities")) return "activities"
      if (has("class-records-arrival")) return "arrival_confirmation"
    } catch {}
    return "visitors"
  })
  const isActivitiesView = standaloneTab === "activities" || detailTab === "activities"
  const effectiveDetailTab = standaloneTab || detailTab
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [customerDetailOpen, setCustomerDetailOpen] = useState(false)

  // 共享状态
  const [dayVisits, setDayVisits] = useState<{ id: string; nickname: string; member_type: string }[]>([])
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const { permissions: cp, ready: cpReady } = useCustomerPermissions("class_records")
  const [fullVisits, setFullVisits] = useState<VisitRecord[]>([])
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false)
  const [arrivalVisit, setArrivalVisit] = useState<VisitRecord | null>(null)
  const [arrivalTime, setArrivalTime] = useState("09:00")
  const [arrivalSaving, setArrivalSaving] = useState(false)
  const [draggingVisitorId, setDraggingVisitorId] = useState<string | null>(null)

  // 人员分组
  const [groups, setGroups] = useState<{ name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]>([])

  // 会员卡
  const [membershipCards, setMembershipCards] = useState<MembershipCard[]>([])

  // 空间未配置提示弹窗
  const [noSpacesDialogOpen, setNoSpacesDialogOpen] = useState(false)

  // 会员活动余额不足警告弹窗
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningMsg, setWarningMsg] = useState("")
  const handleApiError = (error: any) => {
    const msg = error?.message || ""
    if (msg.includes("已无剩余活动次数")) {
      setWarningMsg(msg)
      setWarningOpen(true)
    }
  }

  const load = () => {
    classRecordApi.list()
      .then(setRecords)
      .catch((e) => { console.error("classRecordApi.list failed:", e) })
      .finally(() => setLoading(false))
    groupCaseSessionApi.list()
      .then(setGroupCaseSessions)
      .catch((e) => { console.error("groupCaseSessionApi.list failed:", e) })
    emotionalReleaseSessionApi.list()
      .then(setEmotionalReleaseSessions)
      .catch((e) => { console.error("emotionalReleaseSessionApi.list failed:", e) })
    energyKnotSessionApi.list()
      .then(setEnergyKnotSessions)
      .catch((e) => { console.error("energyKnotSessionApi.list failed:", e) })
    internalCourseSessionApi.list()
      .then(setInternalCourseSessions)
      .catch((e) => { console.error("internalCourseSessionApi.list failed:", e) })
    ohCardReadingSessionApi.list()
      .then(setOhCardReadingSessions)
      .catch((e) => { console.error("ohCardReadingSessionApi.list failed:", e) })
    courseApi.list().then(setCourses).catch((e) => { console.error("courseApi.list failed:", e) })
    customerApi.list()
      .then((customers) => {
        setAllCustomers(customers)
        setTeachers(customers.filter(c => c.positions?.includes("课程老师")))
      })
      .catch((e) => { console.error("customerApi.list failed:", e) })
    spaceApi.list().then((data) => {
      setSpaces(data)
      if (!selectedSpaceId && data.length > 0) {
        setSelectedSpaceId(data[0].id)
        localStorage.setItem("selected-space-id", data[0].id)
      }
    }).catch(() => {})
    membershipCardApi.list().then(setMembershipCards).catch((e) => { console.error("membershipCardApi.list failed:", e) })
  }

  const loadClassRecords = () => classRecordApi.list().then(setRecords).catch((e) => { console.error("loadClassRecords failed:", e) })
  const loadGcs = () => groupCaseSessionApi.list().then(setGroupCaseSessions).catch((e) => { console.error("loadGcs failed:", e) })
  const loadErs = () => emotionalReleaseSessionApi.list().then(setEmotionalReleaseSessions).catch((e) => { console.error("loadErs failed:", e) })
  const loadEks = () => energyKnotSessionApi.list().then(setEnergyKnotSessions).catch((e) => { console.error("loadEks failed:", e) })
  const loadIcs = () => internalCourseSessionApi.list().then(setInternalCourseSessions).catch((e) => { console.error("loadIcs failed:", e) })
  const loadOcr = () => ohCardReadingSessionApi.list().then(setOhCardReadingSessions).catch((e) => { console.error("loadOcr failed:", e) })

  useEffect(() => { load() }, [])

  // 加载当天到场人员（切换日期或切换到非 visitors tab 时刷新）
  // visitors tab 由 VisitsDetailView 自行加载，避免重复 API 调用
  useEffect(() => {
    if (effectiveDetailTab === "visitors") return
    visitApi.list(detailDate, undefined, selectedSpaceId).then((visits) => {
      setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
      setFullVisits(visits)
    }).catch(() => { setDayVisits([]); setFullVisits([]) })
  }, [detailDate, effectiveDetailTab, selectedSpaceId])

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

  // 点击外部关闭日历选择器

  // 拖拽到活动卡片的目标
  const [dragOverActivityId, setDragOverActivityId] = useState<string | null>(null)
  // 成员选择弹窗
  const [memberDialogOpen, setMemberDialogOpen] = useState(false)
  const [memberDialogType, setMemberDialogType] = useState<string>("")
  const [memberDialogRecord, setMemberDialogRecord] = useState<any>(null)
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>([])
  const [localHostId, setLocalHostId] = useState<string>("")
  const initialSelectedIdsRef = useRef<string[]>([])

  const getCurrentParticipantIds = useCallback((type: string, record: any): string[] => {
    if (type === "class") {
      const groupIds = (record.groups || []).flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean))
      return [...new Set([...groupIds, ...(record.participant_ids || [])])]
    }
    if (type === "gcs") {
      return [...(record.participant_ids || []), record.host_id, record.achiever_id].filter(Boolean)
    }
    if (type === "ers") {
      return [...(record.participant_ids || [])].filter(Boolean)
    }
    if (type === "eks") {
      return [...(record.host_ids || [])].filter(Boolean)
    }
    if (type === "ics") {
      return [...(record.participant_ids || [])].filter(Boolean)
    }
    if (type === "ocr") {
      return [...(record.participant_ids || []), record.host_id, record.achiever_id].filter(Boolean)
    }
    return []
  }, [])

  const onOpenMemberDialog = useCallback((type: string, record: any) => {
    setMemberDialogType(type)
    setMemberDialogRecord(record)
    const ids = getCurrentParticipantIds(type, record)
    const hostId = (type === "gcs" || type === "ers" || type === "ocr") ? (record.host_id || "") : ""
    // 主持人、成就君、案主不在参与者列表中显示
    const excludeIds = [hostId, record.achiever_id, record.owner_id].filter(Boolean)
    setLocalSelectedIds(ids.filter(id => !excludeIds.includes(id)))
    initialSelectedIdsRef.current = [...ids]
    setLocalHostId(hostId)
    setMemberDialogOpen(true)
  }, [getCurrentParticipantIds])

  const handleSpaceSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedSpaceId(id)
    })
    localStorage.setItem("selected-space-id", id)
  }, [])

  const [energyKnotSessions, setEnergyKnotSessions] = useState<EnergyKnotSession[]>([])
  const [internalCourseSessions, setInternalCourseSessions] = useState<InternalCourseSession[]>([])
  const [ohCardReadingSessions, setOhCardReadingSessions] = useState<OhCardReadingSession[]>([])

  const dateRange = useMemo(() => Array.from({ length: 21 }, (_, i) => formatDate(addDays(new Date(dateRangeStart), i))), [dateRangeStart])

  // detailDate 变化时，确保日期在可视范围内
  useEffect(() => {
    if (detailDate < dateRange[0] || detailDate > dateRange[dateRange.length - 1]) {
      setDateRangeStart(formatDate(addDays(new Date(detailDate), -7)))
    }
  }, [detailDate, dateRange])

  const detailRecords = useMemo(() => records
    .filter(r => r.date === detailDate)
    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || "")), [records, detailDate])

  const detailGcs = useMemo(() => groupCaseSessions.filter(s => s.date === detailDate), [groupCaseSessions, detailDate])
  const detailErs = useMemo(() => emotionalReleaseSessions.filter(s => s.date === detailDate), [emotionalReleaseSessions, detailDate])
  const detailEks = useMemo(() => energyKnotSessions.filter(s => s.date === detailDate), [energyKnotSessions, detailDate])
  const detailIcs = useMemo(() => internalCourseSessions.filter(s => s.date === detailDate), [internalCourseSessions, detailDate])
  const detailOcr = useMemo(() => ohCardReadingSessions.filter(s => s.date === detailDate), [ohCardReadingSessions, detailDate])

  // 详细视图：合并五种记录，按开始时间排序
  const unifiedDetailRecords = useMemo(() => [
    ...detailRecords.map(r => ({ type: "class" as const, data: r, date: r.date })),
    ...detailGcs.map(s => ({ type: "gcs" as const, data: s, date: s.date })),
    ...detailErs.map(s => ({ type: "ers" as const, data: s, date: s.date })),
    ...detailEks.map(s => ({ type: "eks" as const, data: s, date: s.date })),
    ...detailIcs.map(s => ({ type: "ics" as const, data: s, date: s.date })),
    ...detailOcr.map(s => ({ type: "ocr" as const, data: s, date: s.date })),
  ]
  .filter(r => !selectedSpaceId || (r.data as any).space_id === selectedSpaceId)
  .sort((a, b) => {
    const at = a.data.start_time || ""
    const bt = b.data.start_time || ""
    if (!at && !bt) return 0
    if (!at) return 1
    if (!bt) return -1
    return at.localeCompare(bt)
  }), [detailRecords, detailGcs, detailErs, detailEks, detailIcs, detailOcr, selectedSpaceId])

  // 过滤掉已删除人员的活动记录（参与者、老师、成就君等）
  const filteredRecords = useMemo(() => {
    if (dayVisits.length === 0) return unifiedDetailRecords
    const visitorIds = new Set(dayVisits.map(v => v.id))
    return unifiedDetailRecords.map(ur => {
      const d = ur.data as any
      let filtered = false
      const patch: any = {}

      // 沙龙：过滤 teacher_ids 和 participant_ids
      if (d.teacher_ids?.some((id: string) => !visitorIds.has(id))) {
        patch.teacher_ids = d.teacher_ids.filter((id: string) => visitorIds.has(id))
        filtered = true
      }
      if (d.participant_ids?.some((id: string) => !visitorIds.has(id))) {
        patch.participant_ids = d.participant_ids.filter((id: string) => visitorIds.has(id))
        filtered = true
      }

      // 觉醒游戏/OH卡：过滤 host_id, achiever_id, participant_ids
      if (d.host_id && !visitorIds.has(d.host_id)) { patch.host_id = ""; filtered = true }
      if (d.achiever_id && !visitorIds.has(d.achiever_id)) { patch.achiever_id = ""; patch.achiever_name = ""; filtered = true }
      if (d.host_ids?.some((id: string) => !visitorIds.has(id))) {
        patch.host_ids = d.host_ids.filter((id: string) => visitorIds.has(id))
        patch.host_names = (d.host_names || []).filter((_: string, i: number) => visitorIds.has(d.host_ids[i]))
        filtered = true
      }

      // 沙龙：过滤 groups 中已删除的成员
      if (d.groups?.length > 0) {
        const cleanedGroups = d.groups.map((g: any) => ({
          ...g,
          leader_id: g.leader_id && visitorIds.has(g.leader_id) ? g.leader_id : "",
          deputy_id: g.deputy_id && visitorIds.has(g.deputy_id) ? g.deputy_id : "",
          member_ids: (g.member_ids || []).filter((id: string) => visitorIds.has(id)),
        })).filter((g: any) => g.leader_id || g.deputy_id || g.member_ids.length > 0)
        if (cleanedGroups.length !== d.groups.length || cleanedGroups.some((g: any, i: number) =>
          g.leader_id !== d.groups[i]?.leader_id || g.deputy_id !== d.groups[i]?.deputy_id ||
          g.member_ids.length !== d.groups[i]?.member_ids.length
        )) {
          patch.groups = cleanedGroups
          filtered = true
        }
      }

      if (!filtered) return ur
      return { ...ur, data: { ...d, ...patch } }
    })
  }, [unifiedDetailRecords, dayVisits])

  const getMemberName = useCallback((id: string) => {
    const c = allCustomers.find(c => c.id === id)
    return c?.nickname || c?.name || id
  }, [allCustomers])

  // 当日活动：按每日分组整理人员（用于左侧人员栏）
  const visitorGroupSections = useMemo(() => {
    const sections: { groupName: string; members: { id: string; nickname: string; role: string; present: boolean }[] }[] = []
    const assignedIds = new Set<string>()

    for (const group of groups) {
      const members: { id: string; nickname: string; role: string; present: boolean }[] = []

      if (group.leader_id && dayVisits.some(v => v.id === group.leader_id)) {
        members.push({ id: group.leader_id, nickname: getMemberName(group.leader_id), role: "组长", present: true })
        assignedIds.add(group.leader_id)
      }
      if (group.deputy_id && dayVisits.some(v => v.id === group.deputy_id)) {
        members.push({ id: group.deputy_id, nickname: getMemberName(group.deputy_id), role: "副组长", present: true })
        assignedIds.add(group.deputy_id)
      }
      for (const mid of (group.member_ids || [])) {
        if (mid !== group.leader_id && mid !== group.deputy_id && dayVisits.some(v => v.id === mid)) {
          members.push({ id: mid, nickname: getMemberName(mid), role: "", present: true })
          assignedIds.add(mid)
        }
      }

      if (members.length > 0) {
        sections.push({ groupName: group.name, members })
      }
    }

    // 未分组的到场人员
    const ungrouped = dayVisits.filter(v => !assignedIds.has(v.id))
    if (ungrouped.length > 0) {
      sections.push({ groupName: "未分组", members: ungrouped.map(v => ({ id: v.id, nickname: v.nickname, role: "", present: true })) })
    }

    return sections
  }, [groups, dayVisits, getMemberName])

  const getTeacherNames = useCallback((teacherIds: string[]) => {
    return teacherIds
      .map(id => teachers.find(t => t.id === id))
      .filter(Boolean)
      .map(t => t!.nickname || t!.name || "未命名")
  }, [teachers])

  // 调用 hooks
  const classRecordDialogs = useClassRecordDialogs({
    allCustomers, teachers, courses, groups, draggingVisitorId, setDraggingVisitorId,
    getMemberName, onReload: loadClassRecords, onApiError: handleApiError,
  })
  const gcsDialogs = useGcsDialogs({
    allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
    getMemberName, onReload: loadGcs, onApiError: handleApiError,
  })
  const ersDialogs = useErsDialogs({
    allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
    getMemberName, onReload: loadErs, onApiError: handleApiError,
  })
  const eksDialogs = useEksDialogs({
    allCustomers, onReload: loadEks,
  })
  const icsDialogs = useIcsDialogs({
    allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
    getMemberName, onReload: loadIcs,
  })
  const ocrDialogs = useOcrDialogs({
    allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
    getMemberName, onReload: loadOcr, onApiError: handleApiError,
  })

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
    setFullVisits(visits)
  }, [])

  return (
    <div className="px-6 pt-4 pb-6 flex flex-col min-h-0" style={{ height: 'calc(100vh - 48px)' }}>

      {/* 页面切换 */}
      {!standaloneTab && (
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 mb-3.5 min-h-[39px]">
        <div className="flex items-center gap-6">
          {hasPerm("class-records-visitors") && (
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              detailTab === "visitors" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => setDetailTab("visitors")}
          >
            邀约到场
            {detailTab === "visitors" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          )}
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              detailTab === "grouping" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => setDetailTab("grouping")}
          >
            人员分组
            {detailTab === "grouping" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          {hasPerm("class-records-activities") && (
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              detailTab === "activities" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => setDetailTab("activities")}
          >
            当日活动
            {detailTab === "activities" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          )}
          {hasPerm("class-records-arrival") && (
          <button
            className={`relative px-1 pb-2 text-[14px] transition-colors ${
              detailTab === "arrival_confirmation" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
            }`}
            onClick={() => setDetailTab("arrival_confirmation")}
          >
            到场确认
            {detailTab === "arrival_confirmation" && <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />}
          </button>
          )}
        </div>
      </div>
      )}

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
              const isVisitorsTab = effectiveDetailTab === "visitors" || effectiveDetailTab === "arrival_confirmation" || effectiveDetailTab === "grouping"
              const dayCount = isVisitorsTab
                ? (visitCounts[d] || 0)
                : (selectedSpaceId
                    ? records.filter(r => r.date === d && r.space_id === selectedSpaceId).length
                      + groupCaseSessions.filter(s => s.date === d && s.space_id === selectedSpaceId).length
                      + emotionalReleaseSessions.filter(s => s.date === d && s.space_id === selectedSpaceId).length
                      + energyKnotSessions.filter(s => s.date === d && s.space_id === selectedSpaceId).length
                      + internalCourseSessions.filter(s => s.date === d && s.space_id === selectedSpaceId).length
                      + ohCardReadingSessions.filter(s => s.date === d && s.space_id === selectedSpaceId).length
                    : records.filter(r => r.date === d).length
                      + groupCaseSessions.filter(s => s.date === d).length
                      + emotionalReleaseSessions.filter(s => s.date === d).length
                      + energyKnotSessions.filter(s => s.date === d).length
                      + internalCourseSessions.filter(s => s.date === d).length
                      + ohCardReadingSessions.filter(s => s.date === d).length
                  )
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
                    {dayCount > 0 ? (isVisitorsTab ? `${dayCount}人` : `${dayCount}场`) : " "}
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
      <div className="flex flex-col flex-1 min-h-0">
      {effectiveDetailTab === "visitors" ? (
        /* 到场人员 - 详细视图 */
        <div className="flex-1 overflow-y-auto">
          <VisitsDetailView
            externalDate={detailDate}
            onExternalDateChange={(d) => startTransition(() => setDetailDate(d))}
            hideDateBar
            onCustomerClick={(id) => { setSelectedCustomerId(id); setCustomerDetailOpen(true) }}
            onDataLoaded={handleVisitsDataLoaded}
            spaceId={selectedSpaceId}
            onRequireSpaces={spaces.length === 0 ? () => setNoSpacesDialogOpen(true) : undefined}
          />
        </div>
      ) : effectiveDetailTab === "grouping" ? (
      /* 人员分组页面：左栏人员列表 + 右栏分组管理 */
      <GroupingView
        date={detailDate}
        dayVisits={dayVisits}
        allCustomers={allCustomers}
        visits={fullVisits}
        membershipCards={membershipCards}
        groups={groups}
        setGroups={setGroups}
        onSave={async (newGroups) => {
          await dailyGroupingApi.upsert({ date: detailDate, groups: newGroups })
          setGroups(newGroups)
        }}
        onCustomerClick={(id) => { setSelectedCustomerId(id); setCustomerDetailOpen(true) }}
      />
      ) : effectiveDetailTab === "arrival_confirmation" ? (
      /* 到场确认页面 */
      <div className="flex-1 flex flex-col min-h-0">
        <ArrivalConfirmationView
          visits={fullVisits}
          loading={loading}
          onMarkArrived={(visit) => {
            setArrivalVisit(visit)
            setArrivalTime(visit.visit_time || "09:00")
            setArrivalDialogOpen(true)
          }}
          onCancelArrived={async (visit) => {
            try {
              await visitApi.update(visit.id, { arrived: false, arrival_time: "" } as any)
              const visits = await visitApi.list(detailDate, undefined, selectedSpaceId)
              setFullVisits(visits)
              setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
            } catch (e) { handleApiError(e) }
          }}
        />
      </div>
      ) : (
      /* 当日活动页面：左栏到场人员 + 右栏活动卡片 */
      <div className="flex-1 flex min-h-0">
        {/* 左栏：到场人员 — 独立页面模式隐藏 */}
        {!standaloneTab && (
        <div className="w-[160px] shrink-0 border-r border-[#f5f5f5] overflow-y-auto py-2 px-0">
          <div className="text-[11px] text-[#8f959e] tracking-widest mb-2 px-2">到场人员</div>
          {visitorGroupSections.length > 0 ? (
            <div className="space-y-3">
              {visitorGroupSections.map((section, si) => (
                <div key={si}>
                  <div className="text-[10px] text-[#8f959e] px-2 mb-1">{section.groupName}</div>
                  <div className="space-y-1">
                    {section.members.map((m) => (
                      <div
                        key={m.id}
                        draggable={m.present}
                        onDragStart={m.present ? (e) => {
                          e.dataTransfer.setData("text/plain", JSON.stringify({ customer_id: m.id, nickname: m.nickname }))
                          e.dataTransfer.effectAllowed = "copy"
                          setDraggingVisitorId(m.id)
                        } : undefined}
                        onDragEnd={m.present ? () => setDraggingVisitorId(null) : undefined}
                        className={`flex items-center justify-between px-2 py-1.5 rounded text-[12px] ${
                          m.present ? `cursor-grab transition-colors ${draggingVisitorId === m.id ? "opacity-50" : ""}` : "cursor-default"
                        }`}
                      >
                        <span className={m.present ? "text-[#2b2f36] truncate" : "text-[#b0b5bb] truncate"}>{m.nickname}</span>
                        {m.role && (
                          <span className={`text-[10px] shrink-0 ml-1 ${m.present ? "text-[#8f959e]" : "text-[#c9cdd4]"}`}>{m.role}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-[#b0b5bb] py-4 text-center px-2">暂无到场人员</div>
          )}
        </div>
        )}
        {/* 右栏：课程卡片列表 */}
        <div className="flex-1 overflow-y-auto">
            {filteredRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{detailDate === today ? "今天暂无记录" : `${detailDate} 暂无记录`}</p>
              </div>
            ) : (
              <ActivityCardList
                records={filteredRecords}
                isActivitiesView={isActivitiesView}
                standaloneTab={standaloneTab}
                dayVisits={dayVisits}
                dragOverActivityId={dragOverActivityId}
                setDragOverActivityId={setDragOverActivityId}
                onOpenMemberDialog={onOpenMemberDialog}
                onClickParticipant={(id) => { setSelectedCustomerId(id); setCustomerDetailOpen(true) }}
                classActions={classRecordDialogs.actions}
                gcsActions={gcsDialogs.actions}
                ersActions={ersDialogs.actions}
                eksActions={eksDialogs.actions}
                icsActions={icsDialogs.actions}
                ocrActions={ocrDialogs.actions}
                getTeacherNames={getTeacherNames}
                getMemberName={getMemberName}
                dailyGroups={groups}
                spaces={spaces}
                courseMap={Object.fromEntries(courses.map(c => [c.id, c.name]))}
              />
            )}

          </div>
        </div>
      )}
      </div>

      {/* Hook 弹窗 */}
      {classRecordDialogs.dialogs}
      {gcsDialogs.dialogs}
      {ersDialogs.dialogs}
      {eksDialogs.dialogs}
      {icsDialogs.dialogs}
      {ocrDialogs.dialogs}

      {/* 成员选择弹窗 */}
      {memberDialogOpen && memberDialogRecord && (() => {
        const record = memberDialogRecord
        const isHostType = memberDialogType === "gcs" || memberDialogType === "ers" || memberDialogType === "ocr"
        const activityName = memberDialogType === "class" ? record.course_name : memberDialogType === "gcs" ? "觉醒游戏" : memberDialogType === "ers" ? "情绪释放" : memberDialogType === "ocr" ? "OH卡梳理" : memberDialogType === "ics" ? record.course_name : ""

        // 当日到场客户（用于筛选范围）
        const dayVisitCustomers = allCustomers.filter(c => dayVisits.some(v => v.id === c.id))

        const selectedParticipants = localSelectedIds.map((id: string) => {
          const c = allCustomers.find(c => c.id === id)
          const groups = record.groups || []
          let role = ""
          for (const g of groups) {
            if (g.leader_id === id) { role = "组长"; break }
            if (g.deputy_id === id) { role = "副组长"; break }
          }
          if (!role) {
            if (record.owner_id === id) role = "案主"
            else if (isHostType ? localHostId === id : record.host_id === id) role = "主持人"
            else if (record.achiever_id === id) role = "达成者"
          }
          return { id, nickname: c?.nickname || c?.name || id, role }
        })

        // 可选的参与者（排除已选 + 主持人）
        const availableParticipants = dayVisitCustomers.filter(c => !localSelectedIds.includes(c.id) && c.id !== localHostId)
        // 可选的主持人（排除参与者）
        const availableHosts = dayVisitCustomers.filter(c => !localSelectedIds.includes(c.id))

        const handleAddToActivity = (visitorId: string) => {
          setLocalSelectedIds(prev => [...prev, visitorId])
        }

        const handleRemoveFromActivity = (visitorId: string) => {
          setLocalSelectedIds(prev => prev.filter(id => id !== visitorId))
        }

        const handleHostChange = (hostId: string) => {
          setLocalHostId(hostId)
          if (hostId) setLocalSelectedIds(prev => prev.filter(id => id !== hostId))
        }

        const handleSave = async () => {
          try {
            if (memberDialogType === "class") {
              // 根据 class 记录自身的小组清理，移除不在 localSelectedIds 中的人员
              const cleaned = (record.groups || []).map((g: any) => ({
                name: g.name,
                leader_id: g.leader_id && localSelectedIds.includes(g.leader_id) ? g.leader_id : "",
                deputy_id: g.deputy_id && localSelectedIds.includes(g.deputy_id) ? g.deputy_id : "",
                member_ids: (g.member_ids || []).filter((id: string) => localSelectedIds.includes(id)),
              })).filter((g: any) => g.leader_id || g.deputy_id || g.member_ids.length > 0)
              console.log("[handleSave class]", JSON.stringify({ recordId: record.id, beforeGroups: record.groups, cleaned, localSelectedIds }))
              await classRecordApi.updateGroups(record.id, cleaned)
              await classRecordApi.updateParticipants(record.id, localSelectedIds)
              console.log("[handleSave class] API calls done")
              loadClassRecords()
            } else if (memberDialogType === "gcs") {
              await groupCaseSessionApi.update(record.id, { participant_ids: localSelectedIds, host_id: localHostId || "" } as any)
              loadGcs()
            } else if (memberDialogType === "ers") {
              await emotionalReleaseSessionApi.update(record.id, { participant_ids: localSelectedIds, host_id: localHostId || "" } as any)
              loadErs()
            } else if (memberDialogType === "eks") {
              await energyKnotSessionApi.update(record.id, { host_ids: localSelectedIds } as any)
              loadEks()
            } else if (memberDialogType === "ics") {
              await internalCourseSessionApi.update(record.id, { participant_ids: localSelectedIds } as any)
              loadIcs()
            } else if (memberDialogType === "ocr") {
              await ohCardReadingSessionApi.update(record.id, { participant_ids: localSelectedIds, host_id: localHostId || "" } as any)
              loadOcr()
            }
            handleClose()
          } catch (e: any) {
            const msg = e?.response?.data?.detail || e?.message || "保存失败"
            alert(msg)
          }
        }

        const handleClose = () => {
          setMemberDialogOpen(false)
          setMemberDialogRecord(null)
          setMemberDialogType("")
          setLocalHostId("")
        }

        return (
          <Dialog open={memberDialogOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
            <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
              <DialogHeader className="px-6 pt-5 pb-4 border-b">
                <DialogTitle className="text-base">选择参与者 — {activityName}</DialogTitle>
              </DialogHeader>
              <div className="px-6 py-4 space-y-4">
                {/* 主持人选择（仅 GCS / ERS） */}
                {isHostType && (
                  <div className="grid grid-cols-[56px_1fr] items-center gap-2">
                    <span className="text-[12px] text-[#8f959e] text-right">主持人</span>
                    <SelectDropdown
                      value={localHostId}
                      options={[{value: "", label: "无"}, ...availableHosts.map(c => ({value: c.id, label: c.nickname || c.name || ""}))]}
                      placeholder="选择主持人"
                      onChange={(v) => { if (v !== localHostId) handleHostChange(v) }}
                    />
                  </div>
                )}

                {/* 参与者选择 */}
                <div className="grid grid-cols-[56px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#8f959e] text-right">参与者</span>
                  <SelectDropdown
                    value=""
                    options={availableParticipants.map(c => ({value: c.id, label: c.nickname || c.name || ""}))}
                    placeholder={availableParticipants.length === 0 ? "无可用人员" : "选择参与者"}
                    disabled={availableParticipants.length === 0}
                    onChange={(v) => { if (v) handleAddToActivity(v) }}
                  />
                </div>

                {/* 已选参与者 */}
                {localSelectedIds.length > 0 && (
                  <div className="grid grid-cols-[56px_1fr] gap-2">
                    <span /> {/* 占位，与输入框左对齐 */}
                    <div className="flex flex-wrap gap-1">
                      {selectedParticipants.map(p => (
                        <span key={p.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#f0f5ff] text-[11px] text-[#3370ff]">
                          {p.nickname}
                          {p.role && <span className="text-[10px] text-[#8f959e]">{p.role}</span>}
                          <button className="hover:text-[#e02020]" onClick={() => handleRemoveFromActivity(p.id)}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 底部按钮 */}
              <div className="px-6 py-3 border-t border-[#e8e8e8] flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={handleClose}>取消</Button>
                <Button size="sm" onClick={handleSave}>保存</Button>
              </div>
            </DialogContent>
          </Dialog>
        )
      })()}

      {/* 会员活动余额不足警告 */}
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{warningMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setWarningOpen(false)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* 到场确认弹窗 */}
      <Dialog open={arrivalDialogOpen} onOpenChange={setArrivalDialogOpen}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle>确认到场</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2" {...enterToNext}>
            <div className="space-y-1.5">
              <label className="text-[12px] text-[#8f959e]">昵称</label>
              <Input value={arrivalVisit?.nickname || ""} disabled className="h-8 text-[13px]" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[12px] text-[#8f959e]">实际到场时间</label>
              <Input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                className="h-8 text-[13px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" className="h-8 text-[12px]" onClick={() => setArrivalDialogOpen(false)}>
                取消
              </Button>
              <Button
                size="sm"
                className="h-8 text-[12px]"
                disabled={arrivalSaving}
                onClick={async () => {
                  if (!arrivalVisit) return
                  setArrivalSaving(true)
                  try {
                    await visitApi.update(arrivalVisit.id, { arrived: true, arrival_time: arrivalTime })
                    // 刷新数据
                    const visits = await visitApi.list(detailDate, undefined, selectedSpaceId)
                    setFullVisits(visits)
                    setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
                    setArrivalDialogOpen(false)
                  } catch (e) {
                    handleApiError(e)
                  } finally {
                    setArrivalSaving(false)
                  }
                }}
              >
                {arrivalSaving ? "保存中..." : "确认到场"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
