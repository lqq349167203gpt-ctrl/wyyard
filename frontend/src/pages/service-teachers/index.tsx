import { useCallback, useEffect, useMemo, useState } from "react"
import { Download } from "lucide-react"
import ExcelJS from "exceljs"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { usePagination } from "@/hooks/use-pagination"
import {
  serviceTeacherCustomerApi,
  statisticsApi,
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
type CourseRangePreset = "today" | "week" | "month" | "year" | "all" | "custom"
type CourseRow = CourseStatistics["courses"][number]
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
  return coursePresetRange("all")
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
      <span className="max-w-[88px] shrink-0 truncate text-[12px] text-[#8f959e]" title={author || "未知"}>{author || "未知"}</span>
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
  const [courseRangePreset, setCourseRangePreset] = useState<CourseRangePreset>("all")
  const [courseActivityType, setCourseActivityType] = useState("all")
  const showCourseOwner = !["class", "ics"].includes(courseActivityType)
  const showCourseBodyParts = courseActivityType === "all" || courseActivityType === "eks"
  const [courseData, setCourseData] = useState<CourseStatistics | null>(null)
  const [courseLoading, setCourseLoading] = useState(false)
  const [courseError, setCourseError] = useState("")
  const [courseExporting, setCourseExporting] = useState(false)

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

  useEffect(() => {
    coursePagination.goToPage(1)
  }, [courseActivityType, courseDateFrom, courseDateTo, selectedTeacherId])

  const courseSummary = useMemo(() => (courseData?.statistics || []).reduce(
    (result, item) => ({
      courseCount: result.courseCount + item.course_count,
      classHours: result.classHours + item.class_hours,
      participantCount: result.participantCount + item.participant_count,
    }),
    { courseCount: 0, classHours: 0, participantCount: 0 },
  ), [courseData?.statistics])

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
        { header: "客户信息录入人", key: "customerInfoBy", width: 16 },
        { header: "客户信息录入时间", key: "customerInfoAt", width: 22 },
        { header: "最近跟进点", key: "followUp", width: 42 },
        { header: "跟进点录入人", key: "followUpBy", width: 16 },
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
        customerInfoAt: item.latest_customer_info_at ? formatDateTime(item.latest_customer_info_at) : "-",
        followUp: item.latest_follow_up_content || "-",
        followUpBy: item.latest_follow_up_by || "-",
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

  const summaryItems = activeTab === "courses"
    ? [
        { label: "课程数", value: courseSummary.courseCount, unit: "场", hint: "所选时间范围" },
        { label: "课时数", value: courseSummary.classHours, unit: "课时", hint: "按课程扣卡规则统计" },
        { label: "参与人次", value: courseSummary.participantCount, unit: "人次", hint: "同一客户多次参与会重复计算" },
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
    <div className="min-h-full bg-[#f7f8fa] px-2.5 pb-6 pt-2.5">
      <section className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
        <h1 className="mb-4 text-lg font-medium text-[#1f2329]">{mode === "courses" ? "课程记录" : "服务老师"}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
              <div className="flex h-8 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                {COURSE_RANGE_PRESETS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => applyCourseRangePreset(option.value)}
                    className={`h-[26px] rounded-[2px] px-2 text-[12px] transition-colors ${
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
      </section>

      <section className="mb-1.5 rounded-[4px] bg-white px-[22px] py-4">
        <div className="mb-3 text-[12px] font-medium text-[#4e535a]">
          {activeTab === "courses" ? "课程概览" : "跟进概览"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {summaryItems.map(item => (
            <div key={item.label} className="rounded-[2px] border border-[#e8eaed] bg-white px-3 py-2">
              <div className="mb-1 text-[12px] text-[#4e535a]">{item.label}</div>
              <span className="text-lg font-medium tabular-nums text-[#1f2329]">
                {item.value.toLocaleString()}
                <span className="ml-1 text-[12px] font-normal text-[#8f959e]">{item.unit}</span>
              </span>
              <div className="mt-1 text-[12px] text-[#8f959e]">{item.hint}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-[4px] bg-white px-[22px] py-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="text-[12px] font-medium text-[#4e535a]">
            {activeTab === "courses" ? "课程列表" : "客户列表"}
            <span className="font-normal text-[#8f959e]">（{activeTab === "courses" ? courseRows.length : pagination.totalItems}{activeTab === "courses" ? "场" : "人"}）</span>
          </div>
          {activeTab === "courses" ? (
            <button
              type="button"
              onClick={exportCourseRecords}
              disabled={!teacher || courseLoading || courseRows.length === 0 || courseExporting}
              className="flex h-7 items-center gap-1 rounded-[4px] border border-input px-3 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
            >
              <Download className="h-3.5 w-3.5" />
              {courseExporting ? "导出中" : "导出"}
            </button>
          ) : (
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
          )}
        </div>

        {activeTab === "courses" ? (
          <>
            {metadataError || courseError ? (
              <div className="py-16 text-center text-sm text-muted-foreground">{metadataError || courseError}</div>
            ) : !teacher ? (
              <div className="py-16 text-center text-sm text-muted-foreground">请选择课程老师</div>
            ) : metadataLoaded && !selectedTeacherId ? (
              <div className="py-16 text-center text-sm text-muted-foreground">暂无可选课程老师</div>
            ) : courseLoading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
            ) : courseRows.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">所选时间范围内暂无课程记录</div>
            ) : (
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
            )}
            <PaginationBar
              currentPage={coursePagination.currentPage}
              totalPages={coursePagination.totalPages}
              totalItems={coursePagination.totalItems}
              startIndex={coursePagination.startIndex}
              endIndex={coursePagination.endIndex}
              onPageChange={coursePagination.goToPage}
              unit="场"
            />
          </>
        ) : (
          <>
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
                      <TableCell className={followUpContentExpanded ? "whitespace-normal px-3 py-2 align-top text-[12px]" : "h-11 overflow-hidden px-3 py-0 text-[12px]"}>
                        <NoteContent author={item.latest_customer_info_by} content={item.latest_customer_info_content} expanded={followUpContentExpanded} />
                      </TableCell>
                      <TableCell className={followUpContentExpanded ? "whitespace-normal px-3 py-2 align-top text-[12px]" : "h-11 overflow-hidden px-3 py-0 text-[12px]"}>
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
            <PaginationBar
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              startIndex={pagination.startIndex}
              endIndex={pagination.endIndex}
              onPageChange={pagination.goToPage}
              unit="人"
            />
          </>
        )}
      </section>

      <Dialog open={!!selectedCustomerId} onOpenChange={open => { if (!open) setSelectedCustomerId(null) }}>
        <DialogContent className="max-h-[90vh] max-w-[1180px] gap-0 overflow-y-auto p-0">
          <DetailView selectedCustomerId={selectedCustomerId} onClearSelection={() => setSelectedCustomerId(null)} hideSearch />
        </DialogContent>
      </Dialog>
    </div>
  )
}
