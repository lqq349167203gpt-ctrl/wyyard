// [已归档] 原“数据记录”页面内容，2026-08-01 起退出构建。
import { useState, useEffect, useMemo, useCallback, useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { classRecordApi, customerApi, type UnifiedRecord, type CustomerLight } from "@/lib/api"

function getWeekday(d: string): string {
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(d).getDay()]
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { start, end }
}

function parseEksNames(description: string | undefined): string[] {
  if (!description) return []
  try {
    const parsed = JSON.parse(description)
    if (Array.isArray(parsed)) return parsed.map((d: any) => d.name || "").filter(Boolean)
  } catch {}
  return []
}

const TYPE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  class: { label: "沙龙", bg: "bg-[#f8faff]", text: "text-[#3370ff]" },
  gcs:   { label: "觉醒", bg: "bg-[#f8f5ff]", text: "text-[#7c5cfc]" },
  ers:   { label: "情绪", bg: "bg-[#fff8f0]", text: "text-[#f59e0b]" },
  eks:   { label: "能量", bg: "bg-[#fefce8]", text: "text-[#ca8a04]" },
  ics:   { label: "内部", bg: "bg-[#f0fdf4]", text: "text-[#22c55e]" },
  ocr:   { label: "OH卡", bg: "bg-[#f0f7ff]", text: "text-[#2b7fff]" },
}

const ICS_COURSE_LABELS: Record<string, string> = {
  "疗愈师课程": "疗愈师课程", "疗愈师课程：自爱力构建": "疗愈师课程",
  "商业框架陪跑": "商业框架陪跑", "商业框架陪跑：自觉力提升": "商业框架陪跑",
  "落地赋能班": "落地赋能班", "落地赋能班：自洽力整合": "落地赋能班",
}

function getIcsLabel(courseType: string): string {
  if (ICS_COURSE_LABELS[courseType]) return ICS_COURSE_LABELS[courseType]
  if (courseType.startsWith("疗愈师")) return "疗愈师课程"
  if (courseType.startsWith("商业框架") || courseType.startsWith("陪跑")) return "商业框架陪跑"
  if (courseType.startsWith("落地赋能") || courseType.startsWith("赋能")) return "落地赋能班"
  return ""
}

