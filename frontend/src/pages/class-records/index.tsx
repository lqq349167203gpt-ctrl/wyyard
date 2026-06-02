import { useEffect, useState, useRef, useMemo, useCallback, startTransition } from "react"
import { Plus, Trash2, X, Users, BookOpen, ChevronRight, ChevronLeft, Download, File, ChevronDown } from "lucide-react"
import VisitsDetailView from "@/components/visits/detail-view"
import GroupingView from "@/components/grouping-view"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { classRecordApi, groupCaseSessionApi, groupCaseApi, emotionalReleaseSessionApi, emotionalReleaseApi, energyKnotSessionApi, energyKnotApi, internalCourseSessionApi, courseApi, customerApi, uploadApi, visitApi, dailyGroupingApi, spaceApi, type ClassRecord, type GroupCaseSession, type EmotionalReleaseSession, type EnergyKnotSession, type InternalCourseSession, type Course, type Customer, type CustomerSearchResult, type GroupCaseCustomerSearchResult, type EmotionalReleaseCustomerSearchResult, type EnergyKnotCustomerSearchResult, type InternalCourseSessionCustomerSearchResult, type VisitRecord, type Space } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"
import ArrivalConfirmationView from "./arrival-confirmation"
import ActivityCardList from "./activity-card-list"
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
function formatDateChinese(d: string): string {
  const date = new Date(d)
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const weekday = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()]
  return `${year}年${month}月${day}日 星期${weekday}`
}

