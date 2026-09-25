import type { PrincipalRow } from "@/lib/api"
import { EmptyValue } from "@/components/empty-value"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

type CourseGroup = { key: string; name: string; type: string; rows: PrincipalRow[] }
type DayGroup = { date: string; courses: CourseGroup[] }

function groupByDayAndCourse(rows: PrincipalRow[]): DayGroup[] {
  const days = new Map<string, Map<string, CourseGroup>>()
  for (const row of rows) {
    const date = String(row.date ?? "")
    const courseKey = String(row.course_id || row.name || row.id)
    if (!days.has(date)) days.set(date, new Map())
    const courses = days.get(date)!
    if (!courses.has(courseKey)) courses.set(courseKey, { key: courseKey, name: String(row.name || "未命名课程"), type: String(row.type || ""), rows: [] })
    courses.get(courseKey)!.rows.push(row)
  }
  return [...days].map(([date, courses]) => ({
    date,
    courses: [...courses.values()].map(course => ({
      ...course,
      rows: course.rows.sort((left, right) => Number(right.participant_role === "案主") - Number(left.participant_role === "案主")),
    })),
  }))
}

function dayLabel(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return { short: date || "未设置日期", full: date || "未设置日期" }
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("zh-CN", { weekday: "short" })
  return { short: `${match[2]}.${match[3]}`, full: `${match[1]}年${Number(match[2])}月${Number(match[3])}日 · ${weekday}` }
}

const textOf = (row: PrincipalRow, field: "visit_need" | "customer_info" | "follow_up") =>
  String(row[field] ?? "").trim()

function feedbackTextOf(row: PrincipalRow, field: "visit_need" | "customer_info" | "follow_up") {
  const rawEntries: unknown = row[`${field}_entries`]
  if (Array.isArray(rawEntries) && rawEntries.length) {
    return rawEntries
      .filter((entry): entry is { author?: string; content: string } => !!entry && typeof entry.content === "string" && !!entry.content.trim())
      .map(entry => `${entry.author?.trim() || "反馈人未记录"}：${entry.content.trim()}`)
      .join("\n")
  }
  return textOf(row, field)
}

const FEEDBACK_FIELDS = [
  { key: "visit_need", creatorKey: "visit_need_creators", entriesKey: "visit_need_entries", label: "来访需求" },
  { key: "customer_info", creatorKey: "customer_info_creators", entriesKey: "customer_info_entries", label: "客户信息" },
  { key: "follow_up", creatorKey: "follow_up_creators", entriesKey: "follow_up_entries", label: "跟进点" },
] as const

type FeedbackEntry = { content: string; author: string; at: string; created_by: string }

function formatFeedbackDate(value: string): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).replaceAll("/", "-")
}

