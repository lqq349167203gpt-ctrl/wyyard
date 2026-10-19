import { useState } from "react"
import { Download } from "lucide-react"

import { EmptyValue } from "@/components/empty-value"
import { PaginationBar } from "@/components/pagination-bar"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { principalApi, type PrincipalParticipationMember, type PrincipalQuery } from "@/lib/api"

const PREVIEW_ACTIVITY_COUNT = 4

type Activity = PrincipalParticipationMember["activities"][number]

const ACTIVITY_TYPE_ORDER = ["沙龙活动", "觉醒游戏", "情绪释放", "深度情绪释放", "沙龙技能学习"]

function participationTypeCounts(activities: Activity[]) {
  const byType = new Map<string, Map<string, number>>()
  for (const activity of activities) {
    const type = activity.type || "其他活动"
    const subtypes = byType.get(type) ?? new Map<string, number>()
    if (type === "沙龙活动") {
      const subtype = activity.subtype || "未分类"
      subtypes.set(subtype, (subtypes.get(subtype) ?? 0) + 1)
    } else {
      subtypes.set("", (subtypes.get("") ?? 0) + 1)
    }
    byType.set(type, subtypes)
  }
  return [...byType.keys()]
    .sort((left, right) => {
      const leftOrder = ACTIVITY_TYPE_ORDER.indexOf(left)
      const rightOrder = ACTIVITY_TYPE_ORDER.indexOf(right)
      const leftRank = leftOrder === -1 ? ACTIVITY_TYPE_ORDER.length : leftOrder
      const rightRank = rightOrder === -1 ? ACTIVITY_TYPE_ORDER.length : rightOrder
      return leftRank - rightRank || left.localeCompare(right, "zh")
    })
    .map(type => {
      const subtypes = byType.get(type) ?? new Map<string, number>()
      if (type !== "沙龙活动") return { type, count: subtypes.get("") ?? 0, subtypes: [] as { name: string; count: number }[] }
      const items = [...subtypes.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((left, right) => {
          if (left.name === "读书会") return -1
          if (right.name === "读书会") return 1
          if (left.name === "未分类") return 1
          if (right.name === "未分类") return -1
          return right.count - left.count || left.name.localeCompare(right.name, "zh")
        })
      return { type, count: items.reduce((sum, item) => sum + item.count, 0), subtypes: items }
    })
}

function ParticipationTypeCounts({ activities }: { activities: Activity[] }) {
  const items = participationTypeCounts(activities)
  if (!items.length) return null
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
      {items.map((item, index) => (
        <span key={item.type} className="flex min-w-0 items-center gap-2">
          {index > 0 && <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[#d0d3d6]" />}
          {item.subtypes.length ? (
            <span className="flex flex-wrap items-baseline gap-x-2 text-[#4e535a]">
              {item.subtypes.map(subtype => (
                <span key={subtype.name}>
                  {subtype.name}
                  <span className="ml-0.5 tabular-nums">{subtype.count}场</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-[#4e535a]">
              {item.type}
              <span className="ml-0.5 tabular-nums">{item.count}场</span>
            </span>
          )}
        </span>
      ))}
    </span>
  )
}

function activityTypeLabel(activity: Activity) {
  return activity.type === "沙龙活动" ? (activity.subtype || "未分类") : (activity.type || "其他活动")
}

export function MemberParticipationList({ query, period, showOwners, onOpenCustomer, onExport, busy, exportDisabled }: {
  query: PrincipalQuery
  period: string
  showOwners: boolean
  onOpenCustomer: (customerId: string) => void
  onExport: () => void
  busy: boolean
  exportDisabled: boolean
}) {
  const detailQuery: PrincipalQuery = { ...query, overview_detail: "participation", detail_sort_by: "" }
  const queryKey = JSON.stringify(detailQuery)
  const pagination = useServerPagination<PrincipalParticipationMember>((page, size) =>
    principalApi.details(detailQuery, page, size), { pageSize: 20, queryKey })
  const [expanded, setExpanded] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() })
  const toggleExpanded = (id: string) => setExpanded(current => {
    const ids = new Set(current.key === queryKey ? current.ids : [])
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    return { key: queryKey, ids }
  })

  return (
    <section aria-label="成员活动参与列表" aria-busy={pagination.loading} className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="text-[13px] text-[#2b2f36]">
          <span className="font-medium">{period} · 活动参与</span>
          <span className="ml-2 text-[12px] text-[#8f959e]">共 {pagination.totalItems} 人</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[#8f959e]">按参与次数从多到少</span>
          <button type="button" onClick={onExport} disabled={exportDisabled || pagination.loading || !!pagination.error}
            className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7] disabled:opacity-50">
            <Download className="h-3.5 w-3.5" />{busy ? "导出中" : "导出"}
          </button>
        </div>
      </div>
      {pagination.error && (
        <div role="alert" className="mb-3 flex items-center gap-3 rounded-[6px] border border-[#f1d9dc] bg-[#fff8f8] px-3.5 py-2 text-[12px] text-[#b94a58]">
          <span>{pagination.error}（数据未更新）</span>
          <button type="button" onClick={pagination.refresh} className="text-[#3370ff] hover:underline">重试</button>
        </div>
      )}
      <div className={`space-y-3 transition-opacity ${pagination.loading && pagination.paginatedItems.length ? "opacity-55" : ""}`}>
        {pagination.paginatedItems.map(member => {
          const memberExpanded = expanded.key === queryKey && expanded.ids.has(member.id)
          const dated = [...member.activities].sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name, "zh"))
          const visibleDated = memberExpanded ? dated : dated.slice(0, PREVIEW_ACTIVITY_COUNT)
          const summary = [
            `共 ${member.count} 次`,
            ...(showOwners ? [`案主 ${member.owner_count}`] : []),
            `参与者 ${member.participant_count}`,
          ].join(" · ")
          return (
            <article key={member.id} className="overflow-hidden rounded-[6px] border border-[#e9ebed] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[#eef0f2] bg-[#f9fafb] px-3 py-2.5">
                <div className="flex min-w-0 flex-1 items-baseline gap-2">
                  <h3 className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenCustomer(member.id)}
                      className="text-left text-[13px] font-medium text-[#2b2f36] hover:text-[#3370ff] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3370ff]"
                      title={member.name}
                    >
                      {member.name}
                    </button>
                  </h3>
                  <span aria-hidden="true" className="shrink-0 text-[11px] text-[#c9cdd2]">·</span>
                  <ParticipationTypeCounts activities={member.activities} />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[#8f959e]">{summary}</span>
              </header>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]" role="table" aria-label={`${member.name}的活动参与`}>
                  <div className="grid grid-cols-[96px_minmax(0,1.4fr)_132px_64px_108px] gap-2 border-b border-[#f0f0f0] px-3 py-2 text-[11px] text-[#8f959e]" role="row">
                    <span role="columnheader">日期</span>
                    <span role="columnheader">活动</span>
                    <span role="columnheader">类型</span>
                    <span role="columnheader">身份</span>
                    <span role="columnheader">老师</span>
                  </div>
                  {visibleDated.map((activity, index) => {
                    const typeLabel = activityTypeLabel(activity)
                    const teachers = activity.teachers.trim()
                    return (
                      <div key={`${member.id}:${index}`} role="row" className="grid grid-cols-[96px_minmax(0,1.4fr)_132px_64px_108px] gap-2 border-b border-[#f5f6f7] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#4e535a] last:border-b-0 hover:bg-[#fcfcfd]">
                        <time dateTime={activity.date} className="tabular-nums text-[#8f959e]">{activity.date}</time>
                        <span title={activity.name} className="min-w-0 truncate font-medium text-[#2b2f36]">{activity.name}</span>
                        <span title={typeLabel} className="min-w-0 truncate">{typeLabel}</span>
                        <span className={activity.role === "案主" ? "text-[#8f959e]" : ""}>{activity.role}</span>
                        {teachers ? <span title={teachers} className="min-w-0 truncate">{teachers}</span> : <EmptyValue />}
                      </div>
                    )
                  })}
                </div>
              </div>
              {dated.length > PREVIEW_ACTIVITY_COUNT && (
                <div className="border-t border-[#f5f6f7] px-3 py-2">
                  <button type="button" aria-expanded={memberExpanded} onClick={() => toggleExpanded(member.id)} className="text-[12px] text-[#8f959e] hover:text-[#4e535a] hover:underline">
                    {memberExpanded ? "收起" : `展开其余 ${dated.length - PREVIEW_ACTIVITY_COUNT} 场`}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
      {!pagination.paginatedItems.length && !pagination.error && (
        <div className="py-16 text-center text-[13px] text-[#8f959e]">{pagination.loading ? "加载中…" : "暂无符合条件的活动参与记录"}</div>
      )}
      <PaginationBar currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
        startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} />
    </section>
  )
}
