import { useEffect, useMemo, useState } from "react"

import { confirmDialog } from "@/components/confirm-dialog"
import { SupervisionSecondaryLayout } from "@/components/supervision-secondary-layout"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { debtRecordApi, type DebtCourseFilter, type DebtCourseRecord, type DebtCourseResult, type DebtCourseStatus } from "@/lib/api"
import DetailView from "@/pages/healing-records/components/detail-view"

const TABS = [
  { key: "membership_card", label: "会员卡" },
  { key: "group_case", label: "觉醒游戏" },
  { key: "emotional_release", label: "情绪释放" },
  { key: "energy_knot", label: "能量结" },
]

const FILTERS: Array<{ key: DebtCourseFilter; label: string }> = [
  { key: "attention", label: "待确认" },
  { key: "ok", label: "已确认" },
  { key: "all", label: "全部" },
]

const STATUS_STYLE: Record<DebtCourseStatus, string> = {
  new: "bg-[#fff7e6] text-[#b46f12]",
  changed: "bg-[#fff1f0] text-[#d4380d]",
  ok: "bg-[#eef8f3] text-[#3f8f69]",
  resolved: "bg-[#f2f3f5] text-[#8f959e]",
}

function statusLabel(row: DebtCourseRecord) {
  if (row.status === "new") return "待确认"
  if (row.status === "changed") return `新增 ${row.new_count} 次`
  if (row.status === "ok") return "已确认"
  return "已结清"
}

function formatTime(value: string) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("zh-CN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
}

interface PersonGroup {
  customerId: string
  nickname: string
  memberType: string
  courses: DebtCourseRecord[]
  debtCount: number
  newCount: number
}

