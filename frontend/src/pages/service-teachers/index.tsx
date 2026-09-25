import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { Download } from "lucide-react"
import ExcelJS from "exceljs"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  currentFeedbackPersonName,
  FeedbackPersonSelect,
  feedbackPersonValue,
  type FeedbackPersonOption,
} from "@/components/visits/feedback-person-select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { usePagination } from "@/hooks/use-pagination"
import {
  serviceTeacherCustomerApi,
  statisticsApi,
  customerFollowUpApi,
  type CourseParticipantNoteEntry,
  type CourseParticipantGroup,
  type CourseParticipantRow,
  type CourseStatistics,
  type ServiceTeacherCustomerItem,
  type ServiceTeacherCustomerSummary,
  type ServiceTeacherFollowUpDefinition,
  type ServiceTeacherFollowUpFilter,
} from "@/lib/api"
import DetailView from "@/pages/healing-records/components/detail-view"

const PAGE_SIZE = 20
const COURSE_PAGE_SIZE = 10
const DEFAULT_ACTIVITY_TYPES = [
  { value: "class", label: "沙龙活动" },
  { value: "gcs", label: "觉醒游戏" },
  { value: "ers", label: "情绪释放" },
  { value: "eks", label: "能量结" },
  { value: "ics", label: "内部课程" },
]
type ServiceTeacherTab = "courses" | "follow-ups"
type CourseViewTab = "courses" | "reviews" | "participants"

const EMPTY_ID_LIST: string[] = []
type CourseRangePreset = "today" | "week" | "month" | "year" | "all" | "custom"
type CourseRow = CourseStatistics["courses"][number]
/** 参与者卡片的列宽（列标题和每张卡片共用，保证上下对齐） */
const PARTICIPANT_COLUMNS = [
  { key: "nickname", label: "昵称", width: "10%" },
  { key: "identity", label: "身份", width: "9%" },
  { key: "same_count", label: "同类活动参与数", width: "11%" },
  { key: "visit_need", label: "当天的来访需求", width: "23%" },
  { key: "customer_info", label: "客户信息", width: "23%" },
  { key: "follow_up", label: "跟进点", width: "24%" },
]
const COURSE_VIEW_TABS: Array<{ key: CourseViewTab; label: string }> = [
  { key: "courses", label: "课程记录" },
  { key: "participants", label: "参与者" },
  { key: "reviews", label: "复盘记录" },
]
const COURSE_RANGE_PRESETS: Array<{ value: Exclude<CourseRangePreset, "custom">; label: string }> = [
  { value: "today", label: "当天" },
  { value: "week", label: "本周" },
  { value: "month", label: "本月" },
  { value: "year", label: "本年" },
  { value: "all", label: "全部" },
]

function currentOwner(): string {
  try {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
    return String(currentUser.owner || currentUser.username || "").trim()
  } catch {
    return ""
  }
}

function formatDateTime(value: string): string {
  if (!value) return ""
  return new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replaceAll("/", "-")
}

function daysSince(value: string): string {
  if (!value) return "从未跟进"
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const days = Math.floor(elapsed / 86_400_000)
  if (days === 0) return "今天"
  return `${days} 天前`
}

function formatDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-")
}

function coursePresetRange(preset: Exclude<CourseRangePreset, "custom">) {
  const to = new Date()
  if (preset === "all") return { from: "", to: "" }
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate())
  if (preset === "week") from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  if (preset === "month") from.setDate(1)
  if (preset === "year") from.setMonth(0, 1)
  return { from: formatDate(from), to: formatDate(to) }
}

function initialCourseRange() {
  return coursePresetRange("month")
}

function formatCourseTime(course: CourseRow): string {
  if (!course.start_time) return ""
  return `${course.start_time}${course.end_time ? `~${course.end_time}` : ""}`
}

function courseParticipantNames(course: CourseRow, group: "new" | "old"): string {
  return course.participants
    .filter(participant => group === "new"
      ? participant.identity_group === "新人"
      : participant.identity_group !== "新人")
    .map(participant => participant.nickname)
    .filter(Boolean)
    .join("、")
}

function EmptyDash() {
  return <span className="text-[#d0d3d6]">-</span>
}

function NoteContent({ author, content, expanded }: { author: string; content: string; expanded: boolean }) {
  if (!content) return <EmptyDash />
  return (
    <div className={`flex min-w-0 items-baseline gap-2 ${expanded ? "leading-5" : "overflow-hidden"}`}>
      <span className="max-w-[145px] shrink-0 truncate text-[12px] text-[#8f959e]" title={author}>{author}</span>
      <span
        className={expanded
          ? "min-w-0 whitespace-pre-wrap break-words text-[#4e535a]"
          : "min-w-0 flex-1 truncate text-[#4e535a]"}
        title={expanded ? undefined : content}
      >
        {content}
      </span>
    </div>
  )
}

/**
 * 参与者备注：同一条备注可能是不同人分别填写的，按填写人逐行展示。
 * 单人填写的保留三行预览，多人填写的每人最多两行，超过三条时提示剩余条数。
 */