export function TeacherFollowUpDialog({ row, onClose }: { row: PrincipalRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!row} onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent initialFocus={false} className="flex max-h-[82vh] w-[700px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border border-[#e8eaed] bg-white p-0 shadow-[0_12px_36px_rgba(31,35,41,.12)]">
        <DialogHeader className="shrink-0 border-b border-[#eceef0] py-4 pl-6 pr-14">
          <DialogTitle className="text-[16px] font-medium leading-6 text-[#1f2329]">{String(row?.customer || "人员")}的课程反馈</DialogTitle>
          <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">
            {[row?.participant_role === "案主" ? "案主" : "", row?.date, row?.type, row?.name].filter(Boolean).map(String).join(" · ")}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          {FEEDBACK_FIELDS.map(field => {
            const content = row ? textOf(row, field.key) : ""
            const creators = String(row?.[field.creatorKey] ?? "").trim()
            const rawEntries: unknown = row?.[field.entriesKey]
            const entries: FeedbackEntry[] = Array.isArray(rawEntries)
              ? rawEntries.filter((entry): entry is FeedbackEntry => !!entry && typeof entry.content === "string")
              : []
            return (
              <section key={field.key} className="overflow-hidden rounded-[6px] border border-[#e9ebed] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#f0f1f3] bg-[#f8f9fa] px-4 py-2.5">
                  <h3 className="text-[12px] font-medium text-[#4e535a]">{field.label}</h3>
                </div>
                <div className="min-h-14 px-4 py-3">
                  {entries.length ? entries.map((entry, index) => (
                    <div key={index} className="border-b border-[#f0f1f3] py-2.5 first:pt-0 last:border-b-0 last:pb-0">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-[#2b2f36]" title={entry.author}><span className="text-[#8f959e]">反馈人：</span>{entry.author || String(row?.teachers || "未记录")}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-right text-[11px] text-[#8f959e]">
                          {entry.at && <span className="tabular-nums">{formatFeedbackDate(entry.at)}</span>}
                          {entry.created_by && <span className="max-w-[145px] truncate" title={`创建人：${entry.created_by}`}>创建人：{entry.created_by}</span>}
                        </span>
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#4e535a]">{entry.content}</p>
                    </div>
                  )) : (
                    <div>
                      {content && <div className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[11px] text-[#2b2f36]"><span className="text-[#8f959e]">反馈人：</span>{String(row?.teachers || "未记录")}</span>
                        <span className="ml-auto flex shrink-0 items-center gap-2 text-right text-[11px] text-[#8f959e]">
                          {row?.date && <span className="tabular-nums">{String(row.date)}</span>}
                          {creators && <span className="max-w-[145px] truncate" title={`创建人：${creators}`}>创建人：{creators}</span>}
                        </span>
                      </div>}
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] leading-6 text-[#4e535a]">{content || <EmptyValue />}</p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TeacherFollowUpList({ rows, loading, expanded, onOpenCustomer, onOpenDetail }: {
  rows: PrincipalRow[]
  loading: boolean
  expanded: boolean
  onOpenCustomer: (row: PrincipalRow) => void
  onOpenDetail: (row: PrincipalRow) => void
}) {
  const days = groupByDayAndCourse(rows)

  if (!rows.length) {
    return <div className="py-16 text-center text-sm text-muted-foreground">{loading ? "加载中…" : "暂无符合条件的老师跟进记录"}</div>
  }

  return (
    <div className={`transition-opacity ${loading ? "opacity-55" : ""}`}>
      {days.map(day => {
        const date = dayLabel(day.date)
        const dayRows = day.courses.flatMap(course => course.rows)
        const teacherStats = new Map<string, { name: string; total: number; info: number; point: number }>()
        for (const row of dayRows) {
          const key = String(row.teacher_id || row.teachers || "未设置老师")
          const stats = teacherStats.get(key) || { name: String(row.teachers || "未设置老师"), total: 0, info: 0, point: 0 }
          stats.total += 1
          if (textOf(row, "customer_info")) stats.info += 1
          if (textOf(row, "follow_up")) stats.point += 1
          teacherStats.set(key, stats)
        }
        return (
          <section key={day.date} className="grid grid-cols-[116px_minmax(0,1fr)] border-b border-[#eceef0] last:border-b-0 sm:grid-cols-[142px_minmax(0,1fr)]">
            <div className="border-r border-[#eceef0] bg-[#fafbfc] px-3 py-4 sm:px-4">
              <strong className="block text-[15px] font-medium text-[#2b2f36]" title={date.full}>{date.short}</strong>
              <span className="mt-1 block text-[11px] leading-5 text-[#8f959e]">{date.full.split(" · ")[1] || ""} · {day.courses.length} 门课</span>
              <div className="mt-2 space-y-2">
                {[...teacherStats].map(([key, stats]) => (
                  <div key={key} className="border-t border-[#eceef0] pt-1.5 text-[11px] leading-[18px]">
                    <span className="block truncate text-[#4e535a]" title={stats.name}>{stats.name}</span>
                    <span className="block text-[#8f959e]">客户信息 <span className={stats.info < stats.total ? "text-[#bd803f]" : ""}>{stats.info}/{stats.total}</span></span>
                    <span className="block text-[#8f959e]">跟进点 <span className={stats.point < stats.total ? "text-[#bd803f]" : ""}>{stats.point}/{stats.total}</span></span>
                  </div>
                ))}
              </div>
            </div>
            <div className="min-w-0 space-y-3 px-3 py-3 sm:px-4">
              {day.courses.map(course => {
                const teachers = [...new Set(course.rows.map(row => String(row.teachers || "")).filter(Boolean))]
                const participants = new Set(course.rows.map(row => String(row.customer_id || row.customer || ""))).size
                return (
                  <div key={course.key} className="overflow-hidden rounded-[6px] border border-[#e9ebed] bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[#eef0f2] bg-[#f9fafb] px-3 py-2.5">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <strong className="min-w-0 truncate text-[13px] font-medium text-[#2b2f36]" title={teachers.join("、")}>{teachers.join("、") || "未设置老师"}</strong>
                        <span aria-hidden="true" className="shrink-0 text-[11px] text-[#c9cdd2]">·</span>
                        <span className="flex min-w-0 items-baseline gap-1.5 text-[12px]" title={`${course.type ? `${course.type} · ` : ""}${course.name}`}>
                          {course.type && <span className="max-w-[110px] shrink-0 truncate text-[#8f959e]">{course.type}</span>}
                          <span className="min-w-0 truncate text-[#4e535a]">{course.name}</span>
                        </span>
                      </div>
                      <span className="shrink-0 text-[11px] text-[#8f959e]">{participants} 位人员</span>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="min-w-[610px]">
                        <div className="grid grid-cols-[105px_repeat(3,minmax(0,1fr))] gap-2 border-b border-[#f0f0f0] px-3 py-2 text-[11px] text-[#8f959e]">
                          <span>人员</span><span>来访需求</span><span>客户信息</span><span>跟进点</span>
                        </div>
                        {course.rows.map(row => (
                          <div key={row.id} className="grid grid-cols-[105px_repeat(3,minmax(0,1fr))] gap-2 border-b border-[#f5f6f7] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#4e535a] last:border-b-0 hover:bg-[#fcfcfd]">
                            <div className="min-w-0">
                              {row.customer_id ? <button type="button" onClick={() => onOpenCustomer(row)} className="block max-w-full truncate text-left font-medium text-[#2b2f36] hover:underline" title={String(row.customer || "")}>{String(row.customer || "未命名")}</button>
                                : <span className="block truncate font-medium text-[#2b2f36]">{String(row.customer || "未命名")}</span>}
                              {row.participant_role === "案主" && <span className="mt-0.5 block text-[11px] text-[#8f959e]">案主</span>}
                            </div>
                            {(["visit_need", "customer_info", "follow_up"] as const).map(field => {
                              const content = feedbackTextOf(row, field)
                              return <div key={field} className="min-w-0">
                                {content ? <button type="button" onClick={() => onOpenDetail(row)} title={expanded ? "查看记录详情" : content}
                                  className={`block w-full text-left hover:underline ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>{content}</button> : <EmptyValue />}
                              </div>
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
