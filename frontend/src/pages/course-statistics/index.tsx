import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react"
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { statisticsApi, type CourseStatistics } from "@/lib/api"
import { calcYAxisWidth } from "@/lib/utils"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Tooltip as HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyValue } from "@/components/empty-value"

type RangeMode = "month" | "year"
type Granularity = "day" | "week" | "month"
type CourseRow = CourseStatistics["courses"][number]
type ParticipantGroup = "all" | "new" | "old"
type CourseSortKey = "date" | "activity_type_label" | "teachers" | "participant_count" | "new_count" | "old_count" | "daily_transaction_amount"
type SortDirection = "asc" | "desc"

const DEFAULT_ACTIVITY_TYPES = [
  { value: "class", label: "沙龙活动" },
  { value: "gcs", label: "觉醒游戏" },
  { value: "ers", label: "情绪释放" },
  { value: "eks", label: "能量结" },
  { value: "ics", label: "内部课程" },
]

const TREND_METRICS = [
  { key: "course_count", label: "课程数", color: "#3370ff", axis: "count" },
  { key: "class_hours", label: "课时数", color: "#00a6a6", axis: "count" },
  { key: "participant_count", label: "参与人数", color: "#f5a623", axis: "count" },
  { key: "transaction_amount", label: "当天成交额", color: "#7b61ff", axis: "amount" },
] as const

const TEACHER_METRICS = [
  { key: "course_count", label: "课程数", color: "#3370ff" },
  { key: "class_hours", label: "课时数", color: "#00a6a6" },
  { key: "participant_count", label: "参与人数", color: "#f5a623" },
  { key: "transaction_amount", label: "成交额", color: "#7b61ff" },
] as const

function formatDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getMonthRange(date: Date) {
  return {
    from: formatDate(new Date(date.getFullYear(), date.getMonth(), 1)),
    to: formatDate(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
  }
}

function getYearRange(date: Date) {
  return {
    from: `${date.getFullYear()}-01-01`,
    to: `${date.getFullYear()}-12-31`,
  }
}

function formatRangeDate(value: string) {
  const [year, month, day] = value.split("-")
  return `${year}年${month}月${day}日`
}

function getCoursePeriodKey(dateValue: string, granularity: Granularity) {
  if (granularity === "day") return dateValue
  if (granularity === "month") return dateValue.slice(0, 7)

  const [year, month, day] = dateValue.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const isoYear = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(isoYear, 0, 1))
  const week = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${isoYear}-W${String(week).padStart(2, "0")}`
}

function formatCoursePeriod(period: string, granularity: Granularity) {
  if (granularity === "day") return formatRangeDate(period)
  if (granularity === "month") {
    const [year, month] = period.split("-")
    return `${year}年${Number(month)}月`
  }
  const [year, week] = period.split("-W")
  return `${year}年第${Number(week)}周`
}

function FilterRow({ label, children, topAligned = false }: { label: string; children: ReactNode; topAligned?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className={`inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e] ${topAligned ? "mt-1" : "h-[30px]"}`}>
        <span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]" />
        {label}
      </span>
      <div className="flex min-h-[30px] flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

function SegmentButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[26px] rounded-[2px] px-3 text-[11px] transition-all ${
        active ? "bg-white text-[#1f2329]" : "text-[#646a73] hover:text-[#4e535a]"
      }`}
    >
      {children}
    </button>
  )
}