export default function DebtRecordsPage({ embedded = false }: { embedded?: boolean }) {
  const [activeTab, setActiveTab] = useState("membership_card")
  const [filter, setFilter] = useState<DebtCourseFilter>("attention")
  const [data, setData] = useState<DebtCourseResult | null>(null)
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [revision, setRevision] = useState(0)
  const [detailCustomerId, setDetailCustomerId] = useState<string | null>(null)
  const [handlingPerson, setHandlingPerson] = useState<PersonGroup | null>(null)
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([])
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError("")
    debtRecordApi.list(activeTab, filter)
      .then(result => { if (active) setData(result) })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "加载失败，请重试") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [activeTab, filter, revision])

  useEffect(() => {
    debtRecordApi.summary().then(setTypeCounts).catch(() => setTypeCounts({}))
  }, [revision])

  const people = useMemo<PersonGroup[]>(() => {
    const grouped = new Map<string, PersonGroup>()
    for (const course of data?.items || []) {
      const person = grouped.get(course.customer_id) || {
        customerId: course.customer_id,
        nickname: course.nickname,
        memberType: course.member_type,
        courses: [],
        debtCount: data?.customer_debt_totals?.[course.customer_id] || 0,
        newCount: data?.customer_pending_totals?.[course.customer_id] || 0,
      }
      person.courses.push(course)
      grouped.set(course.customer_id, person)
    }
    return [...grouped.values()]
  }, [data])

  function openPersonReview(person: PersonGroup) {
    setHandlingPerson(person)
    setSelectedReviewIds([])
    setNote("")
  }

  function toggleReview(reviewId: string) {
    setSelectedReviewIds(current => current.includes(reviewId) ? current.filter(id => id !== reviewId) : [...current, reviewId])
  }

  async function confirmSelectedCourses() {
    if (!handlingPerson || !selectedReviewIds.length || saving) return
    const reviewIds = [...selectedReviewIds]
    const selectedCourses = handlingPerson.courses.filter(course => reviewIds.includes(course.id))
    if (!await confirmDialog({
      title: `确认忽视 ${selectedCourses.length} 门课程的欠卡？`,
      description: selectedCourses.map(course => `${course.course_name || "未命名课程"}（${course.course_date || "日期未填写"}）`).join("、"),
      hint: "本次只会处理上面列出的课程，其他未确认课程仍会保留在待确认页面。",
      confirmText: "确认忽视",
    })) return
    setSaving(true)
    try {
      for (const reviewId of reviewIds) {
        await debtRecordApi.update(reviewId, { action: "confirm", note })
      }
      const refreshed = await debtRecordApi.list(activeTab, filter)
      setData(refreshed)
      debtRecordApi.summary().then(setTypeCounts).catch(() => undefined)
      setHandlingPerson(null)
      setSelectedReviewIds([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "确认失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  async function resetCourse(row: DebtCourseRecord) {
    if (!await confirmDialog({
      title: "撤销这位客户本课程的确认？",
      description: `${row.nickname || "未命名客户"} · ${row.course_name} · ${row.course_date || "日期未填写"}，撤销后只有这一门课程会重新进入待确认。`,
      confirmText: "撤销确认",
    })) return
    try {
      await debtRecordApi.update(row.id, { action: "reset", note: row.note || "" })
      setHandlingPerson(null)
      setSelectedReviewIds([])
      setRevision(value => value + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : "撤销失败，请重试")
    }
  }

  return (
    <div className={`dv-root h-full ${embedded ? "" : "bg-[#f4f5f6] p-4"}`}>
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; } .dv-root th, .dv-root td { padding-left: 8px; padding-right: 8px; font-size: 12px; } .dv-root th.pl-4, .dv-root td.pl-4 { padding-left: 16px; } .dv-root th.pr-4, .dv-root td.pr-4 { padding-right: 16px; }`}</style>
      <SupervisionSecondaryLayout items={TABS.map(item => ({ ...item, badge: typeCounts[item.key] || 0 }))} activeKey={activeTab} onChange={value => { setActiveTab(value); setFilter("attention"); setHandlingPerson(null) }}>
        <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
          <div className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-[#f0f0f0] px-4 py-2">
            {FILTERS.map(option => {
              const selected = filter === option.key
              const count = data?.counts[option.key] || 0
              return <button key={option.key} type="button" onClick={() => { setFilter(option.key); setHandlingPerson(null) }} className={`h-7 rounded-[4px] px-2.5 text-[12px] transition-colors ${selected ? "bg-[#1f2329] text-white" : "text-[#646a73] hover:bg-[#f5f6f7]"}`}>{option.label}<span className={`ml-1 tabular-nums ${selected ? "text-white/75" : "text-[#a8b1bd]"}`}>{count}</span></button>
            })}
            <div className="flex-1" />
          </div>

          {error && <div role="alert" className="border-b border-[#f0f0f0] px-4 py-2 text-xs text-red-600">{error}<button className="ml-3 underline" onClick={() => setRevision(value => value + 1)}>重试</button></div>}

          <div className="overflow-x-auto" aria-busy={loading}>
            <Table className="min-w-[860px] [&_th]:h-10 [&_th]:bg-[#fafbfc] [&_td]:py-3">
              <TableHeader><TableRow><TableHead className="pl-4">客户</TableHead><TableHead>{filter === "ok" ? "已忽视欠卡课程" : filter === "attention" ? "新增欠卡课程（未确认）" : "欠卡课程"}</TableHead><TableHead>欠卡总数</TableHead><TableHead>待确认</TableHead><TableHead>状态</TableHead><TableHead className="pr-4 text-right">操作</TableHead></TableRow></TableHeader>
              <TableBody>
                {!error && people.map(person => {
                  const hasAttention = person.newCount > 0
                  const listedCourses = filter === "attention"
                    ? person.courses.filter(course => course.status === "new" || course.status === "changed")
                    : filter === "ok"
                      ? person.courses.filter(course => course.status === "ok")
                      : person.courses
                  return <TableRow key={person.customerId}>
                      <TableCell className="pl-4"><button type="button" onClick={() => setDetailCustomerId(person.customerId)} className="text-left font-medium text-[#2b2f36] hover:text-[#3370ff]">{person.nickname || "未命名客户"}<span className="ml-1.5 text-[11px] font-normal text-[#8f959e]">{person.memberType || "—"}</span></button></TableCell>
                      <TableCell className="max-w-[280px]"><div className="flex flex-wrap gap-1">{listedCourses.map(course => <span key={course.id} title={`${course.course_name} · ${course.course_date || "日期未填写"}`} className="max-w-[180px] truncate rounded-[3px] border border-[#dee0e3] bg-white px-1.5 py-0.5 text-[11px] text-[#646a73]">{course.course_name || "未命名课程"}</span>)}{!listedCourses.length && <span className="text-[#d0d3d6]">—</span>}</div></TableCell>
                      <TableCell>{person.debtCount}<span className="ml-1 text-[#8f959e]">次</span></TableCell>
                      <TableCell><span className={hasAttention ? "font-medium text-[#d4380d]" : "text-[#8f959e]"}>{person.newCount}</span><span className="ml-1 text-[#8f959e]">次</span></TableCell>
                      <TableCell>{hasAttention ? <span className={`inline-flex rounded-[3px] px-1.5 py-0.5 text-[11px] ${STATUS_STYLE.changed}`}>有新增欠卡</span> : <span className={`inline-flex rounded-[3px] px-1.5 py-0.5 text-[11px] ${STATUS_STYLE.ok}`}>全部确认</span>}</TableCell>
                      <TableCell className="pr-4 text-right"><button type="button" onClick={() => openPersonReview(person)} className="h-7 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">{person.courses.some(course => course.new_count > 0) ? "忽视欠卡" : "查看课程"}</button></TableCell>
                  </TableRow>
                })}
                {!error && !people.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-[#8f959e]">{loading ? "加载中…" : "暂无记录"}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        </div>
      </SupervisionSecondaryLayout>

      <Dialog open={!!handlingPerson} onOpenChange={open => { if (!open && !saving) { setHandlingPerson(null); setSelectedReviewIds([]) } }}>
        <DialogContent className="w-[720px] max-w-[92vw] gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-5 py-3"><DialogTitle className="text-[14px] font-normal">{handlingPerson?.nickname || "未命名客户"} · 忽视欠卡</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-[12px] text-[#8f959e]"><span>忽视后的欠卡将不再提示，可在已确认页面查看</span><span>已选 {selectedReviewIds.length} 项</span></div>
            <div className="overflow-hidden rounded-[6px] border border-[#e8eaed]">
              {(handlingPerson?.courses || []).map(course => {
                const selectable = course.status === "new" || course.status === "changed"
                const selected = selectedReviewIds.includes(course.id)
                const courseTime = [course.start_time, course.end_time].filter(Boolean).join("–")
                const teachers = (course.teacher_names || []).join("、")
                return <label key={course.id} className={`flex items-center gap-3 border-b border-[#f0f0f0] px-3 py-3 last:border-b-0 ${selectable ? "cursor-pointer hover:bg-[#fafbfc]" : "bg-[#fafbfc]"}`}>
                  <input type="checkbox" checked={selected} disabled={!selectable || saving} onChange={() => toggleReview(course.id)} className="h-4 w-4 rounded border-[#c9cdd4] accent-[#3370ff]" />
                  <div className="min-w-0 flex-1"><div className="truncate text-[12px] font-medium text-[#2b2f36]">{course.course_name || "—"}</div><div className="mt-1 text-[11px] text-[#8f959e]">{course.course_date || "日期未填写"} · {courseTime || "时间未填写"} · 老师：{teachers || "未填写"}</div><div className="mt-1 text-[11px] text-[#8f959e]">欠卡 {course.debt_count} 次{course.new_count > 0 ? ` · 待确认 ${course.new_count} 次` : ""}</div>{course.note && <div className="mt-1.5 whitespace-normal break-words text-[11px] text-[#4e535a]">备注：{course.note}</div>}{course.reviewed_by && <div className="mt-1 text-[10px] text-[#a8b1bd]">{course.reviewed_by} · {formatTime(course.reviewed_at)}</div>}</div>
                  <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px] ${STATUS_STYLE[course.status]}`}>{statusLabel(course)}</span>
                  {course.status === "ok" && <button type="button" disabled={saving} onClick={event => { event.preventDefault(); void resetCourse(course) }} className="h-7 shrink-0 rounded-[4px] border border-[#dee0e3] bg-white px-2 text-[11px] text-[#4e535a] hover:bg-[#f5f6f7]">撤销确认</button>}
                </label>
              })}
            </div>
            {selectedReviewIds.length > 0 && <div className="mt-4"><div className="mb-2 text-[12px] text-[#8f959e]">统一备注（可选）</div><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={300} placeholder="例如：这些课程属于合理欠卡" className="h-16 w-full resize-none rounded-[4px] border border-[#dee0e3] px-3 py-2 text-[12px] text-[#2b2f36] outline-none placeholder:text-[#b0b5bb] focus:border-[#3370ff]" /></div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3"><button type="button" disabled={saving} onClick={() => { setHandlingPerson(null); setSelectedReviewIds([]) }} className="h-8 rounded-[4px] border border-[#dee0e3] px-3 text-[12px] text-[#4e535a]">关闭</button>{selectedReviewIds.length > 0 && <button type="button" disabled={saving} onClick={() => void confirmSelectedCourses()} className="h-8 rounded-[4px] bg-[#3370ff] px-3 text-[12px] text-white disabled:opacity-50">{saving ? "保存中…" : `忽视所选 ${selectedReviewIds.length} 项`}</button>}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailCustomerId} onOpenChange={open => { if (!open) setDetailCustomerId(null) }}><DialogContent className="max-h-[90vh] max-w-[1180px] gap-0 overflow-y-auto p-0"><DetailView selectedCustomerId={detailCustomerId} onClearSelection={() => setDetailCustomerId(null)} hideSearch /></DialogContent></Dialog>
    </div>
  )
}