export default function ClassRecordsPage({ standaloneTab }: { standaloneTab?: "activities" }) {
  const [records, setRecords] = useState<ClassRecord[]>([])
  const [groupCaseSessions, setGroupCaseSessions] = useState<GroupCaseSession[]>([])
  const [emotionalReleaseSessions, setEmotionalReleaseSessions] = useState<EmotionalReleaseSession[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [teachers, setTeachers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [selectedSpaceId, setSelectedSpaceId] = useState(() => {
    try { return localStorage.getItem("class-records-space") || "" } catch { return "" }
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

  // 新增/编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<ClassRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(today)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formCourseId, setFormCourseId] = useState("")
  const [formTeacherId, setFormTeacherId] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formIsPublicWelfare, setFormIsPublicWelfare] = useState(false)
  const [showCourseDropdown, setShowCourseDropdown] = useState(false)
  const [showTeacherDropdown, setShowTeacherDropdown] = useState(false)

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<ClassRecord | null>(null)
  const [uploading, setUploading] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 小组人员面板
  const [groupsRecord, setGroupsRecord] = useState<ClassRecord | null>(null)
  const [groupsPanelOpen, setGroupsPanelOpen] = useState(false)
  const [groupSearchKeyword, setGroupSearchKeyword] = useState("")
  const [groupSearchResults, setGroupSearchResults] = useState<CustomerSearchResult[]>([])
  const [groupSearchTarget, setGroupSearchTarget] = useState<{ groupIndex: number; role: "leader" | "deputy" | "member" } | null>(null)
  const groupSearchTimeoutRef = useRef<number | null>(null)
  const groupBlurTimeoutRef = useRef<number | null>(null)
  const [dayVisits, setDayVisits] = useState<{ id: string; nickname: string; member_type: string }[]>([])
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({})
  const { permissions: cp, ready: cpReady } = useCustomerPermissions("class_records")
  const [fullVisits, setFullVisits] = useState<VisitRecord[]>([])
  const [arrivalDialogOpen, setArrivalDialogOpen] = useState(false)
  const [arrivalVisit, setArrivalVisit] = useState<VisitRecord | null>(null)
  const [arrivalTime, setArrivalTime] = useState("09:00")
  const [arrivalSaving, setArrivalSaving] = useState(false)
  const [draggingVisitorId, setDraggingVisitorId] = useState<string | null>(null)
  const [dropTargetGroup, setDropTargetGroup] = useState<number | null>(null)

  // 人员分组
  const [groups, setGroups] = useState<{ name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]>([])
  // 新增/编辑弹窗（觉醒游戏）
  const [gcsDialogOpen, setGcsDialogOpen] = useState(false)
  const [gcsEditingRecord, setGcsEditingRecord] = useState<GroupCaseSession | null>(null)
  const [gcsSaving, setGcsSaving] = useState(false)
  const [gcsFormDate, setGcsFormDate] = useState(today)
  const [gcsFormStartTime, setGcsFormStartTime] = useState("09:00")
  const [gcsFormEndTime, setGcsFormEndTime] = useState("10:00")
  const [gcsFormOwnerId, setGcsFormOwnerId] = useState("")
  const [gcsFormOwnerName, setGcsFormOwnerName] = useState("")
  const [gcsFormAchieverId, setGcsFormAchieverId] = useState("")
  const [gcsFormAchieverName, setGcsFormAchieverName] = useState("")
  const [gcsFormHostId, setGcsFormHostId] = useState("")
  const [gcsFormHostName, setGcsFormHostName] = useState("")
  const [gcsFormDescription, setGcsFormDescription] = useState("")
  const [gcsSearchField, setGcsSearchField] = useState<"owner" | "achiever" | "host" | null>(null)
  const [gcsSearchKeyword, setGcsSearchKeyword] = useState("")
  const [gcsSearchResults, setGcsSearchResults] = useState<GroupCaseCustomerSearchResult[]>([])
  const [gcsSearching, setGcsSearching] = useState(false)
  const [gcsShowDropdown, setGcsShowDropdown] = useState(false)
  const gcsSearchTimeoutRef = useRef<number | null>(null)
  const gcsDropdownRef = useRef<HTMLDivElement>(null)
  const gcsBlurTimeoutRef = useRef<number | null>(null)

  // 资料弹窗
  const [gcsMaterialsDialogOpen, setGcsMaterialsDialogOpen] = useState(false)
  const [gcsMaterialsRecord, setGcsMaterialsRecord] = useState<GroupCaseSession | null>(null)

  // 删除确认
  const [gcsDeleteId, setGcsDeleteId] = useState<string | null>(null)

  // 觉醒游戏成员配置弹窗
  const [gcsMembersDialogOpen, setGcsMembersDialogOpen] = useState(false)
  const [gcsMembersRecord, setGcsMembersRecord] = useState<GroupCaseSession | null>(null)
  const [gcsMemberSearchKeyword, setGcsMemberSearchKeyword] = useState("")
  const [gcsMemberSearchResults, setGcsMemberSearchResults] = useState<GroupCaseCustomerSearchResult[]>([])
  const [gcsMemberSearching, setGcsMemberSearching] = useState(false)
  const [gcsMemberShowDropdown, setGcsMemberShowDropdown] = useState(false)
  const gcsMemberSearchTimeoutRef = useRef<number | null>(null)
  const gcsMemberDropdownRef = useRef<HTMLDivElement>(null)

  // 觉醒游戏成员弹窗中的主持人搜索
  const [gcsMemberHostSearchKeyword, setGcsMemberHostSearchKeyword] = useState("")
  const [gcsMemberHostSearchResults, setGcsMemberHostSearchResults] = useState<GroupCaseCustomerSearchResult[]>([])
  const [gcsMemberHostSearching, setGcsMemberHostSearching] = useState(false)
  const [gcsMemberHostShowDropdown, setGcsMemberHostShowDropdown] = useState(false)
  const gcsMemberHostSearchTimeoutRef = useRef<number | null>(null)
  const gcsMemberHostDropdownRef = useRef<HTMLDivElement>(null)

  // 觉醒游戏购买弹窗
  const [gcsPurchaseDialogOpen, setGcsPurchaseDialogOpen] = useState(false)
  const [gcsPendingOwner, setGcsPendingOwner] = useState<GroupCaseCustomerSearchResult | null>(null)
  const [gcsPurchaseCount, setGcsPurchaseCount] = useState("")
  const [gcsPurchaseAmount, setGcsPurchaseAmount] = useState("")
  const [gcsPurchaseSaving, setGcsPurchaseSaving] = useState(false)

  // 新增/编辑弹窗（情绪释放）
  const [ersDialogOpen, setErsDialogOpen] = useState(false)
  const [ersEditingRecord, setErsEditingRecord] = useState<EmotionalReleaseSession | null>(null)
  const [ersSaving, setErsSaving] = useState(false)
  const [ersFormDate, setErsFormDate] = useState(today)
  const [ersFormStartTime, setErsFormStartTime] = useState("09:00")
  const [ersFormEndTime, setErsFormEndTime] = useState("10:00")
  const [ersFormOwnerId, setErsFormOwnerId] = useState("")
  const [ersFormOwnerName, setErsFormOwnerName] = useState("")
  const [ersFormAchieverId, setErsFormAchieverId] = useState("")
  const [ersFormAchieverName, setErsFormAchieverName] = useState("")
  const [ersFormHostId, setErsFormHostId] = useState("")
  const [ersFormHostName, setErsFormHostName] = useState("")
  const [ersFormDescription, setErsFormDescription] = useState("")
  const [ersSearchField, setErsSearchField] = useState<"owner" | "achiever" | "host" | null>(null)
  const [ersSearchKeyword, setErsSearchKeyword] = useState("")
  const [ersSearchResults, setErsSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [ersSearching, setErsSearching] = useState(false)
  const [ersShowDropdown, setErsShowDropdown] = useState(false)
  const ersSearchTimeoutRef = useRef<number | null>(null)
  const ersDropdownRef = useRef<HTMLDivElement>(null)
  const ersBlurTimeoutRef = useRef<number | null>(null)

  // 情绪释放资料弹窗
  const [ersMaterialsDialogOpen, setErsMaterialsDialogOpen] = useState(false)
  const [ersMaterialsRecord, setErsMaterialsRecord] = useState<EmotionalReleaseSession | null>(null)

  // 情绪释放删除确认
  const [ersDeleteId, setErsDeleteId] = useState<string | null>(null)

  // 情绪释放成员配置弹窗
  const [ersMembersDialogOpen, setErsMembersDialogOpen] = useState(false)
  const [ersMembersRecord, setErsMembersRecord] = useState<EmotionalReleaseSession | null>(null)
  const [ersMemberSearchKeyword, setErsMemberSearchKeyword] = useState("")
  const [ersMemberSearchResults, setErsMemberSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [ersMemberSearching, setErsMemberSearching] = useState(false)
  const [ersMemberShowDropdown, setErsMemberShowDropdown] = useState(false)
  const ersMemberSearchTimeoutRef = useRef<number | null>(null)
  const ersMemberDropdownRef = useRef<HTMLDivElement>(null)

  // 情绪释放成员弹窗中的主持人搜索
  const [ersMemberHostSearchKeyword, setErsMemberHostSearchKeyword] = useState("")
  const [ersMemberHostSearchResults, setErsMemberHostSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [ersMemberHostSearching, setErsMemberHostSearching] = useState(false)
  const [ersMemberHostShowDropdown, setErsMemberHostShowDropdown] = useState(false)
  const ersMemberHostSearchTimeoutRef = useRef<number | null>(null)
  const ersMemberHostDropdownRef = useRef<HTMLDivElement>(null)

  // 情绪释放购买弹窗
  const [ersPurchaseDialogOpen, setErsPurchaseDialogOpen] = useState(false)
  const [ersPendingOwner, setErsPendingOwner] = useState<EmotionalReleaseCustomerSearchResult | null>(null)
  const [ersPurchaseCount, setErsPurchaseCount] = useState("")
  const [ersPurchaseAmount, setErsPurchaseAmount] = useState("")
  const [ersPurchaseSaving, setErsPurchaseSaving] = useState(false)

  // ===== 能量结 =====
  const [energyKnotSessions, setEnergyKnotSessions] = useState<EnergyKnotSession[]>([])
  const [eksDialogOpen, setEksDialogOpen] = useState(false)
  const [eksEditingRecord, setEksEditingRecord] = useState<EnergyKnotSession | null>(null)
  const [eksSaving, setEksSaving] = useState(false)
  const [eksFormDate, setEksFormDate] = useState(today)
  const [eksFormStartTime, setEksFormStartTime] = useState("09:00")
  const [eksFormEndTime, setEksFormEndTime] = useState("10:00")
  const [eksFormOwnerIds, setEksFormOwnerIds] = useState<string[]>([])
  const [eksFormOwnerNames, setEksFormOwnerNames] = useState<string[]>([])
  const [eksFormHostIds, setEksFormHostIds] = useState<string[]>([])
  const [eksFormHostNames, setEksFormHostNames] = useState<string[]>([])
  const [eksFormOwnerDescriptions, setEksFormOwnerDescriptions] = useState<{id: string; name: string; description: string}[]>([])
  const [eksSearchField, setEksSearchField] = useState<"owner" | "host" | null>(null)
  const [eksSearchKeyword, setEksSearchKeyword] = useState("")
  const [eksSearchResults, setEksSearchResults] = useState<EnergyKnotCustomerSearchResult[]>([])
  const [eksSearching, setEksSearching] = useState(false)
  const [eksShowDropdown, setEksShowDropdown] = useState(false)
  const eksSearchTimeoutRef = useRef<number | null>(null)
  const eksDropdownRef = useRef<HTMLDivElement>(null)
  const [eksDeleteId, setEksDeleteId] = useState<string | null>(null)
  // 能量结购买弹窗
  const [eksPurchaseDialogOpen, setEksPurchaseDialogOpen] = useState(false)
  const [eksPendingOwner, setEksPendingOwner] = useState<EnergyKnotCustomerSearchResult | null>(null)
  const [eksPurchaseCount, setEksPurchaseCount] = useState("")
  const [eksPurchaseAmount, setEksPurchaseAmount] = useState("")
  const [eksPurchaseSaving, setEksPurchaseSaving] = useState(false)

  // ===== 内部课程 =====
  const [internalCourseSessions, setInternalCourseSessions] = useState<InternalCourseSession[]>([])
  const [icsDialogOpen, setIcsDialogOpen] = useState(false)
  const [icsEditingRecord, setIcsEditingRecord] = useState<InternalCourseSession | null>(null)
  const [icsSaving, setIcsSaving] = useState(false)
  const [icsFormDate, setIcsFormDate] = useState(today)
  const [icsFormStartTime, setIcsFormStartTime] = useState("09:00")
  const [icsFormEndTime, setIcsFormEndTime] = useState("10:00")
  const [icsFormCourseType, setIcsFormCourseType] = useState("")
  const [icsFormCourseName, setIcsFormCourseName] = useState("")
  const [icsFormDescription, setIcsFormDescription] = useState("")
  const [icsFormHostId, setIcsFormHostId] = useState("")
  const [icsFormHostName, setIcsFormHostName] = useState("")
  const [icsSearchField, setIcsSearchField] = useState<"host" | null>(null)
  const [icsSearchKeyword, setIcsSearchKeyword] = useState("")
  const [icsSearchResults, setIcsSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [icsSearching, setIcsSearching] = useState(false)
  const [icsShowDropdown, setIcsShowDropdown] = useState(false)
  const icsSearchTimeoutRef = useRef<number | null>(null)
  const icsDropdownRef = useRef<HTMLDivElement>(null)
  const [icsDeleteId, setIcsDeleteId] = useState<string | null>(null)
  // 内部课程资料弹窗
  const [icsMaterialsDialogOpen, setIcsMaterialsDialogOpen] = useState(false)
  const [icsMaterialsRecord, setIcsMaterialsRecord] = useState<InternalCourseSession | null>(null)
  const [icsUploading, setIcsUploading] = useState(false)
  // 内部课程成员弹窗
  const [icsMembersDialogOpen, setIcsMembersDialogOpen] = useState(false)
  const [icsMembersRecord, setIcsMembersRecord] = useState<InternalCourseSession | null>(null)
  const [icsMemberSearchKeyword, setIcsMemberSearchKeyword] = useState("")
  const [icsMemberSearchResults, setIcsMemberSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [icsMemberSearching, setIcsMemberSearching] = useState(false)
  const [icsMemberShowDropdown, setIcsMemberShowDropdown] = useState(false)
  const icsMemberSearchTimeoutRef = useRef<number | null>(null)
  const icsMemberDropdownRef = useRef<HTMLDivElement>(null)

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
    courseApi.list().then(setCourses).catch((e) => { console.error("courseApi.list failed:", e) })
    customerApi.list()
      .then((customers) => {
        setAllCustomers(customers)
        setTeachers(customers.filter(c => c.positions?.includes("课程老师")))
      })
      .catch((e) => { console.error("customerApi.list failed:", e) })
    spaceApi.list().then(setSpaces).catch(() => {})
  }

  const loadClassRecords = () => classRecordApi.list().then(setRecords).catch((e) => { console.error("loadClassRecords failed:", e) })
  const loadGcs = () => groupCaseSessionApi.list().then(setGroupCaseSessions).catch((e) => { console.error("loadGcs failed:", e) })
  const loadErs = () => emotionalReleaseSessionApi.list().then(setEmotionalReleaseSessions).catch((e) => { console.error("loadErs failed:", e) })
  const loadEks = () => energyKnotSessionApi.list().then(setEnergyKnotSessions).catch((e) => { console.error("loadEks failed:", e) })
  const loadIcs = () => internalCourseSessionApi.list().then(setInternalCourseSessions).catch((e) => { console.error("loadIcs failed:", e) })

  useEffect(() => { load() }, [])

  // 加载当天到场人员（切换日期或切换到到场确认 tab 时刷新）
  useEffect(() => {
    visitApi.list(detailDate).then((visits) => {
      setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
      setFullVisits(visits)
    }).catch(() => { setDayVisits([]); setFullVisits([]) })
  }, [detailDate, detailTab])

  // 加载人员分组
  useEffect(() => {
    dailyGroupingApi.get(detailDate).then((data) => {
      setGroups(data.groups || [])
    }).catch(() => setGroups([]))
  }, [detailDate])

  // 加载日期范围内的到场人数（与 VisitsDetailView 使用相同的 counts API + memberTypes 过滤）
  useEffect(() => {
    if (!cpReady) return
    const memberTypes = cp.join(",")
    const endDate = formatDate(addDays(new Date(dateRangeStart), 20))
    visitApi.counts({ memberTypes: memberTypes || undefined, startDate: dateRangeStart, endDate })
      .then(setVisitCounts)
      .catch(() => {})
  }, [dateRangeStart, cpReady, cp])

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
      return [...(record.participant_ids || []), record.host_id, record.achiever_id].filter(Boolean)
    }
    if (type === "eks") {
      return [...(record.host_ids || [])].filter(Boolean)
    }
    if (type === "ics") {
      return [...(record.participant_ids || [])].filter(Boolean)
    }
    return []
  }, [])

  const onOpenMemberDialog = useCallback((type: string, record: any) => {
    setMemberDialogType(type)
    setMemberDialogRecord(record)
    const ids = getCurrentParticipantIds(type, record)
    const hostId = (type === "gcs" || type === "ers") ? (record.host_id || "") : ""
    // 主持人不在参与者列表中显示
    setLocalSelectedIds(ids.filter(id => id !== hostId))
    initialSelectedIdsRef.current = [...ids]
    setLocalHostId(hostId)
    setMemberDialogOpen(true)
  }, [getCurrentParticipantIds])

  const handleSpaceSelect = useCallback((id: string) => {
    startTransition(() => {
      setSelectedSpaceId(id)
    })
    localStorage.setItem("class-records-space", id)
  }, [])

  const handleDropToClass = async (record: ClassRecord, customer: { customer_id: string; nickname: string }) => {
    const classGroups = (record.groups || []).map(g => ({ ...g, member_ids: [...(g.member_ids || [])] }))
    // 检查是否已分配到任何分组
    const allAssigned = classGroups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(customer.customer_id)) return

    // 保存分组并保留未分组参与者
    const saveGroupsAndParticipants = async (finalGroups: any[]) => {
      await classRecordApi.updateGroups(record.id, finalGroups)
      // updateGroups 会覆盖 participant_ids，需要恢复未分组参与者
      const groupIds = new Set(finalGroups.flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean)))
      const ungroupedIds = (record.participant_ids || []).filter((id: string) => !groupIds.has(id))
      await classRecordApi.updateParticipants(record.id, [...groupIds, ...ungroupedIds])
      loadClassRecords()
    }

    // 查找该成员在当日分组中的角色
    let dailyGroupName = ""
    let dailyRole: "leader" | "deputy" | "member" | "" = ""
    for (const dg of groups) {
      if (dg.leader_id === customer.customer_id) { dailyGroupName = dg.name; dailyRole = "leader"; break }
      if (dg.deputy_id === customer.customer_id) { dailyGroupName = dg.name; dailyRole = "deputy"; break }
      if ((dg.member_ids || []).includes(customer.customer_id)) { dailyGroupName = dg.name; dailyRole = "member"; break }
    }

    if (dailyRole) {
      // 在活动分组中查找或创建同名分组，继承当日分组角色
      let targetIdx = classGroups.findIndex(g => g.name === dailyGroupName)
      if (targetIdx === -1) {
        classGroups.push({ name: dailyGroupName, leader_id: "", deputy_id: "", member_ids: [] })
        targetIdx = classGroups.length - 1
      }
      const targetGroup = { ...classGroups[targetIdx], member_ids: [...classGroups[targetIdx].member_ids] }
      if (dailyRole === "leader") {
        targetGroup.leader_id = customer.customer_id
      } else if (dailyRole === "deputy") {
        targetGroup.deputy_id = customer.customer_id
      } else {
        targetGroup.member_ids = [...targetGroup.member_ids, customer.customer_id]
      }
      classGroups[targetIdx] = targetGroup
      try {
        await saveGroupsAndParticipants(classGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    } else if (classGroups.length === 0) {
      // 无当日分组且活动无分组：新建分组并设为组长
      const newGroups = [{ name: "小组 1", leader_id: customer.customer_id, deputy_id: "", member_ids: [] }]
      try {
        await saveGroupsAndParticipants(newGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    } else {
      // 无当日分组但活动已有分组：添加到第一个分组
      classGroups[0] = { ...classGroups[0], member_ids: [...classGroups[0].member_ids, customer.customer_id] }
      if (!classGroups[0].leader_id) classGroups[0].leader_id = customer.customer_id
      try {
        await saveGroupsAndParticipants(classGroups)
      } catch (e: any) {
        const msg = e?.response?.data?.detail || e?.message || "添加失败"
        alert(msg)
      }
    }
  }

  const handleDropToGcs = async (s: GroupCaseSession, customer: { customer_id: string }) => {
    const ids = s.participant_ids || []
    if (ids.includes(customer.customer_id) || customer.customer_id === s.host_id || customer.customer_id === s.achiever_id) return
    await groupCaseSessionApi.update(s.id, { participant_ids: [...ids, customer.customer_id] } as any)
    loadGcs()
  }

  const handleDropToErs = async (s: EmotionalReleaseSession, customer: { customer_id: string }) => {
    const ids = s.participant_ids || []
    if (ids.includes(customer.customer_id) || customer.customer_id === s.host_id || customer.customer_id === s.achiever_id) return
    await emotionalReleaseSessionApi.update(s.id, { participant_ids: [...ids, customer.customer_id] } as any)
    loadErs()
  }

  const handleDropToEks = async (s: EnergyKnotSession, customer: { customer_id: string }) => {
    const ids = s.host_ids || []
    if (ids.includes(customer.customer_id)) return
    await energyKnotSessionApi.update(s.id, { host_ids: [...ids, customer.customer_id] } as any)
    loadEks()
  }

  const handleDropToIcs = async (s: InternalCourseSession, customer: { customer_id: string }) => {
    const ids = s.participant_ids || []
    if (ids.includes(customer.customer_id)) return
    await internalCourseSessionApi.update(s.id, { participant_ids: [...ids, customer.customer_id] } as any)
    loadIcs()
  }


  type UnifiedRecord = { type: "class"; data: ClassRecord; date: string } | { type: "gcs"; data: GroupCaseSession; date: string } | { type: "ers"; data: EmotionalReleaseSession; date: string } | { type: "eks"; data: EnergyKnotSession; date: string } | { type: "ics"; data: InternalCourseSession; date: string }

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

  // 详细视图：合并五种记录，按开始时间排序
  const unifiedDetailRecords = useMemo(() => [
    ...detailRecords.map(r => ({ type: "class" as const, data: r, date: r.date })),
    ...detailGcs.map(s => ({ type: "gcs" as const, data: s, date: s.date })),
    ...detailErs.map(s => ({ type: "ers" as const, data: s, date: s.date })),
    ...detailEks.map(s => ({ type: "eks" as const, data: s, date: s.date })),
    ...detailIcs.map(s => ({ type: "ics" as const, data: s, date: s.date })),
  ]
  .filter(r => !selectedSpaceId || (r.data as any).space_id === selectedSpaceId)
  .sort((a, b) => {
    const at = a.data.start_time || ""
    const bt = b.data.start_time || ""
    if (!at && !bt) return 0
    if (!at) return 1
    if (!bt) return -1
    return at.localeCompare(bt)
  }), [detailRecords, detailGcs, detailErs, detailEks, detailIcs, selectedSpaceId])

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

  const selectedCourse = courses.find(c => c.id === formCourseId)

  const getTeacherNames = useCallback((teacherIds: string[]) => {
    return teacherIds
      .map(id => teachers.find(t => t.id === id))
      .filter(Boolean)
      .map(t => t!.nickname || t!.name || "未命名")
  }, [teachers])

  const handleOpenEdit = (record: ClassRecord) => {
    setEditingRecord(record)
    setFormDate(record.date)
    setFormStartTime(record.start_time || "")
    setFormEndTime(record.end_time || "")
    setFormCourseId(record.course_id)
    setFormTeacherId(record.teacher_ids[0] || "")
    setFormDescription(record.course_description || "")
    setFormIsPublicWelfare(record.is_public_welfare || false)
    setShowCourseDropdown(false)
    setShowTeacherDropdown(false)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCourseId) return
    setSaving(true)
    try {
      const teacherIds = formTeacherId ? [formTeacherId] : []
      if (editingRecord) {
        const course = courses.find(c => c.id === formCourseId)
        await classRecordApi.update(editingRecord.id, {
          date: formDate,
          start_time: formStartTime || null,
          end_time: formEndTime || null,
          course_id: formCourseId,
          course_name: course?.name || editingRecord.course_name,
          course_description: formDescription,
          teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
        })
      } else {
        const course = courses.find(c => c.id === formCourseId)
        if (!course) return
        await classRecordApi.create({
          date: formDate,
          start_time: formStartTime || null,
          end_time: formEndTime || null,
          course_id: formCourseId,
          course_name: course.name,
          course_description: formDescription,
          teacher_ids: teacherIds,
          is_public_welfare: formIsPublicWelfare,
        })
      }
      setDialogOpen(false)
      load()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await classRecordApi.delete(deleteId)
    setDeleteId(null)
    load()
  }

  // 资料上传
  const handleOpenMaterials = (record: ClassRecord) => {
    setMaterialsRecord(record)
    setMaterialsDialogOpen(true)
  }

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !materialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(materialsRecord.materials || []), material]
      await classRecordApi.update(materialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...materialsRecord, materials: newMaterials }
      setMaterialsRecord(updated)
      load()
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteMaterial = async (filename: string) => {
    if (!materialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (materialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await classRecordApi.update(materialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...materialsRecord, materials: newMaterials }
      setMaterialsRecord(updated)
      load()
    } catch { }
  }

  // 小组管理
  const handleOpenGroups = (record: ClassRecord) => {
    setGroupsRecord(record)
    setGroupsPanelOpen(true)
    setGroupSearchKeyword("")
    setGroupSearchResults([])
    setGroupSearchTarget(null)
    // 加载当日到场人员
    visitApi.list(record.date).then((visits) => {
      setDayVisits(visits.map(v => ({ id: v.customer_id, nickname: v.nickname, member_type: v.member_type || "" })))
      setFullVisits(visits)
    }).catch(() => { setDayVisits([]); setFullVisits([]) })
  }

  const handleAddGroup = async () => {
    if (!groupsRecord) return
    const groups = [...(groupsRecord.groups || []), { name: `小组 ${(groupsRecord.groups || []).length + 1}`, leader_id: "", deputy_id: "", member_ids: [] }]
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groups)
      setGroupsRecord(updated)

      load()
    } catch (e) { handleApiError(e) }
  }

  const handleRemoveGroup = async (index: number) => {
    if (!groupsRecord) return
    const groups = groupsRecord.groups
      .filter((_, i) => i !== index)
      .map((g, i) => ({ ...g, name: `小组 ${i + 1}` }))
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groups)
      setGroupsRecord(updated)

      load()
    } catch (e) { handleApiError(e) }
  }

  const handleGroupNameChange = (index: number, name: string) => {
    if (!groupsRecord) return
    const groups = groupsRecord.groups.map((g, i) => i === index ? { ...g, name } : g)
    setGroupsRecord({ ...groupsRecord, groups })
  }

  const handleSaveGroupName = async (_index: number) => {
    if (!groupsRecord) return
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groupsRecord.groups)
      setGroupsRecord(updated)

      load()
    } catch (e) { handleApiError(e) }
  }

  const handleGroupSearch = (keyword: string, groupIndex: number, role: "leader" | "deputy" | "member") => {
    setGroupSearchKeyword(keyword)
    setGroupSearchTarget({ groupIndex, role })
    if (groupSearchTimeoutRef.current) clearTimeout(groupSearchTimeoutRef.current)
    if (!keyword.trim()) { setGroupSearchResults([]); return }
    groupSearchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const results = await classRecordApi.searchCustomers(keyword)
        const allAssigned = new Set(
          (groupsRecord?.groups || []).flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
        )
        setGroupSearchResults(results.filter(r => !allAssigned.has(r.id)))
      } catch { setGroupSearchResults([]) }
    }, 300)
  }

  const handleAssignGroupMember = async (customer: CustomerSearchResult) => {
    if (!groupsRecord || !groupSearchTarget) return
    const allAssigned = groupsRecord.groups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(customer.id)) return
    const { groupIndex, role } = groupSearchTarget
    const groups = [...groupsRecord.groups]
    const group = { ...groups[groupIndex] }

    if (role === "leader") {
      group.leader_id = customer.id
    } else if (role === "deputy") {
      group.deputy_id = customer.id
    } else {
      group.member_ids = [...group.member_ids, customer.id]
    }
    groups[groupIndex] = group

    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groups)
      setGroupsRecord(updated)

      setGroupSearchKeyword("")
      setGroupSearchResults([])
      setGroupSearchTarget(null)
      load()
    } catch (e) { handleApiError(e) }
  }

  const handleRemoveGroupMember = async (groupIndex: number, role: "leader" | "deputy" | "member", memberId?: string) => {
    if (!groupsRecord) return
    const groups = [...groupsRecord.groups]
    const group = { ...groups[groupIndex] }

    if (role === "leader") group.leader_id = ""
    else if (role === "deputy") group.deputy_id = ""
    else group.member_ids = group.member_ids.filter(id => id !== memberId)

    groups[groupIndex] = group
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groups)
      setGroupsRecord(updated)

      load()
    } catch (e) { handleApiError(e) }
  }

  // 拖拽分配到场人员到小组
  const handleDropVisitor = async (groupIndex: number, visitor: { id: string; nickname: string }) => {
    if (!groupsRecord) return
    const allAssigned = groupsRecord.groups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean))
    if (allAssigned.includes(visitor.id)) return
    const groups = [...groupsRecord.groups]
    const group = { ...groups[groupIndex] }
    group.member_ids = [...group.member_ids, visitor.id]
    groups[groupIndex] = group
    try {
      const updated = await classRecordApi.updateGroups(groupsRecord.id, groups)
      setGroupsRecord(updated)
      load()
    } catch (e) { handleApiError(e) }
    setDraggingVisitorId(null)
    setDropTargetGroup(null)
  }

  // 判断到场人员是否已被分配
  const isVisitorAssigned = (visitorId: string) => {
    if (!groupsRecord) return false
    return groupsRecord.groups.flatMap(g => [g.leader_id, g.deputy_id, ...g.member_ids].filter(Boolean)).includes(visitorId)
  }

  const handleMemberToggle = useCallback(async (type: string, record: any, visitorId: string) => {
    const currentIds = getCurrentParticipantIds(type, record)
    const isPresent = currentIds.includes(visitorId)
    try {
      if (type === "class") {
        const groups = [...(record.groups || [])]
        let finalGroups: any[]
        if (groups.length === 0) {
          finalGroups = [{ name: "小组 1", leader_id: visitorId, deputy_id: "", member_ids: [] }]
        } else {
          const targetGroup = { ...groups[0] }
          if (isPresent) {
            if (targetGroup.leader_id === visitorId) targetGroup.leader_id = ""
            else if (targetGroup.deputy_id === visitorId) targetGroup.deputy_id = ""
            else targetGroup.member_ids = targetGroup.member_ids.filter((id: string) => id !== visitorId)
          } else {
            if (!targetGroup.leader_id) targetGroup.leader_id = visitorId
            else targetGroup.member_ids = [...targetGroup.member_ids, visitorId]
          }
          groups[0] = targetGroup
          finalGroups = groups
        }
        await classRecordApi.updateGroups(record.id, finalGroups)
        // updateGroups 会覆盖 participant_ids，恢复未分组参与者
        const groupIds = new Set(finalGroups.flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean)))
        const ungroupedIds = (record.participant_ids || []).filter((id: string) => !groupIds.has(id))
        const finalUngrouped = isPresent ? ungroupedIds.filter((id: string) => id !== visitorId) : ungroupedIds
        await classRecordApi.updateParticipants(record.id, [...groupIds, ...finalUngrouped])
        loadClassRecords()
      } else if (type === "gcs") {
        const ids = record.participant_ids || []
        const newIds = isPresent ? ids.filter((id: string) => id !== visitorId) : [...ids, visitorId]
        await groupCaseSessionApi.update(record.id, { participant_ids: newIds } as any)
        loadGcs()
      } else if (type === "ers") {
        const ids = record.participant_ids || []
        const newIds = isPresent ? ids.filter((id: string) => id !== visitorId) : [...ids, visitorId]
        await emotionalReleaseSessionApi.update(record.id, { participant_ids: newIds } as any)
        loadErs()
      } else if (type === "eks") {
        const ids = record.host_ids || []
        const newIds = isPresent ? ids.filter((id: string) => id !== visitorId) : [...ids, visitorId]
        await energyKnotSessionApi.update(record.id, { host_ids: newIds } as any)
        loadEks()
      } else if (type === "ics") {
        const ids = record.participant_ids || []
        const newIds = isPresent ? ids.filter((id: string) => id !== visitorId) : [...ids, visitorId]
        await internalCourseSessionApi.update(record.id, { participant_ids: newIds } as any)
        loadIcs()
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail || e?.message || "操作失败"
      alert(msg)
    }
  }, [getCurrentParticipantIds])

  // ===== 觉醒游戏 handlers =====
  const handleOpenGcsEdit = (session: GroupCaseSession) => {
    setGcsEditingRecord(session)
    setGcsFormDate(session.date)
    setGcsFormStartTime(session.start_time || "09:00")
    setGcsFormEndTime(session.end_time || "10:00")
    setGcsFormOwnerId(session.owner_id)
    setGcsFormOwnerName(session.owner_name || "")
    setGcsFormAchieverId(session.achiever_id || "")
    setGcsFormAchieverName(session.achiever_name || "")
    setGcsFormHostId(session.host_id || "")
    setGcsFormHostName(session.host_name || "")
    setGcsFormDescription(session.description || "")
    setGcsSearchField(null)
    setGcsSearchKeyword("")
    setGcsSearchResults([])
    setGcsShowDropdown(false)
    setGcsDialogOpen(true)
  }

  const handleGcsSearch = (keyword: string) => {
    setGcsSearchKeyword(keyword)
    if (gcsSearchTimeoutRef.current) clearTimeout(gcsSearchTimeoutRef.current)
    if (!keyword.trim()) { setGcsSearchResults([]); setGcsShowDropdown(false); return }
    gcsSearchTimeoutRef.current = window.setTimeout(async () => {
      setGcsSearching(true)
      try {
        const results = await groupCaseSessionApi.searchCustomers(keyword)
        setGcsSearchResults(results)
        setGcsShowDropdown(true)
      } catch { setGcsSearchResults([]) }
      finally { setGcsSearching(false) }
    }, 300)
  }

  const handleGcsSelectCustomer = (customer: GroupCaseCustomerSearchResult) => {
    if (!gcsSearchField) return
    if (gcsSearchField === "owner") {
      if (customer.remaining !== -1 && customer.remaining <= 0) {
        setGcsPendingOwner(customer)
        setGcsPurchaseDialogOpen(true)
        return
      }
      setGcsFormOwnerId(customer.id)
      setGcsFormOwnerName(customer.nickname || customer.name)
    } else if (gcsSearchField === "achiever") {
      setGcsFormAchieverId(customer.id)
      setGcsFormAchieverName(customer.nickname || customer.name)
    } else if (gcsSearchField === "host") {
      setGcsFormHostId(customer.id)
      setGcsFormHostName(customer.nickname || customer.name)
    }
    setGcsSearchKeyword("")
    setGcsSearchResults([])
    setGcsShowDropdown(false)
    setGcsSearchField(null)
  }

  const handleGcsSave = async () => {
    if (!gcsFormOwnerId) return
    setGcsSaving(true)
    try {
      const data = {
        date: gcsFormDate,
        start_time: gcsFormStartTime || null,
        end_time: gcsFormEndTime || null,
        owner_id: gcsFormOwnerId,
        owner_name: gcsFormOwnerName,
        description: gcsFormDescription || undefined,
        achiever_id: gcsFormAchieverId || undefined,
        achiever_name: gcsFormAchieverName || undefined,
        host_id: gcsFormHostId || undefined,
        host_name: gcsFormHostName || undefined,
      }
      if (gcsEditingRecord) {
        await groupCaseSessionApi.update(gcsEditingRecord.id, data)
  
      } else {
        await groupCaseSessionApi.create(data)
      }
      setGcsDialogOpen(false)
      load()
    } catch (error) {
      handleApiError(error)
    } finally {
      setGcsSaving(false)
    }
  }

  const handleGcsDelete = async () => {
    if (!gcsDeleteId) return
    await groupCaseSessionApi.delete(gcsDeleteId)
    setGcsDeleteId(null)
    load()
  }

  const handleGcsAddPurchase = async () => {
    if (!gcsPendingOwner || !gcsPurchaseCount) return
    setGcsPurchaseSaving(true)
    try {
      await groupCaseApi.create({
        customer_id: gcsPendingOwner.id,
        nickname: gcsPendingOwner.nickname,
        purchase_count: parseInt(gcsPurchaseCount) || 0,
        amount: parseFloat(gcsPurchaseAmount) || 0,
      })
      setGcsFormOwnerId(gcsPendingOwner.id)
      setGcsFormOwnerName(gcsPendingOwner.nickname)
      setGcsPurchaseDialogOpen(false)
      setGcsPendingOwner(null)
      load()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setGcsPurchaseSaving(false)
    }
  }

  // 觉醒游戏资料上传
  const handleOpenGcsMaterials = (session: GroupCaseSession) => {
    setGcsMaterialsRecord(session)
    setGcsMaterialsDialogOpen(true)
  }

  const handleUploadGcsMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !gcsMaterialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(gcsMaterialsRecord.materials || []), material]
      await groupCaseSessionApi.update(gcsMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...gcsMaterialsRecord, materials: newMaterials }
      setGcsMaterialsRecord(updated)
      load()
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteGcsMaterial = async (filename: string) => {
    if (!gcsMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (gcsMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await groupCaseSessionApi.update(gcsMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...gcsMaterialsRecord, materials: newMaterials }
      setGcsMaterialsRecord(updated)
      load()
    } catch { }
  }

  // 觉醒游戏成员配置
  const handleOpenGcsMembers = (session: GroupCaseSession) => {
    setGcsMembersRecord(session)
    setGcsMembersDialogOpen(true)
    setGcsMemberSearchKeyword("")
    setGcsMemberSearchResults([])
    setGcsMemberShowDropdown(false)
  }

  const handleGcsMemberSearch = (keyword: string) => {
    setGcsMemberSearchKeyword(keyword)
    if (gcsMemberSearchTimeoutRef.current) clearTimeout(gcsMemberSearchTimeoutRef.current)
    if (!keyword.trim()) { setGcsMemberSearchResults([]); setGcsMemberShowDropdown(false); return }
    gcsMemberSearchTimeoutRef.current = window.setTimeout(async () => {
      setGcsMemberSearching(true)
      try {
        const results = await groupCaseSessionApi.searchCustomers(keyword)
        setGcsMemberSearchResults(results.filter(r => r.id !== gcsMembersRecord?.owner_id && r.id !== gcsMembersRecord?.host_id && !(gcsMembersRecord?.participant_ids || []).includes(r.id)))
        setGcsMemberShowDropdown(true)
      } catch { setGcsMemberSearchResults([]) }
      finally { setGcsMemberSearching(false) }
    }, 300)
  }

  const handleGcsAddParticipant = async (customer: GroupCaseCustomerSearchResult) => {
    if (!gcsMembersRecord) return
    if (customer.remaining === 0) return
    const newIds = [...(gcsMembersRecord.participant_ids || []), customer.id]
    try {
      await groupCaseSessionApi.update(gcsMembersRecord.id, { participant_ids: newIds } as any)
      setGcsMembersRecord({ ...gcsMembersRecord, participant_ids: newIds })

      setGcsMemberSearchKeyword("")
      setGcsMemberSearchResults([])
      setGcsMemberShowDropdown(false)
      load()
    } catch (e) { handleApiError(e) }
  }

  const handleGcsRemoveParticipant = async (id: string) => {
    if (!gcsMembersRecord) return
    const newIds = (gcsMembersRecord.participant_ids || []).filter(pid => pid !== id)
    try {
      await groupCaseSessionApi.update(gcsMembersRecord.id, { participant_ids: newIds } as any)
      setGcsMembersRecord({ ...gcsMembersRecord, participant_ids: newIds })

      load()
    } catch (e) { handleApiError(e) }
  }

  // 觉醒游戏成员弹窗中的主持人搜索
  const handleGcsMemberHostSearch = (keyword: string) => {
    setGcsMemberHostSearchKeyword(keyword)
    if (gcsMemberHostSearchTimeoutRef.current) clearTimeout(gcsMemberHostSearchTimeoutRef.current)
    if (!keyword.trim()) { setGcsMemberHostSearchResults([]); setGcsMemberHostShowDropdown(false); return }
    gcsMemberHostSearchTimeoutRef.current = window.setTimeout(async () => {
      setGcsMemberHostSearching(true)
      try {
        const results = await groupCaseSessionApi.searchCustomers(keyword)
        setGcsMemberHostSearchResults(results.filter(r => r.id !== gcsMembersRecord?.owner_id && !(gcsMembersRecord?.participant_ids || []).includes(r.id)))
        setGcsMemberHostShowDropdown(true)
      } catch { setGcsMemberHostSearchResults([]) }
      finally { setGcsMemberHostSearching(false) }
    }, 300)
  }

  const handleGcsMemberSetHost = async (customer: GroupCaseCustomerSearchResult) => {
    if (!gcsMembersRecord) return
    if (customer.remaining === 0) return
    try {
      await groupCaseSessionApi.update(gcsMembersRecord.id, { host_id: customer.id, host_name: customer.nickname || customer.name } as any)
      setGcsMembersRecord({ ...gcsMembersRecord, host_id: customer.id, host_name: customer.nickname || customer.name })

      setGcsMemberHostSearchKeyword("")
      setGcsMemberHostSearchResults([])
      setGcsMemberHostShowDropdown(false)
      load()
    } catch (e) { handleApiError(e) }
  }

  const handleGcsMemberRemoveHost = async () => {
    if (!gcsMembersRecord) return
    try {
      await groupCaseSessionApi.update(gcsMembersRecord.id, { host_id: "", host_name: "" } as any)
      setGcsMembersRecord({ ...gcsMembersRecord, host_id: "", host_name: "" })

      load()
    } catch (e) { handleApiError(e) }
  }

  // ===== 情绪释放 handlers =====
  const handleOpenErsEdit = (session: EmotionalReleaseSession) => {
    setErsEditingRecord(session)
    setErsFormDate(session.date)
    setErsFormStartTime(session.start_time || "09:00")
    setErsFormEndTime(session.end_time || "10:00")
    setErsFormOwnerId(session.owner_id)
    setErsFormOwnerName(session.owner_name || "")
    setErsFormAchieverId(session.achiever_id || "")
    setErsFormAchieverName(session.achiever_name || "")
    setErsFormHostId(session.host_id || "")
    setErsFormHostName(session.host_name || "")
    setErsFormDescription(session.description || "")
    setErsSearchField(null)
    setErsSearchKeyword("")
    setErsSearchResults([])
    setErsShowDropdown(false)
    setErsDialogOpen(true)
  }

  const handleErsSearch = (keyword: string) => {
    setErsSearchKeyword(keyword)
    if (ersSearchTimeoutRef.current) clearTimeout(ersSearchTimeoutRef.current)
    if (!keyword.trim()) { setErsSearchResults([]); setErsShowDropdown(false); return }
    ersSearchTimeoutRef.current = window.setTimeout(async () => {
      setErsSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setErsSearchResults(results)
        setErsShowDropdown(true)
      } catch { setErsSearchResults([]) }
      finally { setErsSearching(false) }
    }, 300)
  }

  const handleErsSelectCustomer = (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!ersSearchField) return
    if (ersSearchField === "owner") {
      if (customer.remaining !== -1 && customer.remaining <= 0) {
        setErsPendingOwner(customer)
        setErsPurchaseDialogOpen(true)
        return
      }
      setErsFormOwnerId(customer.id)
      setErsFormOwnerName(customer.nickname || customer.name)
    } else if (ersSearchField === "achiever") {
      setErsFormAchieverId(customer.id)
      setErsFormAchieverName(customer.nickname || customer.name)
    } else if (ersSearchField === "host") {
      setErsFormHostId(customer.id)
      setErsFormHostName(customer.nickname || customer.name)
    }
    setErsSearchKeyword("")
    setErsSearchResults([])
    setErsShowDropdown(false)
    setErsSearchField(null)
  }

  const handleErsSave = async () => {
    if (!ersFormOwnerId) return
    setErsSaving(true)
    try {
      const data = {
        date: ersFormDate,
        start_time: ersFormStartTime || null,
        end_time: ersFormEndTime || null,
        owner_id: ersFormOwnerId,
        owner_name: ersFormOwnerName,
        description: ersFormDescription || undefined,
        achiever_id: ersFormAchieverId || undefined,
        achiever_name: ersFormAchieverName || undefined,
        host_id: ersFormHostId || undefined,
        host_name: ersFormHostName || undefined,
      }
      if (ersEditingRecord) {
        await emotionalReleaseSessionApi.update(ersEditingRecord.id, data)
  
      } else {
        await emotionalReleaseSessionApi.create(data)
      }
      setErsDialogOpen(false)
      load()
    } catch (error) {
      handleApiError(error)
    } finally {
      setErsSaving(false)
    }
  }

  const handleErsDelete = async () => {
    if (!ersDeleteId) return
    await emotionalReleaseSessionApi.delete(ersDeleteId)
    setErsDeleteId(null)
    load()
  }

  const handleErsAddPurchase = async () => {
    if (!ersPendingOwner || !ersPurchaseCount) return
    setErsPurchaseSaving(true)
    try {
      await emotionalReleaseApi.create({
        customer_id: ersPendingOwner.id,
        nickname: ersPendingOwner.nickname,
        purchase_count: parseInt(ersPurchaseCount) || 0,
        amount: parseFloat(ersPurchaseAmount) || 0,
      })
      setErsFormOwnerId(ersPendingOwner.id)
      setErsFormOwnerName(ersPendingOwner.nickname)
      setErsPurchaseDialogOpen(false)
      setErsPendingOwner(null)
      load()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setErsPurchaseSaving(false)
    }
  }

  // 情绪释放资料上传
  const handleOpenErsMaterials = (session: EmotionalReleaseSession) => {
    setErsMaterialsRecord(session)
    setErsMaterialsDialogOpen(true)
  }

  const handleUploadErsMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !ersMaterialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(ersMaterialsRecord.materials || []), material]
      await emotionalReleaseSessionApi.update(ersMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...ersMaterialsRecord, materials: newMaterials }
      setErsMaterialsRecord(updated)
      load()
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteErsMaterial = async (filename: string) => {
    if (!ersMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (ersMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await emotionalReleaseSessionApi.update(ersMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...ersMaterialsRecord, materials: newMaterials }
      setErsMaterialsRecord(updated)
      load()
    } catch { }
  }

  // 情绪释放成员配置
  const handleOpenErsMembers = (session: EmotionalReleaseSession) => {
    setErsMembersRecord(session)
    setErsMembersDialogOpen(true)
    setErsMemberSearchKeyword("")
    setErsMemberSearchResults([])
    setErsMemberShowDropdown(false)
  }

  const handleErsMemberSearch = (keyword: string) => {
    setErsMemberSearchKeyword(keyword)
    if (ersMemberSearchTimeoutRef.current) clearTimeout(ersMemberSearchTimeoutRef.current)
    if (!keyword.trim()) { setErsMemberSearchResults([]); setErsMemberShowDropdown(false); return }
    ersMemberSearchTimeoutRef.current = window.setTimeout(async () => {
      setErsMemberSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setErsMemberSearchResults(results.filter(r => r.id !== ersMembersRecord?.owner_id && r.id !== ersMembersRecord?.host_id && !(ersMembersRecord?.participant_ids || []).includes(r.id)))
        setErsMemberShowDropdown(true)
      } catch { setErsMemberSearchResults([]) }
      finally { setErsMemberSearching(false) }
    }, 300)
  }

  const handleErsAddParticipant = async (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!ersMembersRecord) return
    if (customer.remaining === 0) return
    const newIds = [...(ersMembersRecord.participant_ids || []), customer.id]
    try {
      await emotionalReleaseSessionApi.update(ersMembersRecord.id, { participant_ids: newIds } as any)
      setErsMembersRecord({ ...ersMembersRecord, participant_ids: newIds })

      setErsMemberSearchKeyword("")
      setErsMemberSearchResults([])
      setErsMemberShowDropdown(false)
      load()
    } catch (e) { handleApiError(e) }
  }

  const handleErsRemoveParticipant = async (id: string) => {
    if (!ersMembersRecord) return
    const newIds = (ersMembersRecord.participant_ids || []).filter(pid => pid !== id)
    try {
      await emotionalReleaseSessionApi.update(ersMembersRecord.id, { participant_ids: newIds } as any)
      setErsMembersRecord({ ...ersMembersRecord, participant_ids: newIds })

      load()
    } catch (e) { handleApiError(e) }
  }

  // 情绪释放成员弹窗中的主持人搜索
  const handleErsMemberHostSearch = (keyword: string) => {
    setErsMemberHostSearchKeyword(keyword)
    if (ersMemberHostSearchTimeoutRef.current) clearTimeout(ersMemberHostSearchTimeoutRef.current)
    if (!keyword.trim()) { setErsMemberHostSearchResults([]); setErsMemberHostShowDropdown(false); return }
    ersMemberHostSearchTimeoutRef.current = window.setTimeout(async () => {
      setErsMemberHostSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setErsMemberHostSearchResults(results.filter(r => r.id !== ersMembersRecord?.owner_id && !(ersMembersRecord?.participant_ids || []).includes(r.id)))
        setErsMemberHostShowDropdown(true)
      } catch { setErsMemberHostSearchResults([]) }
      finally { setErsMemberHostSearching(false) }
    }, 300)
  }

  const handleErsMemberSetHost = async (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!ersMembersRecord) return
    if (customer.remaining === 0) return
    try {
      await emotionalReleaseSessionApi.update(ersMembersRecord.id, { host_id: customer.id, host_name: customer.nickname || customer.name } as any)
      setErsMembersRecord({ ...ersMembersRecord, host_id: customer.id, host_name: customer.nickname || customer.name })

      setErsMemberHostSearchKeyword("")
      setErsMemberHostSearchResults([])
      setErsMemberHostShowDropdown(false)
      load()
    } catch (e) { handleApiError(e) }
  }

  const handleErsMemberRemoveHost = async () => {
    if (!ersMembersRecord) return
    try {
      await emotionalReleaseSessionApi.update(ersMembersRecord.id, { host_id: "", host_name: "" } as any)
      setErsMembersRecord({ ...ersMembersRecord, host_id: "", host_name: "" })

      load()
    } catch (e) { handleApiError(e) }
  }

  // ===== 能量结 handlers =====
  const handleOpenEksEdit = (session: EnergyKnotSession) => {
    setEksEditingRecord(session)
    setEksFormDate(session.date)
    setEksFormStartTime(session.start_time || "09:00")
    setEksFormEndTime(session.end_time || "10:00")
    const names = session.owner_name ? session.owner_name.split("、").filter(Boolean) : []
    const ids = session.owner_id ? [session.owner_id] : []
    setEksFormOwnerIds(ids.concat(new Array(Math.max(0, names.length - ids.length)).fill("")))
    setEksFormOwnerNames(names)
    setEksFormHostIds(session.host_ids || [])
    setEksFormHostNames(session.host_names || [])
    // 解析每个案主的详情，补全 id/name
    try {
      const parsed = JSON.parse(session.description || "[]")
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = names.map((name, i) => ({
          id: ids[i] || parsed[i]?.id || "",
          name,
          description: parsed[i]?.description || "",
        }))
        setEksFormOwnerDescriptions(merged)
      } else {
        setEksFormOwnerDescriptions(names.map((name, i) => ({ id: ids[i] || "", name, description: "" })))
      }
    } catch {
      setEksFormOwnerDescriptions(names.map((name, i) => ({ id: ids[i] || "", name, description: "" })))
    }
    setEksSearchField(null)
    setEksSearchKeyword("")
    setEksSearchResults([])
    setEksShowDropdown(false)
    setEksDialogOpen(true)
  }

  const handleEksSearch = (keyword: string) => {
    setEksSearchKeyword(keyword)
    if (eksSearchTimeoutRef.current) clearTimeout(eksSearchTimeoutRef.current)
    if (!keyword.trim()) { setEksSearchResults([]); setEksShowDropdown(false); return }
    eksSearchTimeoutRef.current = window.setTimeout(async () => {
      setEksSearching(true)
      try {
        const results = await energyKnotSessionApi.searchCustomers(keyword)
        setEksSearchResults(results.filter(r => !eksFormOwnerIds.includes(r.id) && !eksFormHostIds.includes(r.id)))
        setEksShowDropdown(true)
      } catch { setEksSearchResults([]) }
      finally { setEksSearching(false) }
    }, 300)
  }

  const handleEksSelectCustomer = (customer: EnergyKnotCustomerSearchResult) => {
    if (!eksSearchField) return
    if (eksSearchField === "owner") {
      if (customer.remaining !== -1 && customer.remaining <= 0) {
        setEksPendingOwner(customer)
        setEksPurchaseDialogOpen(true)
        return
      }
      if (!eksFormOwnerIds.includes(customer.id)) {
        setEksFormOwnerIds([...eksFormOwnerIds, customer.id])
        setEksFormOwnerNames([...eksFormOwnerNames, customer.nickname || customer.name])
        setEksFormOwnerDescriptions([...eksFormOwnerDescriptions, { id: customer.id, name: customer.nickname || customer.name, description: "" }])
      }
    } else if (eksSearchField === "host") {
      if (!eksFormHostIds.includes(customer.id)) {
        setEksFormHostIds([...eksFormHostIds, customer.id])
        setEksFormHostNames([...eksFormHostNames, customer.nickname || customer.name])
      }
    }
    setEksSearchKeyword("")
    setEksSearchResults([])
    setEksShowDropdown(false)
    setEksSearchField(null)
  }

  const handleEksRemoveOwner = (index: number) => {
    setEksFormOwnerIds(eksFormOwnerIds.filter((_, i) => i !== index))
    setEksFormOwnerNames(eksFormOwnerNames.filter((_, i) => i !== index))
    setEksFormOwnerDescriptions(eksFormOwnerDescriptions.filter((_, i) => i !== index))
  }

  const handleEksRemoveHost = (index: number) => {
    setEksFormHostIds(eksFormHostIds.filter((_, i) => i !== index))
    setEksFormHostNames(eksFormHostNames.filter((_, i) => i !== index))
  }

  const handleEksSave = async () => {
    if (eksFormOwnerIds.length === 0) return
    setEksSaving(true)
    try {
      const data = {
        date: eksFormDate,
        start_time: eksFormStartTime || null,
        end_time: eksFormEndTime || null,
        owner_id: eksFormOwnerIds[0] || "",
        owner_name: eksFormOwnerNames.join("、"),
        host_ids: eksFormHostIds,
        host_names: eksFormHostNames,
        description: eksFormOwnerDescriptions.length > 0 ? JSON.stringify(eksFormOwnerDescriptions) : undefined,
      }
      if (eksEditingRecord) {
        await energyKnotSessionApi.update(eksEditingRecord.id, data)
      } else {
        await energyKnotSessionApi.create(data)
      }
      setEksDialogOpen(false)
      load()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setEksSaving(false)
    }
  }

  const handleEksDelete = async () => {
    if (!eksDeleteId) return
    await energyKnotSessionApi.delete(eksDeleteId)
    setEksDeleteId(null)
    load()
  }

  const handleEksAddPurchase = async () => {
    if (!eksPendingOwner || !eksPurchaseCount) return
    setEksPurchaseSaving(true)
    try {
      await energyKnotApi.create({
        customer_id: eksPendingOwner.id,
        nickname: eksPendingOwner.nickname,
        purchase_count: parseInt(eksPurchaseCount) || 0,
        amount: parseFloat(eksPurchaseAmount) || 0,
      })
      if (!eksFormOwnerIds.includes(eksPendingOwner.id)) {
        setEksFormOwnerIds([...eksFormOwnerIds, eksPendingOwner.id])
        setEksFormOwnerNames([...eksFormOwnerNames, eksPendingOwner.nickname])
        setEksFormOwnerDescriptions([...eksFormOwnerDescriptions, { id: eksPendingOwner.id, name: eksPendingOwner.nickname, description: "" }])
      }
      setEksPurchaseDialogOpen(false)
      setEksPendingOwner(null)
      load()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setEksPurchaseSaving(false)
    }
  }

  // ===== 内部课程 handlers =====
  const ICS_COURSE_TYPES = ["疗愈师课程", "商业框架陪跑", "落地赋能班"]

  const handleIcsSearch = (keyword: string) => {
    setIcsSearchKeyword(keyword)
    if (icsSearchTimeoutRef.current) clearTimeout(icsSearchTimeoutRef.current)
    if (!keyword.trim()) { setIcsSearchResults([]); setIcsShowDropdown(false); return }
    icsSearchTimeoutRef.current = window.setTimeout(async () => {
      setIcsSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        setIcsSearchResults(results.filter(r => r.id !== icsFormHostId))
        setIcsShowDropdown(true)
      } catch { setIcsSearchResults([]) }
      finally { setIcsSearching(false) }
    }, 300)
  }

  const handleIcsSelectHost = (customer: InternalCourseSessionCustomerSearchResult) => {
    setIcsFormHostId(customer.id)
    setIcsFormHostName(customer.nickname || customer.name)
    setIcsSearchKeyword("")
    setIcsSearchResults([])
    setIcsShowDropdown(false)
    setIcsSearchField(null)
  }

  const handleOpenIcsEdit = (session: InternalCourseSession) => {
    setIcsEditingRecord(session)
    setIcsFormDate(session.date)
    setIcsFormStartTime(session.start_time || "09:00")
    setIcsFormEndTime(session.end_time || "10:00")
    setIcsFormCourseType(session.course_type || "")
    setIcsFormCourseName(session.course_name)
    setIcsFormDescription(session.course_description || "")
    setIcsFormHostId(session.host_ids?.[0] || "")
    setIcsFormHostName(session.host_names?.[0] || "")
    setIcsSearchField(null)
    setIcsSearchKeyword("")
    setIcsSearchResults([])
    setIcsShowDropdown(false)
    setIcsDialogOpen(true)
  }

  const handleIcsSave = async () => {
    if (!icsFormCourseName) return
    setIcsSaving(true)
    try {
      const data = {
        date: icsFormDate,
        start_time: icsFormStartTime || null,
        end_time: icsFormEndTime || null,
        course_type: icsFormCourseType,
        course_name: icsFormCourseName,
        course_description: icsFormDescription,
        host_ids: icsFormHostId ? [icsFormHostId] : [],
        host_names: icsFormHostName ? [icsFormHostName] : [],
      }
      if (icsEditingRecord) {
        await internalCourseSessionApi.update(icsEditingRecord.id, data)
      } else {
        await internalCourseSessionApi.create(data)
      }
      setIcsDialogOpen(false)
      load()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setIcsSaving(false)
    }
  }

  const handleIcsDelete = async () => {
    if (!icsDeleteId) return
    await internalCourseSessionApi.delete(icsDeleteId)
    setIcsDeleteId(null)
    load()
  }

  // 内部课程资料
  const handleOpenIcsMaterials = (session: InternalCourseSession) => {
    setIcsMaterialsRecord(session)
    setIcsMaterialsDialogOpen(true)
  }

  const handleIcsUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !icsMaterialsRecord) return
    setIcsUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(icsMaterialsRecord.materials || []), material]
      await internalCourseSessionApi.update(icsMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...icsMaterialsRecord, materials: newMaterials }
      setIcsMaterialsRecord(updated)
      load()
    } catch { alert("上传失败，请重试") }
    finally { setIcsUploading(false); e.target.value = "" }
  }

  const handleIcsDeleteMaterial = async (filename: string) => {
    if (!icsMaterialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (icsMaterialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await internalCourseSessionApi.update(icsMaterialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...icsMaterialsRecord, materials: newMaterials }
      setIcsMaterialsRecord(updated)
      load()
    } catch { }
  }

  // 内部课程成员
  const handleOpenIcsMembers = (session: InternalCourseSession) => {
    setIcsMembersRecord(session)
    setIcsMembersDialogOpen(true)
    setIcsMemberSearchKeyword("")
    setIcsMemberSearchResults([])
    setIcsMemberShowDropdown(false)
  }

  const handleIcsMemberSearch = (keyword: string) => {
    setIcsMemberSearchKeyword(keyword)
    if (icsMemberSearchTimeoutRef.current) clearTimeout(icsMemberSearchTimeoutRef.current)
    if (!keyword.trim()) { setIcsMemberSearchResults([]); setIcsMemberShowDropdown(false); return }
    icsMemberSearchTimeoutRef.current = window.setTimeout(async () => {
      setIcsMemberSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        setIcsMemberSearchResults(results.filter(r => !(icsMembersRecord?.participant_ids || []).includes(r.id)))
        setIcsMemberShowDropdown(true)
      } catch { setIcsMemberSearchResults([]) }
      finally { setIcsMemberSearching(false) }
    }, 300)
  }

  const handleIcsAddParticipant = async (customer: InternalCourseSessionCustomerSearchResult) => {
    if (!icsMembersRecord) return
    const newIds = [...(icsMembersRecord.participant_ids || []), customer.id]
    try {
      await internalCourseSessionApi.update(icsMembersRecord.id, { participant_ids: newIds } as any)
      setIcsMembersRecord({ ...icsMembersRecord, participant_ids: newIds })
      setIcsMemberSearchKeyword("")
      setIcsMemberSearchResults([])
      setIcsMemberShowDropdown(false)
      load()
    } catch { }
  }

  const handleIcsRemoveParticipant = async (id: string) => {
    if (!icsMembersRecord) return
    const newIds = (icsMembersRecord.participant_ids || []).filter(pid => pid !== id)
    try {
      await internalCourseSessionApi.update(icsMembersRecord.id, { participant_ids: newIds } as any)
      setIcsMembersRecord({ ...icsMembersRecord, participant_ids: newIds })
      load()
    } catch { }
  }

  const effectiveDetailTab = standaloneTab || detailTab

  // TODO: ers/eks/ics UI 待添加，暂时抑制未使用变量警告
  void gcsSearching; void gcsMemberSearching; void gcsMemberHostSearching
  void ersSearching; void ersMemberSearching; void ersMemberHostSearching
  void eksSearching
  void icsSearching; void icsMemberSearching
  void handleOpenIcsMaterials

  // 权限检查
  const userPermissions = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("userPermissions") || "[]") } catch { return [] }
  }, [])
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} }
  }, [])
  const isSuperAdmin = currentUser?.role === "超级管理员"
  const hasPerm = (key: string) => isSuperAdmin || userPermissions.includes(key) || userPermissions.includes("class-records")

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
            到场人员
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
      <div className="flex items-center">
        <CalendarDatePicker detailDate={detailDate} onSelectDate={setDetailDate} />
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
                : records.filter(r => r.date === d).length
                  + groupCaseSessions.filter(s => s.date === d).length
                  + emotionalReleaseSessions.filter(s => s.date === d).length
                  + energyKnotSessions.filter(s => s.date === d).length
                  + internalCourseSessions.filter(s => s.date === d).length
              return (
                <button
                  key={d}
                  className={`shrink-0 flex flex-col items-center justify-center w-10 h-12 rounded-md transition-colors ${
                    isSelected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff]" : "hover:bg-[#f7f8fa]"
                  }`}
                  onClick={() => setDetailDate(d)}
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
          <VisitsDetailView externalDate={detailDate} onExternalDateChange={setDetailDate} hideDateBar />
        </div>
      ) : effectiveDetailTab === "grouping" ? (
      /* 人员分组页面：左栏人员列表 + 右栏分组管理 */
      <GroupingView
        date={detailDate}
        dayVisits={dayVisits}
        allCustomers={allCustomers}
        groups={groups}
        setGroups={setGroups}
        onSave={async (newGroups) => {
          await dailyGroupingApi.upsert({ date: detailDate, groups: newGroups })
          setGroups(newGroups)
        }}
      />
      ) : effectiveDetailTab === "arrival_confirmation" ? (
      /* 到场确认页面 */
      <div className="flex-1 overflow-y-auto">
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
              const visits = await visitApi.list(detailDate)
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
            {unifiedDetailRecords.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{detailDate === today ? "今天暂无记录" : `${detailDate} 暂无记录`}</p>
              </div>
            ) : (
              <ActivityCardList
                records={unifiedDetailRecords}
                isActivitiesView={isActivitiesView}
                standaloneTab={standaloneTab}
                dayVisits={dayVisits}
                dragOverActivityId={dragOverActivityId}
                setDragOverActivityId={setDragOverActivityId}
                onOpenMemberDialog={onOpenMemberDialog}
                setDeleteId={setDeleteId}
                setGcsDeleteId={setGcsDeleteId}
                setErsDeleteId={setErsDeleteId}
                setEksDeleteId={setEksDeleteId}
                setIcsDeleteId={setIcsDeleteId}
                handleOpenEdit={handleOpenEdit}
                handleOpenMaterials={handleOpenMaterials}
                handleOpenGroups={handleOpenGroups}
                handleDropToClass={handleDropToClass}
                handleOpenGcsEdit={handleOpenGcsEdit}
                handleOpenGcsMaterials={handleOpenGcsMaterials}
                handleOpenGcsMembers={handleOpenGcsMembers}
                handleDropToGcs={handleDropToGcs}
                handleOpenErsEdit={handleOpenErsEdit}
                handleOpenErsMaterials={handleOpenErsMaterials}
                handleOpenErsMembers={handleOpenErsMembers}
                handleDropToErs={handleDropToErs}
                handleOpenEksEdit={handleOpenEksEdit}
                handleDropToEks={handleDropToEks}
                handleOpenIcsEdit={handleOpenIcsEdit}
                handleOpenIcsMaterials={handleOpenIcsMaterials}
                handleOpenIcsMembers={handleOpenIcsMembers}
                handleDropToIcs={handleDropToIcs}
                getTeacherNames={getTeacherNames}
                getMemberName={getMemberName}
                dailyGroups={groups}
              />
            )}

          </div>
        </div>
      )}
      </div>

      {/* 新增/编辑记录弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingRecord ? "编辑活动" : "新增活动"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <div className="relative">
                <div
                  className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                  onClick={() => setShowCourseDropdown(!showCourseDropdown)}
                >
                  <span className={selectedCourse ? "text-[#2b2f36]" : "text-muted-foreground"}>
                    {selectedCourse?.name || "选择课程"}
                  </span>
                </div>
                {showCourseDropdown && courses.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {courses.map((course) => (
                      <div
                        key={course.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted ${formCourseId === course.id ? "bg-muted/50" : ""}`}
                        onClick={() => {
                          setFormCourseId(course.id)
                          setShowCourseDropdown(false)
                        }}
                      >
                        <div>
                          <span className="text-[12px]">{course.name}</span>
                          <span className="text-[12px] text-muted-foreground ml-2">{course.type}</span>
                        </div>
                        {formCourseId === course.id && (
                          <span className="text-xs text-primary">已选</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="relative">
                <div
                  className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                  onClick={() => setShowTeacherDropdown(!showTeacherDropdown)}
                >
                  <span className={formTeacherId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                    {formTeacherId ? (() => { const c = allCustomers.find(t => t.id === formTeacherId); return c?.nickname || c?.name || formTeacherId })() : "选择课程老师"}
                  </span>
                </div>
                {showTeacherDropdown && teachers.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {teachers.map((teacher) => (
                      <div
                        key={teacher.id}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted ${formTeacherId === teacher.id ? "bg-muted/50" : ""}`}
                        onClick={() => { setFormTeacherId(teacher.id); setShowTeacherDropdown(false) }}
                      >
                        <span className="text-[12px]">{teacher.nickname || teacher.name || "未命名"}</span>
                        {formTeacherId === teacher.id && (
                          <span className="text-xs text-primary">已选</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {showTeacherDropdown && teachers.length === 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-xs text-muted-foreground text-center">
                    暂无课程老师，请先在疗愈身份中添加
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">是否公益</span>
              <div className="relative">
                <SelectDropdown
                  value={formIsPublicWelfare ? "1" : "0"}
                  options={[{value: "0", label: "否"}, {value: "1", label: "是"}]}
                  onChange={(v) => setFormIsPublicWelfare(v === "1")}
                />
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程介绍</span>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="输入课程介绍..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCourseId}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 资料弹窗 */}
      <Dialog open={materialsDialogOpen} onOpenChange={setMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">{materialsRecord?.course_name}</span>
              <div className="shrink-0">
                <input type="file" id="materials-upload-cr" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("materials-upload-cr")?.click()}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden">
              {(materialsRecord?.materials || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无资料</div>
              ) : (
                (materialsRecord?.materials || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                      <span className="text-xs text-[#2b2f36] truncate">{m.name}</span>
                      <span className="text-[12px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`${"http://127.0.0.1:8000"}${m.url}`} download className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]">
                        <Download className="h-3.5 w-3.5 text-[#8f959e]" />
                      </a>
                      <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleDeleteMaterial(m.url.split("/").pop()!)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除活动</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条活动吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 成员选择弹窗 */}
      {memberDialogOpen && memberDialogRecord && (() => {
        const record = memberDialogRecord
        const isHostType = memberDialogType === "gcs" || memberDialogType === "ers"
        const activityName = memberDialogType === "class" ? record.course_name : memberDialogType === "gcs" ? "觉醒游戏" : memberDialogType === "ers" ? "情绪释放" : memberDialogType === "ics" ? record.course_name : ""

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
                        <span key={p.id} className="inline-flex items-center gap-1 text-[12px] bg-[#f0f1f2] text-[#646a73] px-1.5 py-0.5 rounded">
                          {p.nickname}
                          {p.role && <span className="text-[10px] text-[#8f959e]">{p.role}</span>}
                          <button className="hover:text-[#f54a45]" onClick={() => handleRemoveFromActivity(p.id)}>×</button>
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

      {/* 小组人员编辑弹窗 */}
      {groupsPanelOpen && <Dialog open={groupsPanelOpen} onOpenChange={(open) => { setGroupsPanelOpen(open); if (!open) setGroupsRecord(null) }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">人员配置</DialogTitle>
          </DialogHeader>
          {groupsRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = isVisitorAssigned(v.id)
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => { setDraggingVisitorId(null); setDropTargetGroup(null) }}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：分组 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
              <div className="text-[12px] text-[#8f959e]">{groupsRecord.course_name} · {groupsRecord.date}</div>

              {(groupsRecord.groups || []).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">暂无小组</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">点击下方按钮添加小组</p>
                </div>
              ) : (
                groupsRecord.groups.map((group, gi) => (
                  <div
                    key={gi}
                    className={`border rounded-lg bg-white transition-colors ${
                      dropTargetGroup === gi ? "border-[#3370ff] bg-[#f0f5ff]" : "border-[#e8e8e8]"
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDropTargetGroup(gi) }}
                    onDragLeave={() => setDropTargetGroup(null)}
                    onDrop={(e) => {
                      e.preventDefault()
                      const vid = draggingVisitorId
                      const visitor = dayVisits.find(v => v.id === vid)
                      if (visitor) handleDropVisitor(gi, visitor)
                    }}
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#f0f0f0]">
                      <input
                        className="text-[12px] font-medium text-[#2b2f36] bg-transparent border-none outline-none flex-1 min-w-0"
                        value={group.name}
                        onChange={(e) => handleGroupNameChange(gi, e.target.value)}
                        onBlur={() => handleSaveGroupName(gi)}
                        placeholder="小组名称"
                      />
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0"
                        onClick={() => handleRemoveGroup(gi)}
                      >
                        <Trash2 className="h-3 w-3 text-[#8f959e]" />
                      </button>
                    </div>

                    <div className="px-3 py-2.5 space-y-2.5">
                      {/* 组长 + 副组长 */}
                      <div className="flex gap-3">
                        <div className="flex-[0.40] flex items-center gap-1.5 min-w-0">
                          <span className="text-[12px] text-[#4e535a] shrink-0">组长</span>
                          {group.leader_id ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <Badge variant="secondary" className="text-[12px] font-normal truncate">{getMemberName(group.leader_id)}</Badge>
                              <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => handleRemoveGroupMember(gi, "leader")}>
                                <X className="h-2.5 w-2.5 text-[#8f959e]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 relative min-w-0">
                              <Input
                                value={groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "leader" ? groupSearchKeyword : ""}
                                onChange={(e) => handleGroupSearch(e.target.value, gi, "leader")}
                                placeholder="选择组长"
                                className="h-7 text-[12px]"
                                onFocus={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current) }}
                                onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => setGroupSearchResults([]), 200) }}
                              />
                              {groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "leader" && groupSearchResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                  {groupSearchResults.map((c) => c.remaining === 0 ? (
                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                      <span>{c.nickname}</span>
                                      <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                    </div>
                                  ) : (
                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                      <span>{c.nickname}</span>
                                      <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex-[0.45] flex items-center gap-1.5 min-w-0">
                          <span className="text-[12px] text-[#4e535a] shrink-0">副组长</span>
                          {group.deputy_id ? (
                            <div className="flex items-center gap-1 min-w-0">
                              <Badge variant="secondary" className="text-[12px] font-normal truncate">{getMemberName(group.deputy_id)}</Badge>
                              <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0] shrink-0" onClick={() => handleRemoveGroupMember(gi, "deputy")}>
                                <X className="h-2.5 w-2.5 text-[#8f959e]" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex-1 relative min-w-0">
                              <Input
                                value={groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "deputy" ? groupSearchKeyword : ""}
                                onChange={(e) => handleGroupSearch(e.target.value, gi, "deputy")}
                                placeholder="选择副组长"
                                className="h-7 text-[12px]"
                                onFocus={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current) }}
                                onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => setGroupSearchResults([]), 200) }}
                              />
                              {groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "deputy" && groupSearchResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                  {groupSearchResults.map((c) => c.remaining === 0 ? (
                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                      <span>{c.nickname}</span>
                                      <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                    </div>
                                  ) : (
                                    <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                      <span>{c.nickname}</span>
                                      <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 组员 */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[12px] text-[#4e535a]">组员</span>
                          </div>
                          <div className="flex-1 relative min-w-0">
                            <Input
                              value={groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "member" ? groupSearchKeyword : ""}
                              onChange={(e) => handleGroupSearch(e.target.value, gi, "member")}
                              placeholder="搜索添加组员"
                              className="h-7 text-[12px]"
                              onFocus={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current) }}
                              onBlur={() => { if (groupBlurTimeoutRef.current) clearTimeout(groupBlurTimeoutRef.current); groupBlurTimeoutRef.current = window.setTimeout(() => setGroupSearchResults([]), 200) }}
                            />
                            {groupSearchTarget?.groupIndex === gi && groupSearchTarget?.role === "member" && groupSearchResults.length > 0 && (
                              <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                                {groupSearchResults.map((c) => c.remaining === 0 ? (
                                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                    <span>{c.nickname}</span>
                                    <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                  </div>
                                ) : (
                                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleAssignGroupMember(c)}>
                                    <span>{c.nickname}</span>
                                    <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        {group.member_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 ml-[28px]">
                            {group.member_ids.map((mid) => (
                              <Badge key={mid} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                                {getMemberName(mid)}
                                <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleRemoveGroupMember(gi, "member", mid)}>
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-dashed" onClick={handleAddGroup}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> 添加小组
                </Button>
                <Button size="sm" className="h-8 text-xs px-5" onClick={() => setGroupsPanelOpen(false)}>
                  确定
                </Button>
              </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>}

      {/* ===== 觉醒游戏 新增/编辑弹窗 ===== */}
      <Dialog open={gcsDialogOpen} onOpenChange={setGcsDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{gcsEditingRecord ? "编辑觉醒游戏" : "新增觉醒游戏"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={gcsFormDate} onChange={(e) => setGcsFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={gcsFormStartTime} onChange={(e) => setGcsFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={gcsFormEndTime} onChange={(e) => setGcsFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <div className="relative" ref={gcsDropdownRef}>
                {gcsSearchField === "owner" ? (
                  <Input
                    value={gcsSearchKeyword}
                    onChange={(e) => handleGcsSearch(e.target.value)}
                    placeholder="搜索案主..."
                    className="h-8 text-xs"
                    autoFocus
                    onBlur={() => { if (gcsBlurTimeoutRef.current) clearTimeout(gcsBlurTimeoutRef.current); gcsBlurTimeoutRef.current = window.setTimeout(() => { if (gcsSearchField === "owner") { setGcsSearchField(null); setGcsShowDropdown(false) } }, 200) }}
                  />
                ) : (
                  <div
                    className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                    onClick={() => { if (gcsBlurTimeoutRef.current) clearTimeout(gcsBlurTimeoutRef.current); setGcsSearchField("owner"); setGcsSearchKeyword(gcsFormOwnerName); setGcsSearchResults([]); setGcsShowDropdown(false); if (gcsFormOwnerName) handleGcsSearch(gcsFormOwnerName) }}
                  >
                    <span className={gcsFormOwnerId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                      {gcsFormOwnerName || "选择案主"}
                    </span>
                  </div>
                )}
                {gcsShowDropdown && gcsSearchField === "owner" && gcsSearchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                    {gcsSearchResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleGcsSelectCustomer(c)}>
                        <span>{c.nickname || c.name}</span>
                        <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成就君</span>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] outline-none"
                value={gcsFormAchieverId}
                onChange={(e) => {
                  const id = e.target.value
                  const c = allCustomers.find(c => c.id === id)
                  setGcsFormAchieverId(id)
                  setGcsFormAchieverName(c?.nickname || c?.name || "")
                }}
              >
                <option value="">选择成就君</option>
                {allCustomers.filter(c => c.positions?.includes("成就君")).map(c => (
                  <option key={c.id} value={c.id}>{c.nickname || c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">个案详情</span>
              <textarea
                value={gcsFormDescription}
                onChange={(e) => setGcsFormDescription(e.target.value)}
                placeholder="输入个案详情..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setGcsDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleGcsSave} disabled={gcsSaving || !gcsFormOwnerId}>
                {gcsSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 情绪释放 新增/编辑弹窗 ===== */}
      <Dialog open={ersDialogOpen} onOpenChange={setErsDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{ersEditingRecord ? "编辑情绪释放" : "新增情绪释放"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={ersFormDate} onChange={(e) => setErsFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={ersFormStartTime} onChange={(e) => setErsFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={ersFormEndTime} onChange={(e) => setErsFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <div className="relative" ref={ersDropdownRef}>
                {ersSearchField === "owner" ? (
                  <Input
                    value={ersSearchKeyword}
                    onChange={(e) => handleErsSearch(e.target.value)}
                    placeholder="搜索案主..."
                    className="h-8 text-xs"
                    autoFocus
                    onBlur={() => { if (ersBlurTimeoutRef.current) clearTimeout(ersBlurTimeoutRef.current); ersBlurTimeoutRef.current = window.setTimeout(() => { if (ersSearchField === "owner") { setErsSearchField(null); setErsShowDropdown(false) } }, 200) }}
                  />
                ) : (
                  <div
                    className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                    onClick={() => { if (ersBlurTimeoutRef.current) clearTimeout(ersBlurTimeoutRef.current); setErsSearchField("owner"); setErsSearchKeyword(ersFormOwnerName); setErsSearchResults([]); setErsShowDropdown(false); if (ersFormOwnerName) handleErsSearch(ersFormOwnerName) }}
                  >
                    <span className={ersFormOwnerId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                      {ersFormOwnerName || "选择案主"}
                    </span>
                  </div>
                )}
                {ersShowDropdown && ersSearchField === "owner" && ersSearchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                    {ersSearchResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleErsSelectCustomer(c)}>
                        <span>{c.nickname || c.name}</span>
                        <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成就君</span>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] outline-none"
                value={ersFormAchieverId}
                onChange={(e) => {
                  const id = e.target.value
                  const c = allCustomers.find(c => c.id === id)
                  setErsFormAchieverId(id)
                  setErsFormAchieverName(c?.nickname || c?.name || "")
                }}
              >
                <option value="">选择成就君</option>
                {allCustomers.filter(c => c.positions?.includes("成就君")).map(c => (
                  <option key={c.id} value={c.id}>{c.nickname || c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">个案详情</span>
              <textarea
                value={ersFormDescription}
                onChange={(e) => setErsFormDescription(e.target.value)}
                placeholder="输入个案详情..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setErsDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleErsSave} disabled={ersSaving || !ersFormOwnerId}>
                {ersSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== 能量结 新增/编辑弹窗 ===== */}
      <Dialog open={eksDialogOpen} onOpenChange={setEksDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{eksEditingRecord ? "编辑能量结" : "新增能量结"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={eksFormDate} onChange={(e) => setEksFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={eksFormStartTime} onChange={(e) => setEksFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={eksFormEndTime} onChange={(e) => setEksFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <div className="space-y-1.5" ref={eksDropdownRef}>
                <div className="relative">
                  {eksSearchField === "owner" ? (
                    <Input
                      value={eksSearchKeyword}
                      onChange={(e) => handleEksSearch(e.target.value)}
                      placeholder="搜索添加案主..."
                      className="h-8 text-xs"
                      autoFocus
                      onBlur={() => { setTimeout(() => { setEksSearchField(null); setEksShowDropdown(false) }, 200) }}
                    />
                  ) : (
                    <div
                      className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center text-muted-foreground"
                      onClick={() => { setEksSearchField("owner"); setEksSearchKeyword(""); setEksSearchResults([]); setEksShowDropdown(false) }}
                    >
                      搜索添加案主
                    </div>
                  )}
                  {eksShowDropdown && eksSearchField === "owner" && eksSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                      {eksSearchResults.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleEksSelectCustomer(c)}>
                          <span>{c.nickname || c.name}</span>
                          <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {eksFormOwnerNames.length > 0 && (
                  <div className="space-y-2">
                    {eksFormOwnerNames.map((name, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[12px] font-medium text-[#2b2f36]">{name}</span>
                          <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0] text-muted-foreground" onClick={() => handleEksRemoveOwner(i)}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <Input
                          value={eksFormOwnerDescriptions[i]?.description || ""}
                          onChange={(e) => {
                            const updated = [...eksFormOwnerDescriptions]
                            updated[i] = { ...updated[i], description: e.target.value }
                            setEksFormOwnerDescriptions(updated)
                          }}
                          placeholder="情况介绍..."
                          className="flex-1 h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="space-y-1.5">
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] outline-none"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id || eksFormHostIds.includes(id)) return
                    const c = allCustomers.find(c => c.id === id)
                    setEksFormHostIds([...eksFormHostIds, id])
                    setEksFormHostNames([...eksFormHostNames, c?.nickname || c?.name || ""])
                  }}
                >
                  <option value="">选择课程老师</option>
                  {allCustomers.filter(c => c.positions?.includes("能量结老师")).map(c => (
                    <option key={c.id} value={c.id}>{c.nickname || c.name}</option>
                  ))}
                </select>
                {eksFormHostNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {eksFormHostNames.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                        {name}
                        <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleEksRemoveHost(i)}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setEksDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleEksSave} disabled={eksSaving || eksFormOwnerIds.length === 0}>
                {eksSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 能量结 购买弹窗 */}
      <Dialog open={eksPurchaseDialogOpen} onOpenChange={setEksPurchaseDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增购买</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="text-[12px] text-[#8f959e]">
              {eksPendingOwner?.nickname || eksPendingOwner?.name} 暂无剩余次数，请先录入购买信息
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input type="number" value={eksPurchaseCount} onChange={(e) => setEksPurchaseCount(e.target.value)} placeholder="输入次数" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={eksPurchaseAmount} onChange={(e) => setEksPurchaseAmount(e.target.value)} placeholder="输入金额" className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setEksPurchaseDialogOpen(false); setEksPendingOwner(null) }}>取消</Button>
              <Button size="sm" onClick={handleEksAddPurchase} disabled={eksPurchaseSaving || !eksPurchaseCount}>
                {eksPurchaseSaving ? "保存中..." : "确认购买"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 觉醒游戏 购买弹窗 */}
      <Dialog open={gcsPurchaseDialogOpen} onOpenChange={setGcsPurchaseDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增购买</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="text-[12px] text-[#8f959e]">
              {gcsPendingOwner?.nickname || gcsPendingOwner?.name} 暂无剩余次数，请先录入购买信息
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input type="number" value={gcsPurchaseCount} onChange={(e) => setGcsPurchaseCount(e.target.value)} placeholder="输入次数" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={gcsPurchaseAmount} onChange={(e) => setGcsPurchaseAmount(e.target.value)} placeholder="输入金额" className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setGcsPurchaseDialogOpen(false); setGcsPendingOwner(null) }}>取消</Button>
              <Button size="sm" onClick={handleGcsAddPurchase} disabled={gcsPurchaseSaving || !gcsPurchaseCount}>
                {gcsPurchaseSaving ? "保存中..." : "确认购买"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 情绪释放 购买弹窗 */}
      <Dialog open={ersPurchaseDialogOpen} onOpenChange={setErsPurchaseDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增购买</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="text-[12px] text-[#8f959e]">
              {ersPendingOwner?.nickname || ersPendingOwner?.name} 暂无剩余次数，请先录入购买信息
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input type="number" value={ersPurchaseCount} onChange={(e) => setErsPurchaseCount(e.target.value)} placeholder="输入次数" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={ersPurchaseAmount} onChange={(e) => setErsPurchaseAmount(e.target.value)} placeholder="输入金额" className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setErsPurchaseDialogOpen(false); setErsPendingOwner(null) }}>取消</Button>
              <Button size="sm" onClick={handleErsAddPurchase} disabled={ersPurchaseSaving || !ersPurchaseCount}>
                {ersPurchaseSaving ? "保存中..." : "确认购买"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 觉醒游戏 资料弹窗 */}
      <Dialog open={gcsMaterialsDialogOpen} onOpenChange={setGcsMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">{gcsMaterialsRecord?.description || "觉醒游戏"}</span>
              <div className="shrink-0">
                <input type="file" id="gcs-materials-upload" className="hidden" onChange={handleUploadGcsMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("gcs-materials-upload")?.click()}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden">
              {(gcsMaterialsRecord?.materials || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无资料</div>
              ) : (
                (gcsMaterialsRecord?.materials || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                      <span className="text-xs text-[#2b2f36] truncate">{m.name}</span>
                      <span className="text-[12px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`${"http://127.0.0.1:8000"}${m.url}`} download className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]">
                        <Download className="h-3.5 w-3.5 text-[#8f959e]" />
                      </a>
                      <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleDeleteGcsMaterial(m.url.split("/").pop()!)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 情绪释放 资料弹窗 */}
      <Dialog open={ersMaterialsDialogOpen} onOpenChange={setErsMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">情绪释放</span>
              <div className="shrink-0">
                <input type="file" id="ers-materials-upload" className="hidden" onChange={handleUploadErsMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("ers-materials-upload")?.click()}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden">
              {(ersMaterialsRecord?.materials || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无资料</div>
              ) : (
                (ersMaterialsRecord?.materials || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                      <span className="text-xs text-[#2b2f36] truncate">{m.name}</span>
                      <span className="text-[12px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`${"http://127.0.0.1:8000"}${m.url}`} download className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]">
                        <Download className="h-3.5 w-3.5 text-[#8f959e]" />
                      </a>
                      <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleDeleteErsMaterial(m.url.split("/").pop()!)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 觉醒游戏 成员弹窗 */}
      {gcsMembersDialogOpen && <Dialog open={gcsMembersDialogOpen} onOpenChange={(open) => { setGcsMembersDialogOpen(open); if (!open) setGcsMembersRecord(null) }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">成员配置</DialogTitle>
          </DialogHeader>
          {gcsMembersRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = gcsMembersRecord.participant_ids?.includes(v.id) || gcsMembersRecord.host_id === v.id || gcsMembersRecord.owner_id === v.id
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => setDraggingVisitorId(null)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：人员配置 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const vid = draggingVisitorId
                  if (!vid) return
                  const visitor = dayVisits.find(v => v.id === vid)
                  if (visitor && gcsMembersRecord) {
                    handleGcsAddParticipant({ id: visitor.id, nickname: visitor.nickname, name: visitor.nickname, member_type: visitor.member_type, remaining: -1 })
                  }
                  setDraggingVisitorId(null)
                }}
              >
                <div className="text-[12px] text-[#8f959e]">{gcsMembersRecord.description || "觉醒游戏"} · {gcsMembersRecord.date}</div>

                <div className="border border-[#e8e8e8] rounded-lg bg-white">
                  <div className="px-3 py-2 border-b border-[#f0f0f0]">
                    <span className="text-[12px] font-medium text-[#2b2f36]">人员配置</span>
                  </div>

                  <div className="px-3 py-2.5 space-y-2.5">
                    {/* 主持人 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-[#4e535a] shrink-0">主持人</span>
                      {gcsMembersRecord.host_id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Badge variant="secondary" className="text-[12px] font-normal">{gcsMembersRecord.host_name || getMemberName(gcsMembersRecord.host_id)}</Badge>
                          <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={handleGcsMemberRemoveHost}>
                            <X className="h-2.5 w-2.5 text-[#8f959e]" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 relative" ref={gcsMemberHostDropdownRef}>
                          <Input
                            value={gcsMemberHostSearchKeyword}
                            onChange={(e) => handleGcsMemberHostSearch(e.target.value)}
                            placeholder="选择主持人"
                            className="h-7 text-[12px]"
                          />
                          {gcsMemberHostShowDropdown && gcsMemberHostSearchResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                              {gcsMemberHostSearchResults.map((c) => c.remaining === 0 ? (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                </div>
                              ) : (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleGcsMemberSetHost(c)}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 参与者 */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[12px] text-[#4e535a] shrink-0">参与者</span>
                        <div className="flex-1 relative min-w-0" ref={gcsMemberDropdownRef}>
                        <Input
                          value={gcsMemberSearchKeyword}
                          onChange={(e) => handleGcsMemberSearch(e.target.value)}
                          placeholder="搜索添加组员"
                          className="h-7 text-[12px]"
                        />
                        {gcsMemberShowDropdown && gcsMemberSearchResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                            {gcsMemberSearchResults.map((c) => c.remaining === 0 ? (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                              </div>
                            ) : (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleGcsAddParticipant(c)}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                      {(gcsMembersRecord.participant_ids || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-[42px]">
                          {gcsMembersRecord.participant_ids.map((id) => (
                            <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                              {getMemberName(id)}
                              <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleGcsRemoveParticipant(id)}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button size="sm" className="h-8 text-xs px-5" onClick={() => setGcsMembersDialogOpen(false)}>确定</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>}

      {/* 情绪释放 成员弹窗 */}
      {ersMembersDialogOpen && <Dialog open={ersMembersDialogOpen} onOpenChange={(open) => { setErsMembersDialogOpen(open); if (!open) setErsMembersRecord(null) }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">成员配置</DialogTitle>
          </DialogHeader>
          {ersMembersRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = ersMembersRecord.participant_ids?.includes(v.id) || ersMembersRecord.host_id === v.id || ersMembersRecord.owner_id === v.id
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => setDraggingVisitorId(null)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：人员配置 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const vid = draggingVisitorId
                  if (!vid) return
                  const visitor = dayVisits.find(v => v.id === vid)
                  if (visitor && ersMembersRecord) {
                    handleErsAddParticipant({ id: visitor.id, nickname: visitor.nickname, name: visitor.nickname, member_type: visitor.member_type, remaining: -1 })
                  }
                  setDraggingVisitorId(null)
                }}
              >
                <div className="text-[12px] text-[#8f959e]">情绪释放 · {ersMembersRecord.date}</div>

                <div className="border border-[#e8e8e8] rounded-lg bg-white">
                  <div className="px-3 py-2 border-b border-[#f0f0f0]">
                    <span className="text-[12px] font-medium text-[#2b2f36]">人员配置</span>
                  </div>

                  <div className="px-3 py-2.5 space-y-2.5">
                    {/* 主持人 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-[#4e535a] shrink-0">主持人</span>
                      {ersMembersRecord.host_id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Badge variant="secondary" className="text-[12px] font-normal">{ersMembersRecord.host_name || getMemberName(ersMembersRecord.host_id)}</Badge>
                          <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={handleErsMemberRemoveHost}>
                            <X className="h-2.5 w-2.5 text-[#8f959e]" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 relative" ref={ersMemberHostDropdownRef}>
                          <Input
                            value={ersMemberHostSearchKeyword}
                            onChange={(e) => handleErsMemberHostSearch(e.target.value)}
                            placeholder="选择主持人"
                            className="h-7 text-[12px]"
                          />
                          {ersMemberHostShowDropdown && ersMemberHostSearchResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                              {ersMemberHostSearchResults.map((c) => c.remaining === 0 ? (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                </div>
                              ) : (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleErsMemberSetHost(c)}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 参与者 */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[12px] text-[#4e535a] shrink-0">参与者</span>
                        <div className="flex-1 relative min-w-0" ref={ersMemberDropdownRef}>
                        <Input
                          value={ersMemberSearchKeyword}
                          onChange={(e) => handleErsMemberSearch(e.target.value)}
                          placeholder="搜索添加组员"
                          className="h-7 text-[12px]"
                        />
                        {ersMemberShowDropdown && ersMemberSearchResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                            {ersMemberSearchResults.map((c) => c.remaining === 0 ? (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                              </div>
                            ) : (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleErsAddParticipant(c)}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                      {(ersMembersRecord.participant_ids || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-[42px]">
                          {ersMembersRecord.participant_ids.map((id) => (
                            <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                              {getMemberName(id)}
                              <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleErsRemoveParticipant(id)}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button size="sm" className="h-8 text-xs px-5" onClick={() => setErsMembersDialogOpen(false)}>确定</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>}

      {/* 觉醒游戏 删除确认 */}
      <AlertDialog open={!!gcsDeleteId} onOpenChange={(open) => !open && setGcsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除觉醒游戏</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条觉醒游戏吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleGcsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 情绪释放 删除确认 */}
      <AlertDialog open={!!ersDeleteId} onOpenChange={(open) => !open && setErsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除情绪释放</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条情绪释放记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleErsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 能量结 删除确认 */}
      <AlertDialog open={!!eksDeleteId} onOpenChange={(open) => !open && setEksDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除能量结</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条能量结记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleEksDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ===== 内部课程 新增/编辑弹窗 ===== */}
      <Dialog open={icsDialogOpen} onOpenChange={setIcsDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{icsEditingRecord ? "编辑内部课程" : "新增内部课程"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={icsFormDate} onChange={(e) => setIcsFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={icsFormStartTime} onChange={(e) => setIcsFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={icsFormEndTime} onChange={(e) => setIcsFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程类型</span>
              <SelectDropdown
                value={icsFormCourseType}
                options={[{value: "", label: "选择类型"}, ...ICS_COURSE_TYPES.map(t => ({value: t, label: t}))]}
                placeholder="选择类型"
                onChange={(v) => setIcsFormCourseType(v)}
              />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <Input value={icsFormCourseName} onChange={(e) => setIcsFormCourseName(e.target.value)} placeholder="输入课程名称" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="relative" ref={icsDropdownRef}>
                {icsSearchField === "host" ? (
                  <Input
                    value={icsSearchKeyword}
                    onChange={(e) => handleIcsSearch(e.target.value)}
                    placeholder="搜索课程老师..."
                    className="h-8 text-xs"
                    autoFocus
                    onBlur={() => { setTimeout(() => { setIcsSearchField(null); setIcsShowDropdown(false) }, 200) }}
                  />
                ) : (
                  <div
                    className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                    onClick={() => { setIcsSearchField("host"); setIcsSearchKeyword(icsFormHostName); setIcsSearchResults([]); setIcsShowDropdown(false); if (icsFormHostName) handleIcsSearch(icsFormHostName) }}
                  >
                    <span className={icsFormHostId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                      {icsFormHostName || "选择课程老师"}
                    </span>
                  </div>
                )}
                {icsShowDropdown && icsSearchField === "host" && icsSearchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                    {icsSearchResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleIcsSelectHost(c)}>
                        <span>{c.nickname || c.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程介绍</span>
              <textarea
                value={icsFormDescription}
                onChange={(e) => setIcsFormDescription(e.target.value)}
                placeholder="输入课程介绍..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setIcsDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleIcsSave} disabled={icsSaving || !icsFormCourseName}>
                {icsSaving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 内部课程 资料弹窗 */}
      <Dialog open={icsMaterialsDialogOpen} onOpenChange={setIcsMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] text-[#4e535a]">已上传 {icsMaterialsRecord?.materials?.length || 0} 个文件</span>
              <label className="cursor-pointer">
                <input type="file" className="hidden" onChange={handleIcsUploadMaterial} />
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={icsUploading}>
                  {icsUploading ? "上传中..." : "上传文件"}
                </Button>
              </label>
            </div>
            {(icsMaterialsRecord?.materials || []).length === 0 ? (
              <p className="text-[12px] text-muted-foreground text-center py-8">暂无资料</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {icsMaterialsRecord!.materials.map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded border">
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#3370ff] hover:underline truncate flex-1">{m.name || m.url.split("/").pop()}</a>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => handleIcsDeleteMaterial(m.url.split("/").pop() || "")}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 内部课程 成员弹窗 */}
      <Dialog open={icsMembersDialogOpen} onOpenChange={setIcsMembersDialogOpen}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">成员管理</DialogTitle>
          </DialogHeader>
          {icsMembersRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = icsMembersRecord.participant_ids?.includes(v.id) || (icsMembersRecord.host_names || []).includes(v.nickname)
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => setDraggingVisitorId(null)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：成员管理 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const vid = draggingVisitorId
                  if (!vid) return
                  const visitor = dayVisits.find(v => v.id === vid)
                  if (visitor && icsMembersRecord) {
                    const customer = allCustomers.find(c => c.id === vid)
                    if (customer) handleIcsAddParticipant(customer)
                  }
                  setDraggingVisitorId(null)
                }}
              >
                {/* 课程老师 */}
                <div>
                  <span className="text-[12px] text-[#4e535a] mb-1.5 block">课程老师</span>
                  {icsMembersRecord.host_names?.length ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] font-medium">{icsMembersRecord.host_names[0]}</span>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">暂无</span>
                  )}
                </div>

                {/* 参与者 */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[12px] text-[#4e535a] shrink-0">参与者</span>
                    <div className="flex-1 relative" ref={icsMemberDropdownRef}>
                      <Input
                        value={icsMemberSearchKeyword}
                        onChange={(e) => handleIcsMemberSearch(e.target.value)}
                        placeholder="搜索添加参与者"
                        className="h-7 text-[12px]"
                      />
                      {icsMemberShowDropdown && icsMemberSearchResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                          {icsMemberSearchResults.map((c) => (
                            <div key={c.id} className="flex items-center px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleIcsAddParticipant(c)}>
                              <span>{c.nickname || c.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  {(icsMembersRecord.participant_ids || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 ml-[42px]">
                      {icsMembersRecord.participant_ids.map((id) => (
                        <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                          {getMemberName(id)}
                          <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleIcsRemoveParticipant(id)}>
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 内部课程 删除确认 */}
      <AlertDialog open={!!icsDeleteId} onOpenChange={(open) => !open && setIcsDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除内部课程</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条内部课程记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleIcsDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* 到场确认弹窗 */}
      <Dialog open={arrivalDialogOpen} onOpenChange={setArrivalDialogOpen}>
        <DialogContent className="max-w-sm p-6">
          <DialogHeader>
            <DialogTitle>确认到场</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
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
                    const visits = await visitApi.list(detailDate)
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

      </div>
    </div>
  )
}