export function ActivityRecordsContent({ embedded }: { embedded?: boolean }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [records, setRecords] = useState<UnifiedRecord[]>([])
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [loading, setLoading] = useState(true)
  const [calOpen, setCalOpen] = useState(false)
  const [calYear, setCalYear] = useState(year)
  const calRef = useRef<HTMLDivElement>(null)

  const { start, end } = useMemo(() => getMonthRange(year, month), [year, month])

  useEffect(() => {
    if (!calOpen) return
    const handler = (e: MouseEvent) => {
      if (calRef.current && !calRef.current.contains(e.target as Node)) setCalOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [calOpen])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [custs] = await Promise.all([
        customerApi.light().catch(() => [] as CustomerLight[]),
      ])
      setCustomers(custs)
    } catch {}

    try {
      const allRecords: UnifiedRecord[] = []
      let page = 1
      while (true) {
        const res = await classRecordApi.listUnified(page, 100, { start_date: start, end_date: end })
        allRecords.push(...res.items)
        if (allRecords.length >= res.total || res.items.length === 0) break
        page++
      }
      setRecords(allRecords)
    } catch {
      setRecords([])
    }
    setLoading(false)
  }, [start, end])

  useEffect(() => { loadData() }, [loadData])

  const customerMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers) map.set(c.id, c.nickname || c.name || "")
    return map
  }, [customers])

  const getName = (id: string) => customerMap.get(id) || id

  // Group records by date
  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedRecord[]>()
    for (const r of records) {
      const list = map.get(r.date) || []
      list.push(r)
      map.set(r.date, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.data.start_time || "").localeCompare(b.data.start_time || ""))
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [records])

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const selectMonth = (m: number) => {
    setYear(calYear)
    setMonth(m)
    setCalOpen(false)
  }

  return (
    <div className={embedded ? "space-y-4" : "px-6 pt-4 pb-6 space-y-4"}>
      {/* 月份导航 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 rounded hover:bg-[#f7f8fa] transition-colors">
            <ChevronLeft className="h-4 w-4 text-[#4e535a]" />
          </button>
          <div className="relative inline-block" ref={calRef}>
            <button
              className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-[#f7f8fa] transition-colors"
              onClick={() => {
                setCalYear(year)
                setCalOpen(!calOpen)
              }}
            >
              <span className="text-[14px] font-medium text-[#2b2f36]">{year}年{month}月</span>
            </button>
            {calOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-lg border border-[#e8e8e8] p-3 z-50 w-[240px]">
                <div className="flex items-center justify-between mb-3">
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                    onClick={() => setCalYear(y => y - 1)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[13px] font-medium text-[#2b2f36]">{calYear}年</span>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                    onClick={() => setCalYear(y => y + 1)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const isSelected = calYear === year && m === month
                    return (
                      <button
                        key={m}
                        className={`h-8 rounded text-[12px] transition-colors ${
                          isSelected ? "bg-[#3370ff] text-white" : "hover:bg-[#f7f8fa] text-[#2b2f36]"
                        }`}
                        onClick={() => selectMonth(m)}
                      >
                        {m}月
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
          <button onClick={nextMonth} className="p-1 rounded hover:bg-[#f7f8fa] transition-colors">
            <ChevronRight className="h-4 w-4 text-[#4e535a]" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">共 {records.length} 场活动</span>
      </div>

      {/* 活动列表 */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
      ) : grouped.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">本月暂无活动</div>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date}>
            {/* 日期分组头 */}
            <div className="flex items-center justify-between py-2">
              <span className="text-[13px] font-medium text-[#2b2f36]">
                {new Date(date).getMonth() + 1}月{new Date(date).getDate()}日 周{getWeekday(date)}
              </span>
              <span className="text-[11px] text-[#8f959e]">{items.length} 场活动</span>
            </div>

            {/* 活动卡片 */}
            <div className="bg-white rounded-lg border border-[#e8e8e8] divide-y divide-[#f5f5f5]">
              {items.map((record, idx) => (
                <ActivityCard key={idx} record={record} getName={getName} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function ActivityCard({ record, getName }: { record: UnifiedRecord; getName: (id: string) => string }) {
  const { type, data } = record
  const badge = TYPE_BADGE[type]
  const icsCourseLabel = type === "ics" ? getIcsLabel(data.course_type || data.course_name || "") : ""

  // 活动名称
  let activityName = ""
  if (type === "class") activityName = data.course_name || ""
  else if (type === "gcs") activityName = `觉醒游戏·${data.owner_name || getName(data.owner_id) || "未分配"}`
  else if (type === "ers") activityName = `情绪释放·${data.owner_name || getName(data.owner_id) || "未分配"}`
  else if (type === "eks") {
    const names = parseEksNames(data.description)
    activityName = `能量结·${names.length > 0 ? names.join("、") : data.owner_name || getName(data.owner_id) || "未分配"}`
  }
  else if (type === "ics") activityName = data.course_name || ""
  else if (type === "ocr") activityName = `OH卡梳理·${data.owner_name || getName(data.owner_id) || "未分配"}`

  // 案主
  const ownerName = (type === "gcs" || type === "ers" || type === "eks" || type === "ocr")
    ? (data.owner_name || getName(data.owner_id) || "")
    : ""

  // 老师
  let teacherNames = ""
  if (type === "class") {
    teacherNames = (data.teacher_ids || []).map((id: string) => getName(id)).filter(Boolean).join("、")
  } else if (type === "eks" || type === "ics") {
    teacherNames = (data.host_names || []).join("、")
  }

  // 成就君
  const achieverName = (type === "gcs" || type === "ers")
    ? (data.achiever_name || getName(data.achiever_id) || "")
    : ""

  // 参与者（带角色）
  const participants = useMemo(() => {
    const result: { name: string; roles: string[] }[] = []
    const added = new Set<string>()

    // class 类型：从 groups 中提取
    if (type === "class" && data.groups) {
      for (const g of data.groups) {
        if (g.leader_id) {
          result.push({ name: getName(g.leader_id), roles: ["组长"] })
          added.add(g.leader_id)
        }
        if (g.deputy_id && !added.has(g.deputy_id)) {
          result.push({ name: getName(g.deputy_id), roles: ["副组长"] })
          added.add(g.deputy_id)
        }
        for (const mid of (g.member_ids || [])) {
          if (!added.has(mid)) {
            result.push({ name: getName(mid), roles: [] })
            added.add(mid)
          }
        }
      }
    }

    // gcs/ers：主持人加入参与者
    if ((type === "gcs" || type === "ers") && data.host_id && !added.has(data.host_id)) {
      result.push({ name: getName(data.host_id), roles: ["主持人"] })
      added.add(data.host_id)
    }

    // 其余 participant_ids
    for (const id of (data.participant_ids || [])) {
      if (!added.has(id)) {
        result.push({ name: getName(id), roles: [] })
        added.add(id)
      }
    }

    return result
  }, [type, data, getName])

  return (
    <div className="px-4 py-3">
      {/* 行1：类型badge + 名称 + 案主/老师/主持人/成就君 + 时间 */}
      <div className="flex items-center gap-x-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-x-2 flex-1 min-w-0">
          {badge && (
            <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-normal ${badge.bg} ${badge.text}`}>
              {badge.label}
            </span>
          )}
          <span className="text-[13px] font-medium text-[#2b2f36]">{activityName}</span>
          {icsCourseLabel && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f5f6f7] text-[#4e535a]">
              {icsCourseLabel}
            </span>
          )}
          {type === "class" && data.is_public_welfare && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8fdf8] text-[#4caf50]">公益</span>
          )}
          {(data.room_name || data.space_name) && (
            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">
              {data.space_name && data.room_name ? `${data.space_name}/${data.room_name}` : data.room_name || data.space_name}
            </span>
          )}
          {ownerName && <span className="text-[#8f959e]">案主：<span className="text-[#2b2f36]">{ownerName}</span></span>}
          {teacherNames && <span className="text-[#8f959e]">老师：<span className="text-[#2b2f36]">{teacherNames}</span></span>}
          {achieverName && <span className="text-[#8f959e]">成就君：<span className="text-[#2b2f36]">{achieverName}</span></span>}
        </div>
        {data.start_time && (
          <span className="text-[11px] text-[#8f959e] shrink-0">
            {data.start_time}{data.end_time ? `-${data.end_time}` : ""}
          </span>
        )}
      </div>

      {/* 行2：成员 */}
      {participants.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-0.5 mt-1.5 text-[12px]">
          <span className="text-[#8f959e]">成员：</span>
          {participants.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="inline-block w-[4px]" />}
              <span className="text-[#2b2f36]">{p.name}</span>
              {p.roles.map((r, ri) => (
                <span key={ri} className="inline-block ml-[-1px] pl-1 pr-[-1px] py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>
              ))}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ActivityRecordsPage() {
  return <ActivityRecordsContent />
}
