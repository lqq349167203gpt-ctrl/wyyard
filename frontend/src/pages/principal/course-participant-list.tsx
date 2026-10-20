import { MemberLabels } from "@/components/member-labels"
import { useState } from "react"
import { useEditPermissions } from "@/hooks/use-edit-permissions"
import { canViewNote } from "@/lib/note-permissions"

import type { CourseParticipantNoteEntry, PrincipalQuery } from "@/lib/api"

import { EmptyValue } from "@/components/empty-value"
import { followUpPlanText } from "@/components/visits/note-feedback-meta"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ParticipantCourseHistoryDialog } from "./participant-course-history-dialog"

const PREVIEW_COUNT = 4

export interface CourseParticipantPerson {
  id: string
  customer_id: string
  customer: string
  member_type: string
  card_status?: string
  card_status_tone?: string
  participant_role: "案主" | "参与者"
  visit_need?: string
  customer_info?: string
  follow_up?: string
  customer_feedback?: string
  visit_need_entries?: CourseParticipantNoteEntry[]
  customer_info_entries?: CourseParticipantNoteEntry[]
  follow_up_entries?: CourseParticipantNoteEntry[]
  customer_feedback_entries?: CourseParticipantNoteEntry[]
  org_participation_count: number
  org_participation_hours: number
}

export interface CourseParticipantCard {
  id: string
  course_id: string
  date: string
  name: string
  type: string
  course_subtype: string
  organization_id: string
  organization: string
  teachers: string
  hours: number
  count: number
  participants: CourseParticipantPerson[]
}

function courseTypeLabel(card: CourseParticipantCard) {
  if (card.type === "沙龙活动") return card.course_subtype || "未分类"
  return card.type || "其他活动"
}

function cardParticipants(card: CourseParticipantCard) {
  return Array.isArray(card.participants) ? card.participants : []
}

function headerMeta(card: CourseParticipantCard) {
  const teachers = typeof card.teachers === "string" ? card.teachers.trim() : ""
  return [courseTypeLabel(card), card.organization, teachers, `${card.hours || 0} 课时`].filter(Boolean)
}

/** 上一视图的行没有 participants，不能当成课程卡片画。 */
export function isCourseParticipantCard(row: object): row is CourseParticipantCard {
  return Array.isArray((row as { participants?: unknown }).participants)
}

const FEEDBACK_FIELDS = [
  { key: "visit_need", label: "来访需求" },
  { key: "customer_info", label: "深度需求" },
  { key: "follow_up", label: "跟进点" },
  { key: "customer_feedback", label: "客户反馈" },
] as const

function ParticipantFeedbackCell({ person, field, expanded, onOpen }: {
  person: CourseParticipantPerson
  field: typeof FEEDBACK_FIELDS[number]
  expanded: boolean
  onOpen: () => void
}) {
  const text = person[field.key]?.trim()
  const entries = (person[`${field.key}_entries`] || []).filter(entry => entry.content?.trim())
  const notes: CourseParticipantNoteEntry[] = entries.length ? entries : text ? [{ author: "未记录", content: text, at: "" }] : []
  if (!notes.length) return <EmptyValue />
  const shown = expanded ? notes : notes.slice(0, 1)
  const cell = <button type="button" onClick={onOpen}
    className={`flex min-h-7 w-full min-w-0 gap-1.5 rounded-[4px] border-[0.5px] border-[#e8eaed] bg-white px-2 text-left text-[12px] text-[#2b2f36] hover:border-[#c0c4cc] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#8f959e] ${expanded ? "items-start py-1" : "items-center py-1"}`}>
    <span className={`min-w-0 flex-1 ${expanded ? "space-y-1" : ""}`}>
      {shown.map((entry, index) => {
        const plan = followUpPlanText(entry)
        return <span key={entry.id || index} className="block min-w-0 leading-5">
          <span className={expanded ? "block whitespace-pre-wrap break-words" : "block truncate"}>{entry.author?.trim() || "未记录"}：{expanded ? entry.content : entry.content.replace(/\s+/g, " ").trim()}</span>
          {plan && <span className="block whitespace-normal break-words text-[11px] leading-[18px] text-[#8f959e]">下次跟进：{plan}</span>}
        </span>
      })}
    </span>
    <span className={`shrink-0 text-[11px] tabular-nums text-[#8f959e] ${expanded ? "mt-0.5" : ""}`}>{notes.length}条</span>
  </button>
  return <Tooltip>
    <TooltipTrigger render={cell} />
    <TooltipContent side="bottom" align="start" sideOffset={5}
      className={`block ${field.key === "follow_up" ? "w-[360px] max-w-[360px]" : "w-[280px] max-w-[280px]"} rounded-[4px] border-[0.5px] border-[#d3d6db] bg-white px-3 py-2.5 text-[#2b2f36] shadow-md [&>svg]:hidden`}>
      <div className="mb-1.5 text-[11px] text-[#8f959e]">{field.label} · {notes.length} 条记录 · 点击查看详情</div>
      {notes.map((entry, index) => <div key={entry.id || index} className="border-b border-[#f0f0f0] py-1 last:border-b-0">
        <div className="whitespace-pre-wrap break-words text-[12px] leading-5">{entry.author?.trim() || "未记录"}：{entry.content}</div>
        {followUpPlanText(entry) && <div className="text-[11px] leading-5 text-[#8f959e]">下次跟进：{followUpPlanText(entry)}</div>}
      </div>)}
    </TooltipContent>
  </Tooltip>
}