function ChipButton({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-[26px] items-center rounded-[2px] border px-3 text-[11px] transition-all ${
        active
          ? "border-[#b3d4ff] bg-[#fafcff] text-[#3370ff]"
          : "border-[#e8eaed] bg-white text-[#646a73] hover:border-[#c0c4cc]"
      }`}
    >
      {children}
    </button>
  )
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string
  sortKey: CourseSortKey
  activeKey: CourseSortKey
  direction: SortDirection
  onSort: (key: CourseSortKey) => void
}) {
  const numericKeys: CourseSortKey[] = ["participant_count", "new_count", "old_count", "daily_transaction_amount"]
  const nextDirection = activeKey === sortKey
    ? direction === "asc" ? "降序" : "升序"
    : numericKeys.includes(sortKey) ? "降序" : "升序"
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex max-w-full cursor-pointer select-none items-center gap-1 text-left text-[#8f959e]"
      title={`按${label}${nextDirection}排列`}
    >
      <span className="truncate">{label}</span>
      <span className="inline-flex shrink-0 flex-col leading-none">
        <span className={`text-[8px] ${activeKey === sortKey && direction === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
        <span className={`-mt-[1px] text-[8px] ${activeKey === sortKey && direction === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
      </span>
    </button>
  )
}

export default function CourseStatisticsPage() {
  const currentDate = useMemo(() => new Date(), [])
  const initialRange = useMemo(() => getMonthRange(currentDate), [currentDate])
  const [rangeMode, setRangeMode] = useState<RangeMode>("month")
  const [dateFrom, setDateFrom] = useState(initialRange.from)
  const [dateTo, setDateTo] = useState(initialRange.to)
  const [granularity, setGranularity] = useState<Granularity>("day")
  const [organizationId, setOrganizationId] = useState("")
  const [activityType, setActivityType] = useState("all")
  const [selectedCourseSubtype, setSelectedCourseSubtype] = useState("")
  const [teacherId, setTeacherId] = useState("")
  const [data, setData] = useState<CourseStatistics | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [selectedTrendPeriod, setSelectedTrendPeriod] = useState<string | null>(null)
  const [courseSort, setCourseSort] = useState<{
    key: CourseSortKey
    direction: SortDirection
  }>({ key: "date", direction: "desc" })
  const [participantDialog, setParticipantDialog] = useState<{
    course: CourseRow
    group: ParticipantGroup
  } | null>(null)
  const [visibleTrendLines, setVisibleTrendLines] = useState<Record<string, boolean>>({
    course_count: true,
    class_hours: true,
    participant_count: true,
    transaction_amount: true,
  })
  const subtypeCardsRef = useRef<HTMLDivElement>(null)
  const supportsSubtype = activityType === "class" || activityType === "ics"

  const applyRangeMode = (mode: RangeMode) => {
    setRangeMode(mode)
    const range = mode === "month" ? getMonthRange(currentDate) : getYearRange(currentDate)
    setDateFrom(range.from)
    setDateTo(range.to)
    setGranularity(mode === "month" ? "day" : "month")
  }

  const selectActivityType = (nextType: string) => {
    setActivityType(nextType)
    setSelectedCourseSubtype("")
  }

  const selectOrganization = (nextOrganizationId: string) => {
    setOrganizationId(nextOrganizationId)
    setTeacherId("")
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const result = await statisticsApi.courses({
        date_from: dateFrom,
        date_to: dateTo,
        granularity,
        organization_id: organizationId || undefined,
        activity_type: activityType,
        course_subtype: supportsSubtype ? selectedCourseSubtype || undefined : undefined,
        teacher_id: teacherId || undefined,
      })
      setData(result)
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [activityType, dateFrom, dateTo, granularity, organizationId, selectedCourseSubtype, supportsSubtype, teacherId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    setSelectedTrendPeriod(null)
  }, [activityType, dateFrom, dateTo, granularity, organizationId, selectedCourseSubtype, teacherId])

  // 首次进入页面才显示加载占位；筛选或卡片切换时保留现有内容并静默刷新，避免页面闪烁。
  const initialLoading = loading && data === null
  const initialLoadFailed = loadFailed && data === null

  const activityTypes = data?.activity_types?.length ? data.activity_types : DEFAULT_ACTIVITY_TYPES
  const statistics = useMemo(() => {
    const items = data?.statistics || []
    if (supportsSubtype) {
      const subtypeItems = data?.selected_activity_type === activityType
        ? data?.subtype_statistics || (activityType === "class" ? data?.salon_subtype_statistics : []) || []
        : []
      return [
        {
          type: "all",
          label: activityType === "class" ? "全部沙龙" : "全部内部课程",
          course_count: subtypeItems.reduce((sum, item) => sum + item.course_count, 0),
          class_hours: subtypeItems.reduce((sum, item) => sum + item.class_hours, 0),
          participant_count: subtypeItems.reduce((sum, item) => sum + item.participant_count, 0),
        },
        ...subtypeItems,
      ]
    }
    if (activityType !== "all" || items.length === 0) return items
    return [
      {
        type: "all",
        label: "全部",
        course_count: items.reduce((sum, item) => sum + item.course_count, 0),
        class_hours: items.reduce((sum, item) => sum + item.class_hours, 0),
        participant_count: items.reduce((sum, item) => sum + item.participant_count, 0),
      },
      ...items,
    ]
  }, [activityType, data?.salon_subtype_statistics, data?.selected_activity_type, data?.statistics, data?.subtype_statistics, supportsSubtype])

  const selectedSubtypeLabel = useMemo(() => {
    if (!supportsSubtype) return ""
    if (!selectedCourseSubtype) return activityType === "class" ? "全部沙龙" : "全部内部课程"
    return data?.subtype_statistics.find((item) => item.type === selectedCourseSubtype)?.label || selectedCourseSubtype
  }, [activityType, data?.subtype_statistics, selectedCourseSubtype, supportsSubtype])
  const cardStatistics = useMemo(
    () => activityType === "all" ? statistics.filter((item) => item.type !== "all") : statistics,
    [activityType, statistics],
  )

  const trendData = useMemo(() => data?.trend || [], [data?.trend])
  const trendHasData = trendData.some((item) => (
    item.course_count > 0
    || item.class_hours > 0
    || item.participant_count > 0
    || item.transaction_amount > 0
  ))
  const teacherChartData = useMemo(() => data?.teacher_statistics || [], [data?.teacher_statistics])
  const teacherHasData = teacherChartData.some((item) => (
    item.course_count > 0
    || item.class_hours > 0
    || item.participant_count > 0
    || item.transaction_amount > 0
  ))
  const trendCountYAxisWidth = useMemo(
    () => calcYAxisWidth(trendData, ["course_count", "class_hours", "participant_count"]),
    [trendData],
  )
  const trendAmountYAxisWidth = useMemo(
    () => calcYAxisWidth(trendData, ["transaction_amount"]),
    [trendData],
  )
  const teacherCountYAxisWidth = useMemo(
    () => calcYAxisWidth(teacherChartData, ["course_count", "class_hours", "participant_count"]),
    [teacherChartData],
  )
  const teacherAmountYAxisWidth = useMemo(
    () => calcYAxisWidth(teacherChartData, ["transaction_amount"]),
    [teacherChartData],
  )
  const courses = useMemo(() => data?.courses || [], [data?.courses])
  const periodCourses = useMemo(() => selectedTrendPeriod
    ? courses.filter((course) => getCoursePeriodKey(course.date, granularity) === selectedTrendPeriod)
    : courses,
  [courses, granularity, selectedTrendPeriod])
  const sortedCourses = useMemo(() => [...periodCourses].sort((left, right) => {
    let comparison = 0
    if (courseSort.key === "date") {
      comparison = `${left.date} ${left.start_time}`.localeCompare(`${right.date} ${right.start_time}`)
    } else if (courseSort.key === "teachers") {
      comparison = left.teachers.join("、").localeCompare(right.teachers.join("、"), "zh-CN")
    } else if (courseSort.key === "activity_type_label") {
      comparison = left.activity_type_label.localeCompare(right.activity_type_label, "zh-CN")
    } else {
      comparison = left[courseSort.key] - right[courseSort.key]
    }
    if (comparison === 0) {
      comparison = `${left.date} ${left.start_time}`.localeCompare(`${right.date} ${right.start_time}`)
    }
    return courseSort.direction === "asc" ? comparison : -comparison
  }), [courseSort, periodCourses])
  const {
    paginatedItems: paginatedCourses,
    currentPage,
    totalPages,
    totalItems,
    goToPage,
    startIndex,
    endIndex,
  } = usePagination(sortedCourses, { pageSize: 10 })
  const handleCourseSort = (key: CourseSortKey) => {
    setCourseSort((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === "asc" ? "desc" : "asc" }
      }
      const numericKeys: CourseSortKey[] = ["participant_count", "new_count", "old_count", "daily_transaction_amount"]
      return { key, direction: numericKeys.includes(key) ? "desc" : "asc" }
    })
    goToPage(1)
  }
  const handleTrendPeriodSelect = (period: string) => {
    setSelectedTrendPeriod(period)
    goToPage(1)
  }
  const clearTrendPeriod = () => {
    setSelectedTrendPeriod(null)
    goToPage(1)
  }
  const scrollSubtypeCards = (direction: "left" | "right") => {
    subtypeCardsRef.current?.scrollBy({
      left: direction === "left" ? -480 : 480,
      behavior: "smooth",
    })
  }
  const dialogParticipants = useMemo(() => {
    if (!participantDialog) return []
    if (participantDialog.group === "new") {
      return participantDialog.course.participants.filter((participant) => participant.identity_group === "新人")
    }
    if (participantDialog.group === "old") {
      return participantDialog.course.participants.filter((participant) => participant.identity_group !== "新人")
    }
    return participantDialog.course.participants
  }, [participantDialog])
  const dateRangeLabel = `${formatRangeDate(dateFrom)}~${formatRangeDate(dateTo)}`

  return (
    <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4">
      <section className="rounded-xl bg-white px-[22px] py-4">
        <h1 className="mb-3 text-lg font-medium text-[#1f2329]">课程</h1>

        <div className="flex flex-col gap-2.5">
          <div>
            <FilterRow label="统计范围">
              <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-[2px]">
                <SegmentButton active={rangeMode === "month"} onClick={() => applyRangeMode("month")}>按月</SegmentButton>
                <SegmentButton active={rangeMode === "year"} onClick={() => applyRangeMode("year")}>按年</SegmentButton>
              </div>
              <div className="-ml-[5px] flex items-center rounded-[4px] bg-[#f0f1f3] p-[2px]">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  className="h-[26px] rounded-[2px] border-none bg-white pl-2 pr-1 text-[11px] outline-none"
                />
                <span className="flex h-[26px] items-center bg-white px-1 text-[11px] text-[#8f959e]">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  className="h-[26px] rounded-[2px] border-none bg-white pl-2 pr-1 text-[11px] outline-none"
                />
              </div>
              <div className="ml-1 flex items-center gap-2">
                <span className="text-[12px] text-[#8f959e]">时间单位</span>
                <HintTooltip>
                  <TooltipTrigger
                    render={(
                      <button
                        type="button"
                        aria-label="查看时间单位说明"
                        className="inline-flex h-4 w-4 items-center justify-center text-[#b7bdc6] transition-colors hover:text-[#8f959e]"
                      >
                        <CircleAlert className="h-3.5 w-3.5" />
                      </button>
                    )}
                  />
                  <TooltipContent>时间单位的选择仅影响折线图的横坐标的时间分布</TooltipContent>
                </HintTooltip>
                <div className="flex items-center rounded-[4px] bg-[#f0f1f3] p-[2px]">
                  {rangeMode === "month" && (
                    <SegmentButton active={granularity === "day"} onClick={() => setGranularity("day")}>日</SegmentButton>
                  )}
                  <SegmentButton active={granularity === "week"} onClick={() => setGranularity("week")}>周</SegmentButton>
                  <SegmentButton active={granularity === "month"} onClick={() => setGranularity("month")}>月</SegmentButton>
                </div>
              </div>
            </FilterRow>
          </div>

          <div className="flex flex-col gap-2">
            <FilterRow label="活动类型" topAligned>
              <div className="flex flex-wrap items-center rounded-[4px] bg-[#f0f1f3] p-[2px]">
                <SegmentButton active={activityType === "all"} onClick={() => selectActivityType("all")}>全部</SegmentButton>
                {activityTypes.map((type) => (
                  <SegmentButton
                    key={type.value}
                    active={activityType === type.value}
                    onClick={() => selectActivityType(type.value)}
                  >
                    {type.label}
                  </SegmentButton>
                ))}
              </div>
            </FilterRow>

            <FilterRow label="所属组织" topAligned>
              <div className="flex flex-wrap items-center rounded-[4px] bg-[#f0f1f3] p-[2px]">
                <SegmentButton active={!organizationId} onClick={() => selectOrganization("")}>全部</SegmentButton>
                {data?.organizations.map((organization) => (
                  <SegmentButton
                    key={organization.id}
                    active={organizationId === organization.id}
                    onClick={() => selectOrganization(organization.id)}
                  >
                    {organization.name}
                  </SegmentButton>
                ))}
              </div>
            </FilterRow>

            <FilterRow label="老师" topAligned>
              <ChipButton active={!teacherId} onClick={() => setTeacherId("")}>全部</ChipButton>
              {data?.teachers.map((teacher) => (
                <ChipButton
                  key={teacher.id}
                  active={teacherId === teacher.id}
                  onClick={() => setTeacherId(teacher.id)}
                >
                  {teacher.name}
                </ChipButton>
              ))}
            </FilterRow>
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white px-[22px] py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-medium text-[#2b2f36]">课程统计</h2>
            <p className="mt-1 text-[12px] text-[#8f959e]">
              课时统计口径：沙龙活动按课表扣卡次数计算，能量结按课表销卡次数计算
            </p>
          </div>
          {supportsSubtype && cardStatistics.length > 1 && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => scrollSubtypeCards("left")}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc] hover:bg-[#f7f8fa]"
                title="向左查看更多课程类型"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollSubtypeCards("right")}
                className="flex h-7 w-7 items-center justify-center rounded-[4px] border border-[#e8eaed] text-[#646a73] hover:border-[#c0c4cc] hover:bg-[#f7f8fa]"
                title="向右查看更多课程类型"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {initialLoadFailed ? (
          <div className="py-16 text-center text-[14px] text-[#8f959e]">课程加载失败，请稍后重试</div>
        ) : initialLoading ? (
          <div className="py-16 text-center text-[14px] text-[#8f959e]">加载中...</div>
        ) : statistics.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-[#8f959e]">暂无课程</div>
        ) : (
          <div className="space-y-2">
            {activityType === "all" && statistics[0]?.type === "all" && (
              <article className="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[4px] border border-[#cfdcff] bg-[#f6f8ff] px-4 py-3">
                <div className="min-w-[88px] border-r border-[#dbe4ff] pr-5">
                  <div className="text-[11px] text-[#3370ff]">汇总</div>
                  <h3 className="mt-0.5 text-[14px] font-medium text-[#1f2329]">全部课程</h3>
                </div>
                {[
                  ["课程数", statistics[0].course_count],
                  ["课时数", statistics[0].class_hours],
                  ["参与人数", statistics[0].participant_count],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-[90px]">
                    <div className="text-[16px] font-medium tabular-nums text-[#1f2329]">{value}</div>
                    <div className="mt-0.5 text-[11px] text-[#8f959e]">{label}</div>
                  </div>
                ))}
              </article>
            )}

            <div
              ref={supportsSubtype ? subtypeCardsRef : undefined}
              className={supportsSubtype
                ? "flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                : `grid gap-2 ${cardStatistics.length === 1 ? "max-w-[540px] grid-cols-1" : "grid-cols-1 lg:grid-cols-2 xl:grid-cols-3"}`}
            >
              {cardStatistics.map((item) => {
                const isSubtypeCard = supportsSubtype
                const isSelected = isSubtypeCard && item.type === (selectedCourseSubtype || "all")
                return (
                <button
                  key={item.type}
                  type="button"
                  disabled={!isSubtypeCard}
                  aria-pressed={isSubtypeCard ? isSelected : undefined}
                  onClick={() => {
                    if (!isSubtypeCard) return
                    setSelectedCourseSubtype(item.type === "all" ? "" : item.type)
                    goToPage(1)
                  }}
                  className={`rounded-[4px] border px-3.5 py-2.5 text-left transition-colors ${
                    isSelected
                      ? "border-[#b3d4ff] bg-[#fafcff]"
                      : "border-[#e8e8e8] bg-white"
                  } ${isSubtypeCard ? "w-[220px] shrink-0 snap-start cursor-pointer hover:border-[#b3d4ff]" : "cursor-default"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className={`shrink-0 text-[13px] font-medium ${isSelected ? "text-[#3370ff]" : "text-[#2b2f36]"}`}>{item.label}</h3>
                    <span className={`h-px flex-1 ${isSelected ? "bg-[#dbe4ff]" : "bg-[#f0f0f0]"}`} />
                  </div>
                  <div className="mt-2 grid grid-cols-3">
                    {[
                      ["课程数", item.course_count],
                      ["课时数", item.class_hours],
                      ["参与人数", item.participant_count],
                    ].map(([label, value], index) => (
                      <div key={label} className={index === 0 ? "" : "border-l border-[#f0f0f0] pl-3"}>
                        <div className="truncate text-[15px] font-medium tabular-nums text-[#1f2329]" title={String(value)}>{value}</div>
                        <div className="mt-0.5 text-[11px] text-[#8f959e]">{label}</div>
                      </div>
                    ))}
                  </div>
                </button>
                )
              })}
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-1.5 xl:grid-cols-2">
        <div className="min-w-0 rounded-xl bg-white px-[22px] py-4 select-none *:outline-none *:focus:outline-none">
          <div className="mb-[18px]">
            <div className="mb-2 text-[12px] text-[#4e535a]">
              <span className="font-medium">每{granularity === "day" ? "日" : granularity === "week" ? "周" : "月"}课程变化</span>
              {selectedSubtypeLabel && <span className="text-[#646a73]"> · {selectedSubtypeLabel}</span>}
              <span className="text-[#8f959e]">（{dateRangeLabel}）</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {TREND_METRICS.map((metric) => {
                const visible = visibleTrendLines[metric.key]
                return (
                  <button
                    key={metric.key}
                    type="button"
                    onClick={() => setVisibleTrendLines((current) => ({ ...current, [metric.key]: !visible }))}
                    className="flex items-center gap-1"
                  >
                    <span
                      className="flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none text-white"
                      style={{ borderColor: visible ? metric.color : "#c8ccd0", backgroundColor: visible ? metric.color : "transparent" }}
                    >
                      {visible && "✓"}
                    </span>
                    <span className="text-[11px]" style={{ color: visible ? metric.color : "#c8ccd0" }}>{metric.label}</span>
                  </button>
                )
              })}
              <span className="text-[12px] text-[#8f959e]">点击时间点筛选下方课程</span>
            </div>
          </div>

          {initialLoading ? (
            <div className="flex h-[180px] items-center justify-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : !trendHasData ? (
            <div className="flex h-[180px] items-center justify-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={180} tabIndex={-1}>
              <ComposedChart
                data={trendData}
                margin={{ top: 10, right: 10, left: 0, bottom: 2 }}
                onClick={(state) => {
                  if (state.activeLabel !== undefined) {
                    handleTrendPeriodSelect(String(state.activeLabel))
                  }
                }}
                style={{ cursor: "pointer" }}
              >
                <defs>
                  {TREND_METRICS.map((metric) => (
                    <linearGradient key={metric.key} id={`course-trend-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metric.color} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={metric.color} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  tickLine={false}
                  axisLine={{ stroke: "#d0d3d6" }}
                  height={20}
                  interval={granularity === "month" ? 0 : Math.max(0, Math.floor(trendData.length / 8))}
                  tickFormatter={(value) => {
                    const period = String(value)
                    if (granularity === "day") {
                      const [, month, day] = period.split("-")
                      return `${month}/${day}`
                    }
                    if (granularity === "month") return `${Number(period.split("-")[1])}月`
                    return `W${period.split("-W")[1]}`
                  }}
                />
                <YAxis
                  yAxisId="count"
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  width={trendCountYAxisWidth}
                />
                <YAxis
                  yAxisId="amount"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  tickLine={false}
                  axisLine={false}
                  width={trendAmountYAxisWidth}
                  tickFormatter={(value) => Number(value) >= 10000 ? `${Math.round(Number(value) / 10000)}万` : String(value)}
                />
                <Tooltip
                  labelFormatter={(label) => formatCoursePeriod(String(label), granularity)}
                  formatter={(value, name) => {
                    const metric = TREND_METRICS.find((item) => item.key === name)
                    const formattedValue = name === "transaction_amount"
                      ? `¥${Number(value).toLocaleString("zh-CN")}`
                      : `${value}${name === "participant_count" ? "人" : ""}`
                    return [formattedValue, metric?.label || name]
                  }}
                  contentStyle={{ fontSize: 12, border: "1px solid #e8eaed", borderRadius: 4 }}
                />
                {selectedTrendPeriod && (
                  <ReferenceLine
                    yAxisId="count"
                    x={selectedTrendPeriod}
                    stroke="#3370ff"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                )}
                {TREND_METRICS.map((metric) => visibleTrendLines[metric.key] && (
                  <Area key={`area-${metric.key}`} yAxisId={metric.axis} type="monotone" dataKey={metric.key} fill={`url(#course-trend-${metric.key})`} stroke="none" tooltipType="none" />
                ))}
                {TREND_METRICS.map((metric) => visibleTrendLines[metric.key] && (
                  <Line key={metric.key} yAxisId={metric.axis} type="monotone" dataKey={metric.key} name={metric.key} stroke={metric.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="min-w-0 rounded-xl bg-white px-[22px] py-4 select-none *:outline-none *:focus:outline-none">
          <div className="mb-[18px]">
            <div className="mb-2 text-[12px] text-[#4e535a]">
              <span className="font-medium">老师课程与成交数据</span>
              {selectedSubtypeLabel && <span className="text-[#646a73]"> · {selectedSubtypeLabel}</span>}
              <span className="text-[#8f959e]">（{dateRangeLabel}）</span>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {TEACHER_METRICS.map((metric) => (
                <span key={metric.key} className="flex items-center gap-1 text-[11px] text-[#646a73]">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: metric.color }} />
                  {metric.label}
                </span>
              ))}
              <span className="text-[11px] text-[#b0b5bd]">
                {selectedSubtypeLabel ? `已按${selectedSubtypeLabel}筛选` : "仅随统计范围变化"}
              </span>
            </div>
          </div>

          {initialLoading ? (
            <div className="flex h-[180px] items-center justify-center text-[12px] text-[#8f959e]">加载中...</div>
          ) : !teacherHasData ? (
            <div className="flex h-[180px] items-center justify-center text-[12px] text-[#8f959e]">暂无数据</div>
          ) : (
            <ResponsiveContainer width="100%" height={180} tabIndex={-1}>
              <BarChart data={teacherChartData} margin={{ top: 10, right: 0, left: 0, bottom: 2 }} barGap={1}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8eaed" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#b0b5bd" }}
                  axisLine={false}
                  tickLine={false}
                  height={20}
                  interval={0}
                  tickFormatter={(value) => String(value).length > 4 ? `${String(value).slice(0, 4)}...` : String(value)}
                />
                <YAxis
                  yAxisId="count"
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  width={teacherCountYAxisWidth}
                />
                <YAxis
                  yAxisId="amount"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#b0b5bd" }}
                  axisLine={false}
                  tickLine={false}
                  width={teacherAmountYAxisWidth}
                  tickFormatter={(value) => Number(value) >= 10000 ? `${Math.round(Number(value) / 10000)}万` : String(value)}
                />
                <Tooltip
                  formatter={(value, name) => [
                    name === "成交额" ? `¥${Number(value).toLocaleString("zh-CN")}` : value,
                    name,
                  ]}
                  contentStyle={{ fontSize: 12, border: "1px solid #e8eaed", borderRadius: 4 }}
                  cursor={{ fill: "transparent" }}
                />
                <Bar yAxisId="count" dataKey="course_count" name="课程数" fill="#3370ff" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar yAxisId="count" dataKey="class_hours" name="课时数" fill="#00a6a6" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar yAxisId="count" dataKey="participant_count" name="参与人数" fill="#f5a623" radius={[2, 2, 0, 0]} barSize={8} />
                <Bar yAxisId="amount" dataKey="transaction_amount" name="成交额" fill="#7b61ff" radius={[2, 2, 0, 0]} barSize={8} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl bg-white">
        <div className="flex items-start justify-between gap-4 border-b border-[#f0f0f0] px-[22px] py-4">
          <div>
            <h2 className="text-[13px] font-medium text-[#2b2f36]">课程明细</h2>
            <p className="mt-1 text-[12px] text-[#8f959e]">
              {selectedTrendPeriod
                ? `${formatCoursePeriod(selectedTrendPeriod, granularity)}，已按折线图时间点筛选${selectedSubtypeLabel ? ` · ${selectedSubtypeLabel}` : ""}`
                : `${dateRangeLabel}${selectedSubtypeLabel ? ` · ${selectedSubtypeLabel}` : ""}，按上课日期和时间由近到远排列`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {selectedTrendPeriod && (
              <button
                type="button"
                onClick={clearTrendPeriod}
                className="text-[12px] text-[#3370ff] hover:underline"
              >
                查看全部
              </button>
            )}
            <span className="text-[12px] text-[#8f959e]">共 {periodCourses.length} 场</span>
          </div>
        </div>

        {initialLoading ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">加载中...</div>
        ) : initialLoadFailed ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">课程明细加载失败，请稍后重试</div>
        ) : periodCourses.length === 0 ? (
          <div className="py-16 text-center text-[12px] text-[#8f959e]">
            {selectedTrendPeriod ? "该时间周期暂无课程" : "暂无课程"}
          </div>
        ) : (
          <div className="min-w-0">
            <table className="w-full table-fixed border-collapse text-left">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col style={{ width: "calc(18% - 60px)" }} />
                <col className="w-[9%]" />
                <col className="w-[6%]" />
                <col style={{ width: "calc(11% + 60px)" }} />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
                <col className="w-[11%]" />
              </colgroup>
              <thead>
                <tr className="h-9 border-b border-[#f0f0f0] bg-[#fafafa] text-[11px] font-normal text-[#8f959e]">
                  <th className="px-3 font-normal">
                    <SortableHeader label="上课日期" sortKey="date" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">上课时间</th>
                  <th className="px-3 font-normal">课程</th>
                  <th className="px-3 font-normal">
                    <SortableHeader label="课程类型" sortKey="activity_type_label" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">课时</th>
                  <th className="px-3 font-normal">
                    <SortableHeader label="老师/成就君" sortKey="teachers" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">
                    <SortableHeader label="参与人数" sortKey="participant_count" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">
                    <SortableHeader label="新人人数" sortKey="new_count" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">
                    <SortableHeader label="老人人数" sortKey="old_count" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                  </th>
                  <th className="px-3 font-normal">
                    <div className="flex justify-end">
                      <SortableHeader label="当日成交金额" sortKey="daily_transaction_amount" activeKey={courseSort.key} direction={courseSort.direction} onSort={handleCourseSort} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedCourses.map((course) => {
                  const timeLabel = course.start_time
                    ? `${course.start_time}${course.end_time ? `~${course.end_time}` : ""}`
                    : ""
                  const renderCount = (count: number, group: ParticipantGroup) => count > 0 ? (
                    <button
                      type="button"
                      onClick={() => setParticipantDialog({ course, group })}
                      className="font-normal tabular-nums text-[#4e535a] hover:underline"
                    >
                      {count}人
                    </button>
                  ) : (
                    <EmptyValue />
                  )
                  return (
                    <tr key={course.id} className="h-11 border-b border-[#f0f0f0] text-[12px] text-[#4e535a] last:border-b-0 hover:bg-[#f7f8fa]">
                      <td className="truncate px-3 tabular-nums" title={course.date || undefined}>{course.date || <EmptyValue />}</td>
                      <td className="truncate px-3 tabular-nums" title={timeLabel || undefined}>{timeLabel || <EmptyValue />}</td>
                      <td className="truncate px-3 font-medium text-[#2b2f36]" title={course.name || undefined}>{course.name || <EmptyValue />}</td>
                      <td className="truncate px-3" title={course.activity_type_label || undefined}>{course.activity_type_label || <EmptyValue />}</td>
                      <td className="truncate px-3 tabular-nums">{course.class_hours}</td>
                      <td className="truncate px-3" title={course.teachers.join("、") || undefined}>{course.teachers.join("、") || <EmptyValue />}</td>
                      <td className="truncate px-3">{renderCount(course.participant_count, "all")}</td>
                      <td className="truncate px-3">{renderCount(course.new_count, "new")}</td>
                      <td className="truncate px-3">{renderCount(course.old_count, "old")}</td>
                      <td className="truncate px-3 text-right tabular-nums">
                        ¥{(course.daily_transaction_amount ?? 0).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={goToPage}
              unit="场"
            />
          </div>
        )}
      </section>

      <Dialog
        open={!!participantDialog}
        onOpenChange={(open) => { if (!open) setParticipantDialog(null) }}
      >
        <DialogContent className="flex max-h-[70vh] max-w-[900px] flex-col gap-0 overflow-hidden p-0" initialFocus={false}>
          <div className="border-b border-[#f0f0f0] px-5 py-3.5 pr-12">
            <div className="text-[14px] font-medium text-[#1f2329]">
              {participantDialog?.group === "new"
                ? "新人名单"
                : participantDialog?.group === "old"
                  ? "老人名单"
                  : "参与者名单"}
            </div>
            {participantDialog && (
              <div className="mt-1 truncate text-[11px] text-[#8f959e]">
                {participantDialog.course.date} · {participantDialog.course.name} · 共 {dialogParticipants.length} 人
              </div>
            )}
          </div>
          {dialogParticipants.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-[#8f959e]">暂无人员</div>
          ) : (
            <div className="min-h-0 overflow-y-auto">
              <table className="w-full table-fixed border-collapse text-left">
                <colgroup>
                  <col className="w-[14%]" />
                  <col className="w-[15%]" />
                  <col className="w-[13%]" />
                  <col className="w-[27%]" />
                  <col className="w-[14%]" />
                  <col className="w-[17%]" />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-[#fafafa]">
                  <tr className="h-9 border-b border-[#f0f0f0] text-[11px] text-[#8f959e]">
                    <th className="px-3 font-normal">昵称</th>
                    <th className="px-3 font-normal">会员身份</th>
                    <th className="px-3 font-normal">参与身份</th>
                    <th className="px-3 font-normal">来访需求</th>
                    <th className="px-3 text-right font-normal">当天成交金额</th>
                    <th className="px-3 font-normal">成交人</th>
                  </tr>
                </thead>
                <tbody>
                  {dialogParticipants.map((participant) => (
                    <tr key={participant.id} className="min-h-11 border-b border-[#f0f0f0] text-[12px] text-[#4e535a] last:border-b-0 hover:bg-[#f7f8fa]">
                      <td className="truncate px-3 py-2.5 font-medium text-[#2b2f36]" title={participant.nickname}>{participant.nickname}</td>
                      <td className="truncate px-3 py-2.5" title={participant.member_type || undefined}>{participant.member_type || <EmptyValue />}</td>
                      <td className="truncate px-3 py-2.5">{participant.participation_role || "参与者"}</td>
                      <td className="break-words px-3 py-2.5 leading-5" title={participant.daily_need || undefined}>{participant.daily_need || <EmptyValue />}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        ¥{participant.daily_transaction_amount.toLocaleString("zh-CN")}
                      </td>
                      <td className="truncate px-3 py-2.5" title={participant.closers || undefined}>{participant.closers || <EmptyValue />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