function ParticipantNoteLines({
  entries,
  fallback,
  expanded,
}: {
  entries: CourseParticipantNoteEntry[]
  fallback: string
  expanded?: boolean
}) {
  const list = entries.length > 0 ? entries : (fallback ? [{ author: "", content: fallback, at: "" }] : [])
  if (list.length === 0) return null
  if (expanded) {
    return (
      <div className="space-y-1.5">
        {list.map((entry, index) => (
          <div key={`${entry.author}-${index}`} className="border-b border-[#eceef0] pb-1.5 last:border-b-0 last:pb-0">
            <div className="flex min-w-0 items-baseline gap-2">
              {entry.author && <span className="min-w-0 flex-1 truncate text-[12px] text-[#8f959e]" title={entry.author}>{entry.author}</span>}
              <span className="ml-auto flex shrink-0 items-center gap-2 text-right text-[11px] text-[#8f959e]">
                {entry.at && <span className="tabular-nums">{formatDateTime(entry.at)}</span>}
                {entry.created_by && <span className="max-w-[145px] truncate" title={`创建人：${entry.created_by}`}>创建人：{entry.created_by}</span>}
              </span>
            </div>
            <div className="mt-0.5 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#4e535a]">{entry.content}</div>
          </div>
        ))}
      </div>
    )
  }
  const visible = list.slice(0, 3)
  const lineClamp = list.length > 1 ? 2 : 3
  return (
    <div className="space-y-0.5">
      {visible.map((entry, index) => (
        <div key={`${entry.author}-${index}`} className="flex min-w-0 items-baseline gap-2">
          {entry.author && (
            <span className="max-w-[120px] shrink-0 truncate text-[12px] text-[#8f959e]" title={entry.author}>{entry.author}</span>
          )}
          <span
            className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-[#4e535a] group-hover:text-[#3370ff]"
            style={{ display: "-webkit-box", WebkitLineClamp: lineClamp, WebkitBoxOrient: "vertical", overflow: "hidden" }}
            title={entry.content}
          >
            {entry.content}
          </span>
        </div>
      ))}
      {list.length > visible.length && (
        <div className="text-[11px] text-[#9aa1a9]">还有 {list.length - visible.length} 条，点击查看全部</div>
      )}
    </div>
  )
}

export default function ServiceTeachersPage() {
  return <ServiceTeacherRecords mode="follow-ups" />
}

export function ServiceTeacherRecords({ mode }: { mode: ServiceTeacherTab }) {
  const initialRange = useMemo(initialCourseRange, [])
  const activeTab = mode
  const [teacher, setTeacher] = useState(currentOwner)
  const [teacherNames, setTeacherNames] = useState<string[]>([])
  const [teacherOptions, setTeacherOptions] = useState<Array<{ name: string; customer_id: string }>>([])
  const [courseTeacherId, setCourseTeacherId] = useState("")
  const [metadataLoaded, setMetadataLoaded] = useState(false)
  const [followUpFilter, setFollowUpFilter] = useState<ServiceTeacherFollowUpFilter>("inactive")
  const [followUpDays, setFollowUpDays] = useState(30)
  const [followUpDaysInput, setFollowUpDaysInput] = useState("30")
  const [includeCustomerInfo, setIncludeCustomerInfo] = useState(false)
  const [includeFollowUp, setIncludeFollowUp] = useState(true)
  const [followUpContentExpanded, setFollowUpContentExpanded] = useState(false)
  const [followUpExporting, setFollowUpExporting] = useState(false)
  const [followUpExportError, setFollowUpExportError] = useState("")
  const [summary, setSummary] = useState<ServiceTeacherCustomerSummary>({ total: 0, active: 0, inactive: 0, active_30: 0, inactive_30: 0 })
  const [metadataError, setMetadataError] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [courseDateFrom, setCourseDateFrom] = useState(initialRange.from)
  const [courseDateTo, setCourseDateTo] = useState(initialRange.to)
  const [courseRangePreset, setCourseRangePreset] = useState<CourseRangePreset>("month")
  const [courseActivityType, setCourseActivityType] = useState("all")
  const showCourseOwner = !["class", "ics"].includes(courseActivityType)
  const showCourseBodyParts = courseActivityType === "all" || courseActivityType === "eks"
  const [courseData, setCourseData] = useState<CourseStatistics | null>(null)
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseError, setCourseError] = useState("")
  const [courseExporting, setCourseExporting] = useState(false)
  const [courseViewTab, setCourseViewTab] = useState<CourseViewTab>("courses")
  const [reviewContentExpanded, setReviewContentExpanded] = useState(false)
  // 复盘记录里真正被截断的行（按渲染宽度测量，不靠字数猜）；只有这些行会被「展开」撑开
  const [truncatedReviewIds, setTruncatedReviewIds] = useState<string[]>([])
  const reviewRowRefs = useRef<Record<string, HTMLTableRowElement | null>>({})
  const [reviewMeasureTick, setReviewMeasureTick] = useState(0)
  // 「参与者」页签：自己课程的全部参与者 + 当天的来访需求/客户信息/跟进点（可以填自己那份）
  const [participantGroups, setParticipantGroups] = useState<CourseParticipantGroup[]>([])
  const [participantTotalParticipants, setParticipantTotalParticipants] = useState(0)
  const [participantTotal, setParticipantTotal] = useState(0)
  const [participantTotalPages, setParticipantTotalPages] = useState(1)
  const [participantPage, setParticipantPage] = useState(1)
  const [participantLoading, setParticipantLoading] = useState(false)
  const [participantKeyword, setParticipantKeyword] = useState("")
  const [participantSearchKeyword, setParticipantSearchKeyword] = useState("")
  const [participantMemberType, setParticipantMemberType] = useState("")
  const [participantIdentityGroup, setParticipantIdentityGroup] = useState("")
  const [participantMemberTypes, setParticipantMemberTypes] = useState<string[]>([])
  const [participantEditing, setParticipantEditing] = useState<{
    row: CourseParticipantRow
    field: "visit_need" | "customer_info" | "follow_up"
  } | null>(null)
  const [participantDraft, setParticipantDraft] = useState("")
  const [participantMyNoteId, setParticipantMyNoteId] = useState("")
  const [participantFeedbackPeople, setParticipantFeedbackPeople] = useState<FeedbackPersonOption[]>([])
  const [participantFeedbackPerson, setParticipantFeedbackPerson] = useState("")
  const [participantEditorLoading, setParticipantEditorLoading] = useState(false)
  const [participantEditorError, setParticipantEditorError] = useState("")
  const [participantEditorReadFailed, setParticipantEditorReadFailed] = useState(false)
  const [participantSaving, setParticipantSaving] = useState(false)

  const followUpDefinition: ServiceTeacherFollowUpDefinition = includeCustomerInfo && includeFollowUp
    ? "both"
    : includeCustomerInfo ? "customer_info" : includeFollowUp ? "follow_up" : "none"

  useEffect(() => {
    serviceTeacherCustomerApi.metadata(mode === "courses")
      .then(metadata => {
        setTeacherNames(metadata.teachers)
        setTeacherOptions(metadata.teacher_options || [])
        if (mode === "courses") {
          const selected = metadata.teacher_options[0]
          setCourseTeacherId(selected?.customer_id || "")
          setTeacher(selected?.name || "")
        } else setTeacher(current => current || metadata.current_teacher)
        setMetadataLoaded(true)
      })
      .catch(error => {
        setMetadataError(error instanceof Error ? error.message : "服务老师列表加载失败")
        setMetadataLoaded(true)
      })
  }, [mode])

  const fetchCustomers = useCallback(async (page: number, pageSize: number) => {
    if (mode === "courses") return { items: [], total: 0, page: 1, page_size: pageSize, total_pages: 1 }
    const result = await serviceTeacherCustomerApi.list({
      service_teacher: teacher,
      follow_up_filter: followUpFilter,
      follow_up_definition: followUpDefinition,
      follow_up_days: followUpDays,
      page,
      page_size: pageSize,
    })
    setSummary(result.summary)
    return result
  }, [mode, followUpDays, followUpDefinition, followUpFilter, teacher])

  const pagination = useServerPagination<ServiceTeacherCustomerItem>(fetchCustomers, { pageSize: PAGE_SIZE })

  useEffect(() => {
    pagination.resetPage()
  }, [teacher, followUpDays, followUpDefinition, followUpFilter, pagination.resetPage])

  const teacherSelectOptions = useMemo(() => {
    if (mode === "courses") return teacherOptions.map(option => ({ value: option.customer_id, label: option.name }))
    const names = new Set(teacherNames)
    if (teacher) names.add(teacher)
    return [...names].map(name => ({ value: name, label: name }))
  }, [mode, teacherOptions, teacher, teacherNames])

  const selectedTeacherId = useMemo(
    () => mode === "courses" ? courseTeacherId : teacherOptions.find(option => option.name === teacher)?.customer_id || "",
    [mode, courseTeacherId, teacher, teacherOptions],
  )

  useEffect(() => {
    if (!metadataLoaded || activeTab !== "courses" || !teacher || !selectedTeacherId) {
      setCourseData(null)
      setCourseLoading(false)
      setCourseError("")
      return
    }
    let active = true
    setCourseLoading(true)
    setCourseError("")
    statisticsApi.courses({
      date_from: courseDateFrom,
      date_to: courseDateTo,
      all_dates: courseRangePreset === "all",
      granularity: "day",
      activity_type: courseActivityType,
      teacher_id: selectedTeacherId,
    }).then(result => {
      if (active) setCourseData(result)
    }).catch(error => {
      if (active) setCourseError(error instanceof Error ? error.message : "课程记录加载失败")
    }).finally(() => {
      if (active) setCourseLoading(false)
    })
    return () => { active = false }
  }, [activeTab, courseActivityType, courseDateFrom, courseDateTo, courseRangePreset, metadataLoaded, selectedTeacherId, teacher])

  const courseRows = useMemo(() => courseData?.courses || [], [courseData?.courses])
  const coursePagination = usePagination(courseRows, { pageSize: COURSE_PAGE_SIZE })
  const reviewRows = useMemo(
    () => courseRows.filter(course => (course.course_review || "").trim()),
    [courseRows],
  )
  // 表格列宽变化时重新测量
  useEffect(() => {
    const onResize = () => setReviewMeasureTick(current => current + 1)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const reviewPagination = usePagination(reviewRows, { pageSize: COURSE_PAGE_SIZE })
  const activeCoursePagination = courseViewTab === "reviews" ? reviewPagination : coursePagination

  // 折叠状态下测量：内容宽度超过可视宽度就算这条需要展开；展开中的行沿用上一次判定
  useLayoutEffect(() => {
    if (courseViewTab !== "reviews") return
    setTruncatedReviewIds(previous => {
      const isExpanded = () => reviewContentExpanded
      const next = previous.filter(isExpanded)
      for (const [id, row] of Object.entries(reviewRowRefs.current)) {
        if (!row || isExpanded()) continue
        const clamped = Array.from(row.querySelectorAll<HTMLElement>("[data-clamp]"))
        if (clamped.some(node => node.scrollWidth > node.clientWidth + 1)) next.push(id)
      }
      const same = next.length === previous.length && next.every(id => previous.includes(id))
      return same ? previous : next
    })
  }, [reviewPagination.paginatedItems, reviewContentExpanded, courseViewTab, reviewMeasureTick])

  const courseListTitle = courseViewTab === "reviews" ? "复盘记录" : courseViewTab === "participants" ? "参与者" : "课程列表"
  const courseListCount = courseViewTab === "reviews" ? reviewRows.length : courseViewTab === "participants" ? participantTotal : courseRows.length
  const courseListUnit = courseViewTab === "reviews" ? "条" : courseViewTab === "participants" ? "人" : "场"

  // 「参与者」页签：跟着课程筛选（时间/课程类型/老师）走，外加昵称、客户身份、新人老人三个筛选
  const loadParticipants = useCallback((nextPage = 1, keyword = participantSearchKeyword) => {
    if (!selectedTeacherId) { setParticipantGroups([]); setParticipantTotal(0); setParticipantTotalParticipants(0); return }
    setParticipantLoading(true)
    serviceTeacherCustomerApi.courseParticipants({
      teacher_id: selectedTeacherId,
      date_from: courseDateFrom,
      date_to: courseDateTo,
      all_dates: courseRangePreset === "all",
      activity_type: courseActivityType,
      keyword,
      member_type: participantMemberType,
      identity_group: participantIdentityGroup,
      page: nextPage,
      page_size: PAGE_SIZE,
    }).then(result => {
      setParticipantGroups(result.items || [])
      setParticipantTotal(result.total || 0)
      setParticipantTotalParticipants(result.total_participants || 0)
      setParticipantTotalPages(result.total_pages || 1)
      setParticipantPage(result.page || nextPage)
      setParticipantMemberTypes(result.member_types || [])
    }).catch(() => {
      setParticipantGroups([]); setParticipantTotal(0); setParticipantTotalParticipants(0); setParticipantTotalPages(1)
    }).finally(() => setParticipantLoading(false))
  }, [selectedTeacherId, courseDateFrom, courseDateTo, courseRangePreset, courseActivityType, participantMemberType, participantIdentityGroup, participantSearchKeyword])

  useEffect(() => {
    if (courseViewTab !== "participants") return
    loadParticipants(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseViewTab, selectedTeacherId, courseDateFrom, courseDateTo, courseRangePreset, courseActivityType, participantMemberType, participantIdentityGroup, participantSearchKeyword])

  // 搜索框输入即查（防抖），不需要再点「查询」
  useEffect(() => {
    const timer = setTimeout(() => setParticipantSearchKeyword(participantKeyword.trim()), 300)
    return () => clearTimeout(timer)
  }, [participantKeyword])

  const openParticipantEditor = async (row: CourseParticipantRow, field: "visit_need" | "customer_info" | "follow_up") => {
    setParticipantEditing({ row, field })
    setParticipantMyNoteId("")
    setParticipantDraft("")
    setParticipantEditorError("")
    setParticipantEditorReadFailed(false)
    setParticipantEditorLoading(true)
    const currentName = currentFeedbackPersonName()
    setParticipantFeedbackPeople(currentName ? [{ customer_id: "", name: currentName }] : [])
    setParticipantFeedbackPerson(currentName ? `name:${currentName}` : "")
    if (!row.visit_id) {
      setParticipantEditorError("该参与者没有关联邀约，无法填写")
      setParticipantEditorReadFailed(true)
      setParticipantEditorLoading(false)
      return
    }
    try {
      const [mineResult, peopleResult] = await Promise.allSettled([
        customerFollowUpApi.myNote(row.visit_id, field),
        customerFollowUpApi.feedbackPeople(),
      ])
      if (mineResult.status !== "fulfilled") {
        setParticipantEditorError("读取已有记录失败，请关闭后重试")
        setParticipantEditorReadFailed(true)
        return
      }
      const mine = mineResult.value
      const people = peopleResult.status === "fulfilled"
        ? peopleResult.value
        : { current_person: { customer_id: "", name: currentName }, options: currentName ? [{ customer_id: "", name: currentName }] : [] }
      const selected: FeedbackPersonOption = mine
        ? { customer_id: mine.feedback_person_id || "", name: mine.feedback_person || mine.created_by || currentName }
        : people.current_person
      const options = [...people.options]
      if (selected.name && !options.some(option => feedbackPersonValue(option) === feedbackPersonValue(selected))) options.unshift(selected)
      setParticipantMyNoteId(mine?.id || "")
      setParticipantDraft(mine?.content || "")
      setParticipantFeedbackPeople(options)
      setParticipantFeedbackPerson(selected.name ? feedbackPersonValue(selected) : "")
    } finally {
      setParticipantEditorLoading(false)
    }
  }

  const saveParticipantNote = async () => {
    if (!participantEditing || participantEditorLoading || participantEditorReadFailed) return
    const content = participantDraft.trim()
    if (!content) return
    const person = participantFeedbackPeople.find(option => feedbackPersonValue(option) === participantFeedbackPerson)
    const attribution = person ? { id: person.customer_id, name: person.name } : undefined
    setParticipantSaving(true)
    setParticipantEditorError("")
    try {
      const { row, field } = participantEditing
      if (participantMyNoteId) await customerFollowUpApi.update(participantMyNoteId, content, attribution)
      else await customerFollowUpApi.create(row.visit_id, field, content, attribution)
      setParticipantEditing(null)
      loadParticipants(participantPage)
    } catch (error) {
      setParticipantEditorError(error instanceof Error ? error.message : "保存失败，请重试")
    } finally {
      setParticipantSaving(false)
    }
  }

  useEffect(() => {
    coursePagination.goToPage(1)
    reviewPagination.goToPage(1)
  }, [courseActivityType, courseDateFrom, courseDateTo, selectedTeacherId])

  const courseSummary = useMemo(() => (courseData?.statistics || []).reduce(
    (result, item) => ({
      courseCount: result.courseCount + item.course_count,
      classHours: result.classHours + item.class_hours,
      participantCount: result.participantCount + item.participant_count,
      ownerCount: result.ownerCount + (item.owner_count || 0),
    }),
    { courseCount: 0, classHours: 0, participantCount: 0, ownerCount: 0 },
  ), [courseData?.statistics])

  // 服务总人次 = 案主人次 + 参与人次
  const serviceVisitCount = courseSummary.ownerCount + courseSummary.participantCount

  const applyCourseRangePreset = (preset: Exclude<CourseRangePreset, "custom">) => {
    const range = coursePresetRange(preset)
    setCourseRangePreset(preset)
    setCourseDateFrom(range.from)
    setCourseDateTo(range.to)
  }

  const followUpDefinitionLabel = followUpDefinition === "both"
    ? "客户信息、跟进点"
    : followUpDefinition === "customer_info" ? "客户信息" : followUpDefinition === "follow_up" ? "跟进点" : "客户信息或跟进点最近一项"

  const toggleFollowUpDefinition = (definition: "customer_info" | "follow_up", checked: boolean) => {
    if (definition === "customer_info") {
      setIncludeCustomerInfo(checked)
      return
    }
    setIncludeFollowUp(checked)
  }

  const commitFollowUpDays = () => {
    const nextDays = Math.min(3650, Math.max(1, Number.parseInt(followUpDaysInput, 10) || 30))
    setFollowUpDaysInput(String(nextDays))
    setFollowUpDays(nextDays)
  }

  const exportCourseRecords = async () => {
    if (!teacher || courseExporting || courseRows.length === 0) return
    setCourseExporting(true)
    try {
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("课程记录", { views: [{ showGridLines: false }] })
      worksheet.columns = [
        { header: "上课日期", key: "date", width: 14 },
        { header: "上课时间", key: "time", width: 18 },
        { header: "课程", key: "name", width: 30 },
        { header: "课程类型", key: "activityType", width: 16 },
        { header: "课时", key: "classHours", width: 10 },
        { header: "老师/成就君", key: "teachers", width: 24 },
        ...(showCourseOwner ? [{ header: "案主", key: "owner", width: 20 }] : []),
        ...(showCourseBodyParts ? [{ header: "部位数", key: "bodyParts", width: 12 }] : []),
        { header: "参与人数", key: "participantCount", width: 12 },
        { header: "新人名单", key: "newNames", width: 32 },
        { header: "老人名单", key: "oldNames", width: 32 },
      ]
      courseRows.forEach(course => worksheet.addRow({
        date: course.date || "-",
        time: formatCourseTime(course) || "-",
        name: course.name || "-",
        activityType: course.activity_type_label || "-",
        classHours: course.class_hours,
        teachers: course.teachers.join("、") || "-",
        owner: course.owner_name || "-",
        bodyParts: course.body_part_count ?? "-",
        participantCount: course.participant_count,
        newNames: courseParticipantNames(course, "new") || "-",
        oldNames: courseParticipantNames(course, "old") || "-",
      }))
      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FF4E535A" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F8FA" } }
        cell.alignment = { vertical: "middle" }
      })
      worksheet.eachRow((row, rowNumber) => {
        row.height = rowNumber === 1 ? 24 : 34
        if (rowNumber > 1) {
          row.eachCell(cell => {
            cell.alignment = { vertical: "middle", wrapText: true }
          })
        }
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      const rangeLabel = courseRangePreset === "all" ? "全部时间" : `${courseDateFrom} 至 ${courseDateTo}`
      anchor.download = `服务老师课程记录_${teacher.replace(/[\\/:*?"<>|]/g, "-")}_${courseRangePreset === "all" ? "全部" : `${courseDateFrom}_${courseDateTo}`}.xlsx`
      await serviceTeacherCustomerApi.recordExport(`课程记录；老师 ${teacher}；课程类型 ${courseData?.activity_types.find(item => item.value === courseActivityType)?.label || "全部课程"}；${rangeLabel}；共${courseRows.length}场`, true)
      anchor.click()
      URL.revokeObjectURL(url)
    } finally {
      setCourseExporting(false)
    }
  }

  const exportFollowUpRecords = async () => {
    if (!teacher || followUpExporting) return
    setFollowUpExporting(true)
    setFollowUpExportError("")
    try {
      const rows: ServiceTeacherCustomerItem[] = []
      let page = 1
      let totalPages = 1
      do {
        const result = await serviceTeacherCustomerApi.list({
          service_teacher: teacher,
          follow_up_filter: followUpFilter,
          follow_up_definition: followUpDefinition,
          follow_up_days: followUpDays,
          page,
          page_size: 100,
        })
        rows.push(...result.items)
        totalPages = result.total_pages
        page += 1
      } while (page <= totalPages)

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("跟进记录", { views: [{ showGridLines: false }] })
      worksheet.columns = [
        { header: "服务老师", key: "teacher", width: 14 },
        { header: "客户昵称", key: "nickname", width: 16 },
        { header: "会员身份", key: "memberType", width: 16 },
        { header: "跟进阶段", key: "followUpStatus", width: 16 },
        { header: "最近客户信息", key: "customerInfo", width: 42 },
        { header: "客户信息反馈人", key: "customerInfoBy", width: 16 },
        { header: "客户信息创建人", key: "customerInfoCreatedBy", width: 16 },
        { header: "客户信息录入时间", key: "customerInfoAt", width: 22 },
        { header: "最近跟进点", key: "followUp", width: 42 },
        { header: "跟进点反馈人", key: "followUpBy", width: 16 },
        { header: "跟进点创建人", key: "followUpCreatedBy", width: 16 },
        { header: "跟进点录入时间", key: "followUpAt", width: 22 },
        { header: "包含内容", key: "definition", width: 22 },
        { header: "当前状态", key: "status", width: 18 },
      ]
      rows.forEach(item => worksheet.addRow({
        teacher,
        nickname: item.nickname || item.name || "-",
        memberType: item.member_type || "-",
        followUpStatus: item.follow_up_status || "-",
        customerInfo: item.latest_customer_info_content || "-",
        customerInfoBy: item.latest_customer_info_by || "-",
        customerInfoCreatedBy: item.latest_customer_info_created_by || "-",
        customerInfoAt: item.latest_customer_info_at ? formatDateTime(item.latest_customer_info_at) : "-",
        followUp: item.latest_follow_up_content || "-",
        followUpBy: item.latest_follow_up_by || "-",
        followUpCreatedBy: item.latest_follow_up_created_by || "-",
        followUpAt: item.latest_follow_up_at ? formatDateTime(item.latest_follow_up_at) : "-",
        definition: followUpDefinitionLabel,
        status: item.is_active ? `近${followUpDays}天已录入` : `近${followUpDays}天未录入`,
      }))
      worksheet.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FF4E535A" } }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7F8FA" } }
        cell.alignment = { vertical: "middle" }
      })
      worksheet.eachRow((row, rowNumber) => {
        row.height = rowNumber === 1 ? 24 : 34
        if (rowNumber > 1) {
          row.eachCell(cell => {
            cell.alignment = { vertical: "middle", wrapText: true }
          })
        }
      })
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = url
      anchor.download = `服务老师跟进记录_${teacher.replace(/[\\/:*?"<>|]/g, "-")}_${formatDate(new Date())}.xlsx`
      await serviceTeacherCustomerApi.recordExport(`跟进记录；老师 ${teacher}；包含 ${followUpDefinitionLabel}；${followUpFilter === "all" ? "全部客户" : followUpFilter === "active" ? `近${followUpDays}天已录入` : `近${followUpDays}天未录入`}；共${rows.length}人`)
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setFollowUpExportError(error instanceof Error ? error.message : "导出失败，请稍后重试")
    } finally {
      setFollowUpExporting(false)
    }
  }

  type SummarySub = { label: string; value: number; unit: string }
  const summaryItems: Array<{ label: string; value: number; unit: string; hint?: string; subs?: SummarySub[] }> = activeTab === "courses"
    ? [
        { label: "课程数", value: courseSummary.courseCount, unit: "场", hint: "所选时间范围" },
        { label: "课时数", value: courseSummary.classHours, unit: "课时", hint: "按课程扣卡规则统计" },
        {
          label: "服务总人次",
          value: serviceVisitCount,
          unit: "人次",
          subs: [
            { label: "案主人次", value: courseSummary.ownerCount, unit: "人次" },
            { label: "参与人次", value: courseSummary.participantCount, unit: "人次" },
          ],
        },
      ]
    : [
        { label: "负责客户", value: summary.total, unit: "人", hint: "当前服务老师" },
        {
          label: followUpDefinition === "both" ? `近 ${followUpDays} 天两项均已录入` : followUpDefinition === "none" ? `近 ${followUpDays} 天有任一录入` : `近 ${followUpDays} 天已录入${followUpDefinitionLabel}`,
          value: summary.active,
          unit: "人",
          hint: "按当前包含内容",
        },
        {
          label: followUpDefinition === "both" ? `近 ${followUpDays} 天存在未录入` : followUpDefinition === "none" ? `近 ${followUpDays} 天无任何录入` : `近 ${followUpDays} 天未录入${followUpDefinitionLabel}`,
          value: summary.inactive,
          unit: "人",
          hint: `包含从未录入和超过 ${followUpDays} 天未录入`,
        },
      ]

  return (
    <div className="flex min-h-full min-w-0 max-w-full flex-col gap-3 overflow-x-hidden bg-[#f4f5f6] p-4">
      {activeTab === "courses" ? (
        <div className="flex h-[52px] items-center rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
          <div className="flex h-full min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {COURSE_VIEW_TABS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCourseViewTab(tab.key)}
                className={`relative flex h-full shrink-0 items-center whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${courseViewTab === tab.key ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
              >
                {tab.label}
                {courseViewTab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[52px] flex-wrap items-center gap-2 rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
          <span className="whitespace-nowrap text-[15px] font-medium text-[#212631]">服务老师</span>
          <span className="ml-2.5 whitespace-nowrap text-[11.5px] text-[#a8b1bd]">跟进服务老师名下客户的录入情况</span>
        </div>
      )}

      {activeTab === "courses" ? (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-4 py-2.5">
          <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
            <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
            {mode === "courses" ? "课程老师" : "服务老师"}
          </span>
          <SelectDropdown
            size="sm"
            className="w-[160px]"
            options={teacherSelectOptions}
            value={mode === "courses" ? courseTeacherId : teacher}
            onChange={value => {
              if (mode === "courses") {
                setCourseTeacherId(value)
                setTeacher(teacherOptions.find(option => option.customer_id === value)?.name || "")
              } else setTeacher(value)
            }}
            placeholder={mode === "courses" ? "请选择课程老师" : "请选择服务老师"}
            buttonClassName="border-[#dee0e3] bg-white"
          />
          {activeTab === "courses" ? (
            <>
              <span className="ml-1 text-[12px] text-[#8f959e]">课程类型</span>
              <SelectDropdown
                size="sm"
                className="w-[132px]"
                value={courseActivityType}
                options={[
                  { value: "all", label: "全部课程" },
                  ...(courseData?.activity_types?.length ? courseData.activity_types : DEFAULT_ACTIVITY_TYPES),
                ]}
                onChange={setCourseActivityType}
                buttonClassName="border-[#dee0e3] bg-white"
              />
              <span className="ml-1 text-[12px] text-[#8f959e]">时间</span>
              <div className="flex h-7 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                {COURSE_RANGE_PRESETS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyCourseRangePreset(option.value)}
                    className={`h-[22px] min-w-[40px] rounded-[3px] px-2 text-[11px] transition-colors ${
                      courseRangePreset === option.value ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73] hover:bg-[#f5f6f7]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-0.5">
                <input
                  type="date"
                  value={courseDateFrom}
                  max={courseDateTo}
                  onChange={event => { setCourseRangePreset("custom"); setCourseDateFrom(event.target.value) }}
                  className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] text-[#2b2f36] outline-none"
                  aria-label="课程开始日期"
                />
                <span className="flex h-[26px] items-center bg-white px-1 text-[11px] text-[#8f959e]">-</span>
                <input
                  type="date"
                  value={courseDateTo}
                  min={courseDateFrom}
                  onChange={event => { setCourseRangePreset("custom"); setCourseDateTo(event.target.value) }}
                  className="h-[26px] rounded-[2px] border-none bg-white px-2 text-[11px] text-[#2b2f36] outline-none"
                  aria-label="课程结束日期"
                />
              </div>
              {/* 参与者页签的筛选跟这一行放在一起，不再单独占一行 */}
              {courseViewTab === "participants" && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="ml-1 text-[12px] text-[#8f959e]">昵称</span>
                  <Input
                    value={participantKeyword}
                    onChange={event => setParticipantKeyword(event.target.value)}
                    placeholder="按昵称或姓名搜索"
                    className="h-7 w-[150px] rounded-[4px] border-[#dee0e3] text-[12px] shadow-none focus-visible:ring-0"
                  />
                  <span className="ml-1 text-[12px] text-[#8f959e]">客户身份</span>
                  <SelectDropdown
                    size="sm"
                    className="w-[118px]"
                    value={participantMemberType}
                    options={[{ value: "", label: "全部客户身份" }, ...participantMemberTypes.map(item => ({ value: item, label: item }))]}
                    onChange={setParticipantMemberType}
                    buttonClassName="border-[#dee0e3] bg-white"
                  />
                  <span className="ml-1 text-[12px] text-[#8f959e]">人员</span>
                  <SelectDropdown
                    size="sm"
                    className="w-[100px]"
                    value={participantIdentityGroup}
                    options={[{ value: "", label: "全部人员" }, { value: "新人", label: "新人" }, { value: "老人", label: "老人" }]}
                    onChange={setParticipantIdentityGroup}
                    buttonClassName="border-[#dee0e3] bg-white"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <span className="ml-1 text-[12px] text-[#8f959e]">包含</span>
              <div className="flex h-7 items-center gap-3 rounded-[4px] border border-[#dee0e3] px-2.5">
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]">
                  <input
                    type="checkbox"
                    checked={includeCustomerInfo}
                    onChange={event => toggleFollowUpDefinition("customer_info", event.target.checked)}
                    className="h-3.5 w-3.5 accent-[#3370ff]"
                  />
                  客户信息
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]">
                  <input
                    type="checkbox"
                    checked={includeFollowUp}
                    onChange={event => toggleFollowUpDefinition("follow_up", event.target.checked)}
                    className="h-3.5 w-3.5 accent-[#3370ff]"
                  />
                  跟进点
                </label>
              </div>
              <span className="ml-1 text-[12px] text-[#8f959e]">范围</span>
              <div className="flex h-8 items-center rounded-[4px] border border-[#dee0e3] bg-white">
                <input
                  type="number"
                  min={1}
                  max={3650}
                  value={followUpDaysInput}
                  onChange={event => setFollowUpDaysInput(event.target.value)}
                  onBlur={commitFollowUpDays}
                  onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur() }}
                  className="h-full w-[58px] border-0 bg-transparent px-2 text-right text-[12px] tabular-nums text-[#2b2f36] outline-none"
                  aria-label="跟进范围天数"
                />
                <span className="pr-2 text-[12px] text-[#8f959e]">天</span>
              </div>
              <SelectDropdown
                size="sm"
                className="w-[108px]"
                value={followUpFilter}
                options={[
                  { value: "inactive", label: "未录入" },
                  { value: "active", label: "已录入" },
                  { value: "all", label: "全部客户" },
                ]}
                onChange={value => setFollowUpFilter(value as ServiceTeacherFollowUpFilter)}
                buttonClassName="border-[#dee0e3] bg-white"
              />
            </>
          )}
        </div>

        {courseViewTab === "courses" && (
          <div className="border-b border-[#f0f0f0] px-4 py-3">
            <div className="mb-2 text-[12px] font-medium text-[#4e535a]">课程概览</div>
            <div className="grid grid-cols-3 gap-2">
              {summaryItems.map(item => (
                <div key={item.label} className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
                  <div className="mb-1 text-[12px] text-[#4e535a]">{item.label}</div>
                  <span className="text-lg font-medium tabular-nums text-[#1f2329]">
                    {item.value.toLocaleString()}
                    <span className="ml-1 text-[12px] font-normal text-[#8f959e]">{item.unit}</span>
                  </span>
                  {item.subs && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-[#8f959e]">
                      {item.subs.map(sub => (
                        <span key={sub.label}>
                          {sub.label}
                          <span className="ml-1 tabular-nums text-[#1f2329]">{sub.value.toLocaleString()}</span>
                          <span className="ml-0.5">{sub.unit}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {item.hint && <div className="mt-1 text-[12px] text-[#8f959e]">{item.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="text-[12px] font-medium text-[#4e535a]">
            {courseViewTab === "participants" ? "参与者" : courseListTitle}
            <span className="font-normal text-[#8f959e]">
              {courseViewTab === "participants"
                ? ` · 共 ${participantTotal} 场课 · ${participantTotalParticipants} 人`
                : `（${courseListCount}${courseListUnit}）`}
            </span>
          </div>
          {courseViewTab === "reviews" ? (
            <button
              type="button"
              onClick={() => setReviewContentExpanded(current => !current)}
              disabled={reviewRows.length === 0}
              className="h-7 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
            >
              {reviewContentExpanded ? "缩略" : "展开"}
            </button>
          ) : (
            <button
              type="button"
              onClick={exportCourseRecords}
              disabled={!teacher || courseLoading || courseRows.length === 0 || courseExporting}
              className="flex h-7 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
            >
              <Download className="h-3.5 w-3.5" />
              {courseExporting ? "导出中" : "导出"}
            </button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
          {metadataError || courseError ? (
            <div className="py-16 text-center text-sm text-muted-foreground">{metadataError || courseError}</div>
          ) : !teacher ? (
            <div className="py-16 text-center text-sm text-muted-foreground">请选择课程老师</div>
          ) : metadataLoaded && !selectedTeacherId ? (
            <div className="py-16 text-center text-sm text-muted-foreground">暂无可选课程老师</div>
          ) : courseLoading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
          ) : courseViewTab === "participants" ? (
            <div className="flex min-h-0 flex-1 flex-col">
                {participantLoading ? (
                <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
              ) : participantGroups.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">所选条件下暂无参与者</div>
              ) : (
                <div className="space-y-3 px-4 py-3">
                  {/* 列标题只在最上面出现一次，每堂课一张卡片，卡片内是极浅的分隔线 */}
                  <table className="w-full table-fixed border-collapse text-[11px] text-[#9aa1a9]">
                    <colgroup>{PARTICIPANT_COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
                    <thead>
                      <tr>
                        {PARTICIPANT_COLUMNS.map((column, index) => (
                          <th key={column.key} className={`px-3 py-2 text-left font-normal ${index === 0 ? "pl-3" : ""}`}>{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                  </table>
                  {participantGroups.map(group => (
                    <div key={group.course_id} className="overflow-hidden rounded-[6px] border border-[#eceef0]">
                      <div className="flex items-center justify-between gap-3 bg-[#fafbfc] px-3 py-2">
                        <span className="min-w-0 truncate text-[12.5px] font-medium text-[#2b2f36]">
                          {group.course_date || ""} · {group.course_name || "未命名课程"}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#9aa1a9]">{group.participants.length} 人</span>
                      </div>
                      <table className="w-full table-fixed border-collapse">
                        <colgroup>{PARTICIPANT_COLUMNS.map(column => <col key={column.key} style={{ width: column.width }} />)}</colgroup>
                        <tbody>
                          {group.participants.map(row => (
                            <tr key={row.id} className="border-t border-[#f5f6f7] align-top">
                              <td className="break-words px-3 py-2.5 pl-3 text-[12px] text-[#2b2f36]">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <button type="button" onClick={() => setSelectedCustomerId(row.customer_id)} className="text-left hover:underline">
                                    {row.nickname || <EmptyDash />}
                                  </button>
                                  {row.participant_role === "案主" && <span className="rounded-[3px] border border-[#f1e2d2] bg-[#fffaf5] px-1.5 py-0.5 text-[10px] leading-none text-[#a8794f]">案主</span>}
                                </div>
                              </td>
                              <td className="break-words px-3 py-2.5 text-[12px] text-[#4e535a]">{row.member_type || row.identity_group || <EmptyDash />}</td>
                              <td className="px-3 py-2.5 text-[12px] tabular-nums text-[#4e535a]">{row.same_course_count ? `${row.same_course_count} 次` : <EmptyDash />}</td>
                              {(["visit_need", "customer_info", "follow_up"] as const).map(field => {
                                const entries = row[`${field}_entries`] || []
                                return (
                                  <td key={field} className="px-3 py-2.5">
                                    {(entries.length > 0 || row[field]) ? (
                                      <button
                                        type="button"
                                        onClick={() => openParticipantEditor(row, field)}
                                        className="group block w-full text-left"
                                        title="点击填写自己的内容"
                                      >
                                        <ParticipantNoteLines entries={entries} fallback={row[field]} />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => openParticipantEditor(row, field)}
                                        className="flex h-7 w-full items-center rounded-[4px] border border-[#e8eaed] bg-white px-2.5 text-left text-[11px] leading-none text-[#a8b0ba] transition-colors hover:border-[#b9cdf8] hover:text-[#4e535a]"
                                      >点击填写</button>
                                    )}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
              <PaginationBar
                currentPage={participantPage}
                totalPages={participantTotalPages}
                totalItems={participantTotal}
                startIndex={participantTotal === 0 ? 0 : (participantPage - 1) * PAGE_SIZE + 1}
                endIndex={Math.min(participantPage * PAGE_SIZE, participantTotal)}
                onPageChange={next => loadParticipants(next)}
                unit="场"
              />
            </div>
          ) : courseViewTab === "reviews" ? (
            reviewRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">所选时间范围内暂无复盘记录</div>
            ) : (
              <div className="overflow-x-auto">
              <Table className="min-w-[1080px] table-fixed">
                <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                  <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                    <TableHead className="h-9 w-[92px] px-3 pl-4 text-[11px] font-normal">上课日期</TableHead>
                    <TableHead className="h-9 w-[105px] px-3 text-[11px] font-normal">上课时间</TableHead>
                    <TableHead className="h-9 w-[160px] px-3 text-[11px] font-normal">课程</TableHead>
                    <TableHead className="h-9 w-[80px] px-3 text-[11px] font-normal">课程类型</TableHead>
                    <TableHead className="h-9 w-[90px] px-3 text-[11px] font-normal">老师/成就君</TableHead>
                    {showCourseOwner && <TableHead className="h-9 w-[60px] px-3 text-[11px] font-normal">案主</TableHead>}
                    <TableHead className="h-9 w-[68px] px-3 text-right text-[11px] font-normal">参与人数</TableHead>
                    <TableHead className="h-9 w-[110px] px-3 text-[11px] font-normal">新人名单</TableHead>
                    <TableHead className="h-9 w-[110px] px-3 text-[11px] font-normal">老人名单</TableHead>
                    <TableHead className="h-9 px-3 pr-4 text-[11px] font-normal">复盘内容</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewPagination.paginatedItems.map(course => {
                    const reviewText = course.course_review || ""
                    const newNames = courseParticipantNames(course, "new")
                    const oldNames = courseParticipantNames(course, "old")
                    // 由实际渲染宽度判定：复盘内容 / 新人名单 / 老人名单 任一放不下才需要展开
                    const needsReviewExpand = truncatedReviewIds.includes(course.id)
                    const rowExpanded = needsReviewExpand && reviewContentExpanded
                    // 展开行不再固定 h-11，其余单元格保持垂直居中；只有复盘内容那一格顶对齐
                    const cellBase = rowExpanded ? "px-3 py-1.5" : "h-11 px-3 py-0"
                    const wrapText = rowExpanded ? "whitespace-pre-wrap break-words" : "truncate"
                    return (
                    <TableRow
                      key={course.id}
                      ref={node => { reviewRowRefs.current[course.id] = node }}
                      className="group border-[#f0f0f0] last:border-b-0 hover:bg-[#f7f8fa]"
                    >
                      <TableCell className={`${cellBase} pl-4 text-[12px] tabular-nums text-[#8f959e]`}>{course.date || <EmptyDash />}</TableCell>
                      <TableCell className={`${cellBase} text-[12px] tabular-nums text-[#8f959e]`}>{formatCourseTime(course) || <EmptyDash />}</TableCell>
                      <TableCell className={`${cellBase} overflow-hidden`}>
                        <span className={`block ${wrapText} text-[12px] font-medium text-[#2b2f36]`} title={course.name || undefined}>
                          {course.name || <EmptyDash />}
                        </span>
                      </TableCell>
                      <TableCell className={`${cellBase} text-[12px] text-[#8f959e]`}>{course.activity_type_label || <EmptyDash />}</TableCell>
                      <TableCell className={`${cellBase} overflow-hidden text-[12px] text-[#8f959e]`} title={course.teachers.join("、") || undefined}>
                        <span className={`block ${wrapText}`}>{course.teachers.join("、") || <EmptyDash />}</span>
                      </TableCell>
                      {showCourseOwner && <TableCell className={`${cellBase} text-[12px] text-[#8f959e]`}>{course.owner_name || <EmptyDash />}</TableCell>}
                      <TableCell className={`${cellBase} text-right text-[12px] tabular-nums text-[#8f959e]`}>{course.participant_count}人</TableCell>
                      <TableCell className={`${cellBase} overflow-hidden text-[12px]`}>
                        <span data-clamp className={`block ${wrapText} text-[#8f959e]`} title={newNames || undefined}>
                          {newNames || <EmptyDash />}
                        </span>
                      </TableCell>
                      <TableCell className={`${cellBase} overflow-hidden text-[12px]`}>
                        <span data-clamp className={`block ${wrapText} text-[#8f959e]`} title={oldNames || undefined}>
                          {oldNames || <EmptyDash />}
                        </span>
                      </TableCell>
                      <TableCell className={`${cellBase} ${rowExpanded ? "align-top" : ""} pr-4 text-[12px] text-[#4e535a]`}>
                        <span data-clamp className={`block ${wrapText}`} title={reviewText || undefined}>
                          {reviewText || <EmptyDash />}
                        </span>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              </div>
            )
          ) : courseRows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">所选时间范围内暂无课程记录</div>
          ) : (
            <div className="overflow-x-auto">
            <Table className="min-w-[1080px] table-fixed">
              <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                  <TableHead className="h-9 w-[92px] px-3 pl-4 text-[11px] font-normal">上课日期</TableHead>
                  <TableHead className="h-9 w-[105px] px-3 text-[11px] font-normal">上课时间</TableHead>
                  <TableHead className="h-9 w-[200px] px-3 text-[11px] font-normal">课程</TableHead>
                  <TableHead className="h-9 w-[80px] px-3 text-[11px] font-normal">课程类型</TableHead>
                  <TableHead className="h-9 w-[56px] px-3 text-right text-[11px] font-normal">课时</TableHead>
                  <TableHead className="h-9 w-[90px] px-3 text-[11px] font-normal">老师/成就君</TableHead>
                  {showCourseOwner && <TableHead className="h-9 w-[60px] px-3 text-[11px] font-normal">案主</TableHead>}
                  {showCourseBodyParts && <TableHead className="h-9 w-[68px] px-3 text-right text-[11px] font-normal">部位数</TableHead>}
                  <TableHead className="h-9 w-[68px] px-3 text-right text-[11px] font-normal">参与人数</TableHead>
                  <TableHead className="h-9 px-3 text-[11px] font-normal">新人名单</TableHead>
                  <TableHead className="h-9 px-3 pr-4 text-[11px] font-normal">老人名单</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coursePagination.paginatedItems.map(course => {
                  const newNames = courseParticipantNames(course, "new")
                  const oldNames = courseParticipantNames(course, "old")
                  return (
                  <TableRow key={course.id} className="group h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                    <TableCell className="h-11 px-3 py-0 pl-4 text-[12px] tabular-nums text-[#8f959e]">{course.date || <EmptyDash />}</TableCell>
                    <TableCell className="h-11 px-3 py-0 text-[12px] tabular-nums text-[#8f959e]">{formatCourseTime(course) || <EmptyDash />}</TableCell>
                    <TableCell className="h-11 overflow-hidden px-3 py-0">
                      <span
                        className="block truncate text-[12px] font-medium text-[#2b2f36]"
                        title={course.name || undefined}
                      >
                        {course.name || <EmptyDash />}
                      </span>
                    </TableCell>
                    <TableCell className="h-11 px-3 py-0 text-[12px] text-[#4e535a]">{course.activity_type_label || <EmptyDash />}</TableCell>
                    <TableCell className="h-11 px-3 py-0 text-right text-[12px] tabular-nums text-[#4e535a]">{course.class_hours}</TableCell>
                    <TableCell className="h-11 max-w-[90px] truncate px-3 py-0 text-[12px] text-[#4e535a]" title={course.teachers.join("、") || undefined}>
                      {course.teachers.join("、") || <EmptyDash />}
                    </TableCell>
                    {showCourseOwner && <TableCell className="h-11 px-3 py-0 text-[12px] text-[#4e535a]">{course.owner_name || <EmptyDash />}</TableCell>}
                    {showCourseBodyParts && <TableCell className="h-11 px-3 py-0 text-right text-[12px] tabular-nums text-[#4e535a]">{course.body_part_count ?? <EmptyDash />}</TableCell>}
                    <TableCell className="h-11 px-3 py-0 text-right text-[12px] tabular-nums text-[#4e535a]">{course.participant_count}人</TableCell>
                    <TableCell className="whitespace-normal break-words px-3 py-2 text-[12px] leading-5 text-[#4e535a]">{newNames || <EmptyDash />}</TableCell>
                    <TableCell className="whitespace-normal break-words px-3 py-2 pr-4 text-[12px] leading-5 text-[#4e535a]">{oldNames || <EmptyDash />}</TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </div>
        <PaginationBar
          currentPage={activeCoursePagination.currentPage}
          totalPages={activeCoursePagination.totalPages}
          totalItems={activeCoursePagination.totalItems}
          startIndex={activeCoursePagination.startIndex}
          endIndex={activeCoursePagination.endIndex}
          onPageChange={activeCoursePagination.goToPage}
          unit={courseListUnit}
        />
        </div>
      </section>
      ) : (
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-4 py-2.5">
          <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]">
            <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
            服务老师
          </span>
          <SelectDropdown
            size="sm"
            className="w-[160px]"
            options={teacherSelectOptions}
            value={teacher}
            onChange={setTeacher}
            placeholder="请选择服务老师"
            buttonClassName="border-[#dee0e3] bg-white"
          />
          <span className="ml-1 text-[12px] text-[#8f959e]">包含</span>
          <div className="flex h-7 items-center gap-3 rounded-[4px] border border-[#dee0e3] px-2.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]">
              <input
                type="checkbox"
                checked={includeCustomerInfo}
                onChange={event => toggleFollowUpDefinition("customer_info", event.target.checked)}
                className="h-3.5 w-3.5 accent-[#3370ff]"
              />
              客户信息
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-[#646a73]">
              <input
                type="checkbox"
                checked={includeFollowUp}
                onChange={event => toggleFollowUpDefinition("follow_up", event.target.checked)}
                className="h-3.5 w-3.5 accent-[#3370ff]"
              />
              跟进点
            </label>
          </div>
          <span className="ml-1 text-[12px] text-[#8f959e]">范围</span>
          <div className="flex h-8 items-center rounded-[4px] border border-[#dee0e3] bg-white">
            <input
              type="number"
              min={1}
              max={3650}
              value={followUpDaysInput}
              onChange={event => setFollowUpDaysInput(event.target.value)}
              onBlur={commitFollowUpDays}
              onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur() }}
              className="h-full w-[58px] border-0 bg-transparent px-2 text-right text-[12px] tabular-nums text-[#2b2f36] outline-none"
              aria-label="跟进范围天数"
            />
            <span className="pr-2 text-[12px] text-[#8f959e]">天</span>
          </div>
          <SelectDropdown
            size="sm"
            className="w-[108px]"
            value={followUpFilter}
            options={[
              { value: "inactive", label: "未录入" },
              { value: "active", label: "已录入" },
              { value: "all", label: "全部客户" },
            ]}
            onChange={value => setFollowUpFilter(value as ServiceTeacherFollowUpFilter)}
            buttonClassName="border-[#dee0e3] bg-white"
          />
        </div>

        <div className="border-b border-[#f0f0f0] px-4 py-3">
          <div className="mb-2 text-[12px] font-medium text-[#4e535a]">跟进概览</div>
          <div className="grid grid-cols-3 gap-2">
            {summaryItems.map(item => (
              <div key={item.label} className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
                <div className="mb-1 text-[12px] text-[#4e535a]">{item.label}</div>
                <span className="text-lg font-medium tabular-nums text-[#1f2329]">
                  {item.value.toLocaleString()}
                  <span className="ml-1 text-[12px] font-normal text-[#8f959e]">{item.unit}</span>
                </span>
                {item.hint && <div className="mt-1 text-[12px] text-[#8f959e]">{item.hint}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-4 border-b border-[#f0f0f0] px-4 py-2.5">
          <div className="text-[12px] font-medium text-[#4e535a]">
            客户列表
            <span className="font-normal text-[#8f959e]">（{pagination.totalItems}人）</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportFollowUpRecords}
              disabled={!teacher || followUpExporting}
              className="flex h-7 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
            >
              <Download className="h-3.5 w-3.5" />
              {followUpExporting ? "导出中" : "导出"}
            </button>
            <button
              type="button"
              onClick={() => setFollowUpContentExpanded(current => !current)}
              className="h-7 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
            >
              {followUpContentExpanded ? "缩略" : "展开"}
            </button>
            {followUpExportError && <span className="max-w-[140px] truncate text-[12px] text-[#c4506a]" title={followUpExportError}>{followUpExportError}</span>}
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {metadataError || pagination.error ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{metadataError || pagination.error}</div>
        ) : pagination.loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : pagination.paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {teacher ? "当前筛选下暂无客户" : "当前账号未关联所属人，请先选择服务老师"}
          </div>
        ) : (
          <Table className="w-full table-fixed border-collapse text-left">
            <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
              <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                <TableHead className="h-9 w-[110px] px-3 pl-4 text-[11px] font-normal">客户昵称</TableHead>
                <TableHead className="h-9 w-[110px] px-3 text-[11px] font-normal">会员身份</TableHead>
                <TableHead className="h-9 w-[120px] px-3 text-[11px] font-normal">跟进阶段</TableHead>
                <TableHead className="h-9 px-3 text-[11px] font-normal">最近客户信息</TableHead>
                <TableHead className="h-9 px-3 text-[11px] font-normal">最近跟进点</TableHead>
                <TableHead className="h-9 w-[150px] px-3 text-[11px] font-normal">最近录入时间</TableHead>
                <TableHead className="h-9 w-[80px] px-3 pr-4 text-right text-[11px] font-normal">距今</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagination.paginatedItems.map(item => (
                <TableRow key={item.id} className="group h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                  <TableCell className="h-11 px-3 py-0 pl-4">
                    <button type="button" onClick={() => setSelectedCustomerId(item.id)} className="text-[12px] font-medium text-[#2b2f36] hover:text-[#3370ff]">
                      {item.nickname || item.name || <EmptyDash />}
                    </button>
                  </TableCell>
                  <TableCell className="h-11 truncate px-3 py-0 text-[12px] text-[#4e535a]" title={item.member_type || undefined}>{item.member_type || <EmptyDash />}</TableCell>
                  <TableCell className="h-11 truncate px-3 py-0 text-[12px] text-[#4e535a]" title={item.follow_up_status || undefined}>{item.follow_up_status || <EmptyDash />}</TableCell>
                  <TableCell className={followUpContentExpanded ? "min-h-[44px] whitespace-normal px-3 py-1.5 align-top text-[12px]" : "h-11 overflow-hidden px-3 py-0 text-[12px]"}>
                    <NoteContent author={item.latest_customer_info_by} content={item.latest_customer_info_content} expanded={followUpContentExpanded} />
                  </TableCell>
                  <TableCell className={followUpContentExpanded ? "min-h-[44px] whitespace-normal px-3 py-1.5 align-top text-[12px]" : "h-11 overflow-hidden px-3 py-0 text-[12px]"}>
                    <NoteContent author={item.latest_follow_up_by} content={item.latest_follow_up_content} expanded={followUpContentExpanded} />
                  </TableCell>
                  <TableCell className="h-11 px-3 py-0 text-[12px] text-[#8f959e]">{item.last_follow_up_at ? formatDateTime(item.last_follow_up_at) : <EmptyDash />}</TableCell>
                  <TableCell className={`h-11 px-3 py-0 pr-4 text-right text-[12px] tabular-nums ${item.is_active ? "text-[#8f959e]" : "text-[#c4506a]"}`}>
                    {daysSince(item.last_follow_up_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        </div>
        <PaginationBar
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          startIndex={pagination.startIndex}
          endIndex={pagination.endIndex}
          onPageChange={pagination.goToPage}
          unit="人"
        />
        </div>
      </section>
      )}
      <Dialog open={!!selectedCustomerId} onOpenChange={open => { if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-h-[90vh] max-w-[1180px] gap-0 overflow-y-auto p-0">
          <DetailView selectedCustomerId={selectedCustomerId} onClearSelection={() => setSelectedCustomerId(null)} hideSearch />
        </DialogContent>
      </Dialog>

      {/* 参与者页签：填写/修改自己这一条（上面显示所有人填写的内容做参考） */}
      <Dialog open={!!participantEditing} onOpenChange={open => { if (!open && !participantSaving) setParticipantEditing(null) }}>
        <DialogContent initialFocus={false} className="w-[560px] max-w-[92vw] max-h-[88vh] gap-0 overflow-hidden rounded-[6px] border-[0.5px] border-[#e8eaed] p-0">
          <div className="border-b-[0.5px] border-[#f0f0f0] px-5 pb-2 pt-3">
            <h3 className="text-[14px] font-normal text-[#1f2329]">
              填写{participantEditing?.field === "visit_need" ? "来访需求" : participantEditing?.field === "customer_info" ? "客户信息" : "跟进点"}
            </h3>
          </div>
          <div className="max-h-[64vh] space-y-3 overflow-y-auto px-5 py-4">
            <p className="text-[12px] text-[#8f959e]">
              {participantEditing?.row.course_date} · {participantEditing?.row.nickname} · {participantEditing?.row.course_name}
            </p>
            {participantEditing && (participantEditing.row[participantEditing.field] || (participantEditing.row[`${participantEditing.field}_entries`] || []).length > 0) && (
              <div className="max-h-[220px] overflow-y-auto rounded-[4px] bg-[#f7f8fa] px-3 py-2">
                <div className="mb-1 text-[11px] text-[#8f959e]">别人填写的</div>
                <ParticipantNoteLines
                  entries={participantEditing.row[`${participantEditing.field}_entries`] || []}
                  fallback={participantEditing.row[participantEditing.field]}
                  expanded
                />
              </div>
            )}
            <div>
              <div className="mb-1 text-[11px] text-[#8f959e]">我填写的内容</div>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12px] text-[#646a73]">反馈人</span>
                <FeedbackPersonSelect options={participantFeedbackPeople} value={participantFeedbackPerson} onChange={setParticipantFeedbackPerson} />
              </div>
              <textarea
                value={participantDraft}
                onChange={event => setParticipantDraft(event.target.value)}
                disabled={participantEditorLoading || participantEditorReadFailed}
                rows={5}
                maxLength={5000}
                placeholder={participantEditing?.field === "customer_info" ? "填写客户信息..." : participantEditing?.field === "follow_up" ? "填写跟进点..." : "填写来访需求..."}
                className="w-full rounded-[4px] border-[0.5px] border-[#e1e4e7] px-3 py-2 text-[12.5px] leading-5 text-[#2b2f36] outline-none placeholder:text-[#b0b5bb] focus:border-[#b9cdf8]"
              />
              {participantEditorError && <p className="mt-1 text-[11px] text-[#c4506a]">{participantEditorError}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
            <Button variant="outline" size="sm" onClick={() => setParticipantEditing(null)} disabled={participantSaving} className="h-8 w-[88px] rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
            <Button size="sm" onClick={saveParticipantNote} disabled={participantSaving || participantEditorLoading || participantEditorReadFailed || !participantDraft.trim()} className="h-8 w-[104px] rounded-[4px] border border-[#3370ff] bg-[#3370ff] text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{participantSaving ? "保存中" : "保存"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