export function CourseParticipantList({ cards, loading, showFeedback, expandedFeedback, query, onOpenCustomer, onOpenFeedback }: {
  cards: CourseParticipantCard[]
  loading: boolean
  showFeedback: boolean
  expandedFeedback: boolean
  query: PrincipalQuery
  onOpenFeedback: (person: CourseParticipantPerson, card: CourseParticipantCard) => void
  onOpenCustomer: (customerId: string, courseId: string) => void
}) {
  const noteAccess = useEditPermissions().customer_access
  const feedbackFields = FEEDBACK_FIELDS.filter(field => canViewNote(noteAccess, field.key))
  const gridStyle = showFeedback ? { gridTemplateColumns: `104px 160px 72px ${feedbackFields.length ? `repeat(${feedbackFields.length},minmax(120px,1fr)) ` : ""}64px 64px` } : undefined
  const grid = showFeedback
    ? "grid-cols-[104px_160px_72px_repeat(4,minmax(120px,1fr))_64px_64px]"
    : "grid-cols-[minmax(140px,1fr)_160px_72px_80px_80px]"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<{ person: CourseParticipantPerson; card: CourseParticipantCard; query: PrincipalQuery } | null>(null)
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (!cards.length) {
    return <div className="py-16 text-center text-[13px] text-[#8f959e]">{loading ? "加载中…" : "暂无符合条件的用户"}</div>
  }

  return (
    <div className={`space-y-3 py-3 transition-opacity ${loading ? "opacity-55" : ""}`}>
      {cards.map(card => {
        const open = expanded.has(card.id)
        const participants = cardParticipants(card)
        const people = open ? participants : participants.slice(0, PREVIEW_COUNT)
        const title = card.name || "未命名课程"
        return (
          <article key={card.id} className="overflow-hidden rounded-[6px] border border-[#e9ebed] bg-white">
            <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[#eef0f2] bg-[#f9fafb] px-3 py-2.5">
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <h3 className="min-w-0 truncate text-[13px] font-medium text-[#2b2f36]" title={title}>{title}</h3>
                <span aria-hidden="true" className="shrink-0 text-[11px] text-[#c9cdd2]">·</span>
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 text-[12px] text-[#4e535a]">
                  {headerMeta(card).map((item, index) => <span key={`${card.id}-${index}`} className="max-w-[180px] truncate" title={item}>{item}</span>)}
                </span>
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-[#8f959e]">{card.date} · 共 {card.count} 人</span>
            </header>
            <div className="overflow-x-auto">
              <div className={showFeedback ? "min-w-[1000px]" : "min-w-[520px]"} role="table" aria-label={`${title}的用户`}>
                <div style={gridStyle} className={`grid ${grid} gap-2 border-b border-[#f0f0f0] px-3 py-2 text-[11px] text-[#8f959e]`} role="row">
                  <span role="columnheader">用户</span>
                  <span role="columnheader">会员身份</span>
                  <span role="columnheader">本场身份</span>
                  {showFeedback && feedbackFields.map(field => <span key={field.key} role="columnheader">{field.label}</span>)}
                  <span role="columnheader" className="text-right">累计课程</span>
                  <span role="columnheader" className="text-right">累计课时</span>
                </div>
                {people.map(person => (
                  <div style={gridStyle} key={person.id || person.customer_id} role="row" className={`grid ${grid} items-start gap-2 border-b border-[#f5f6f7] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#4e535a] last:border-b-0 hover:bg-[#fcfcfd]`}>
                    {person.customer_id ? (
                      <button
                        type="button"
                        onClick={() => onOpenCustomer(person.customer_id, card.course_id)}
                        className="min-w-0 truncate text-left font-medium text-[#2b2f36] hover:text-[#3370ff] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3370ff]"
                        title={person.customer}
                      >
                        {person.customer || "未命名"}
                      </button>
                    ) : <span className="min-w-0 truncate font-medium text-[#2b2f36]">{person.customer || <EmptyValue />}</span>}
                    <span title={person.member_type} className="min-w-0"><MemberLabels customer={person} /></span>
                    <span>{person.participant_role === "案主" ? "案主" : "参与者"}</span>
                    {showFeedback && feedbackFields.map(field => <div key={field.key} className="min-w-0">
                      <ParticipantFeedbackCell person={person} field={field} expanded={expandedFeedback} onOpen={() => onOpenFeedback(person, card)} />
                    </div>)}
                    <div className="text-right tabular-nums">
                      {person.customer_id && card.organization_id ? <button
                        type="button"
                        disabled={loading}
                        aria-label={`查看${person.customer}的累计课程（${person.org_participation_count || 0}次）`}
                        onClick={() => setHistory({ person, card, query })}
                        className="text-[#4e535a] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8f959e] disabled:opacity-50"
                      >{person.org_participation_count || 0}</button> : person.org_participation_count || 0}
                    </div>
                    <span className="text-right tabular-nums">{person.org_participation_hours || 0} 课时</span>
                  </div>
                ))}
              </div>
            </div>
            {participants.length > PREVIEW_COUNT && (
              <div className="border-t border-[#f5f6f7] px-3 py-2">
                <button type="button" aria-expanded={open} onClick={() => toggle(card.id)} className="text-[12px] text-[#8f959e] hover:text-[#4e535a] hover:underline">
                  {open ? "收起" : `展开其余 ${participants.length - PREVIEW_COUNT} 人`}
                </button>
              </div>
            )}
          </article>
        )
      })}
      {history && <ParticipantCourseHistoryDialog
        customer={history.person.customer}
        customerId={history.person.customer_id}
        organizationId={history.card.organization_id}
        organization={history.card.organization}
        query={history.query}
        onClose={() => setHistory(null)}
      />}
    </div>
  )
}
