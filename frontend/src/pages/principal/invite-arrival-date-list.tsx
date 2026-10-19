import { useState } from "react"
import { Download } from "lucide-react"

import { EmptyValue } from "@/components/empty-value"
import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { principalApi, type PrincipalArrivalDateGroup, type PrincipalQuery } from "@/lib/api"

const PREVIEW_COUNT = 4

export function InviteArrivalDateList({ query, period, busy, exportDisabled, onExport, onViewChange, onInviteViewChange, onOpenCustomer }: {
  query: PrincipalQuery
  period: string
  busy: boolean
  exportDisabled: boolean
  onExport: () => void
  onViewChange: (value: "customer" | "date") => void
  onInviteViewChange: (value: "arrive" | "initiated") => void
  onOpenCustomer: (customerId: string) => void
}) {
  const detailQuery: PrincipalQuery = {
    ...query, overview_detail: "invite_arrivals", arrival_view: "date_group", detail_sort_by: "",
  }
  const queryKey = JSON.stringify(detailQuery)
  const pagination = useServerPagination<PrincipalArrivalDateGroup>((page, size) =>
    principalApi.details(detailQuery, page, size), { pageSize: 20, queryKey })
  const [expanded, setExpanded] = useState<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() })
  const toggleExpanded = (id: string) => setExpanded(current => {
    const ids = new Set(current.key === queryKey ? current.ids : [])
    if (ids.has(id)) ids.delete(id)
    else ids.add(id)
    return { key: queryKey, ids }
  })

  return (
    <section aria-label="邀约到店日期列表" aria-busy={pagination.loading} className="mt-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-[3px] rounded-[6px] bg-[#f2f3f5] p-[3px]" role="tablist" aria-label="邀约列表类型">
            <button type="button" role="tab" aria-selected className="h-7 rounded-[4px] bg-white px-3.5 text-[12px] text-[#1f2329] shadow-[0_1px_3px_rgba(31,35,41,.12)]">邀约到店</button>
            <button type="button" role="tab" aria-selected={false} onClick={() => onInviteViewChange("initiated")}
              className="h-7 rounded-[4px] px-3.5 text-[12px] text-[#4e535a] transition-colors hover:text-[#1f2329]">发起邀约</button>
          </div>
          <div className="text-[13px] text-[#2b2f36]">
            <span className="font-medium">{period} · 邀约到店</span>
            <span className="ml-2 text-[12px] text-[#8f959e]">共 {pagination.totalItems} 天</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SelectDropdown
            size="sm"
            className="w-[196px]"
            value="date"
            options={[{ value: "customer", label: "单个客户仅显示一次" }, { value: "date", label: "按日期显示每条邀约记录" }]}
            onChange={value => onViewChange(value as "customer" | "date")}
            buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2.5 !text-[12px] !text-[#4e535a] !shadow-none"
            dropdownWidth={196}
          />
          <button type="button" onClick={onExport} disabled={exportDisabled || busy}
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
        {pagination.paginatedItems.map(group => {
          const groupExpanded = expanded.key === queryKey && expanded.ids.has(group.id)
          const visible = groupExpanded ? group.records : group.records.slice(0, PREVIEW_COUNT)
          const people = new Set(group.records.map(record => record.customer_id || record.id)).size
          return (
            <article key={group.id} className="overflow-hidden rounded-[6px] border border-[#e9ebed] bg-white">
              <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[#eef0f2] bg-[#f9fafb] px-3 py-2.5">
                <h3 className="text-[13px] font-medium tabular-nums text-[#2b2f36]">
                  <time dateTime={group.date}>{group.date}</time>
                </h3>
                <span className="shrink-0 text-[11px] tabular-nums text-[#8f959e]">共 {people} 人</span>
              </header>
              <div className="overflow-x-auto">
                <div className="min-w-[860px]" role="table" aria-label={`${group.date}的邀约到店`}>
                  <div className="grid grid-cols-[72px_minmax(88px,0.7fr)_88px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(96px,1fr)_64px] gap-2 border-b border-[#f0f0f0] px-3 py-2 text-[11px] text-[#8f959e]" role="row">
                    <span role="columnheader">时间</span>
                    <span role="columnheader">昵称</span>
                    <span role="columnheader">邀约人</span>
                    <span role="columnheader">来访需求</span>
                    <span role="columnheader">当日参加活动</span>
                    <span role="columnheader">当日成交</span>
                    <span role="columnheader">状态</span>
                  </div>
                  {visible.map(record => (
                    <div key={record.id || `${group.id}:${record.customer_id}`} role="row" className="grid grid-cols-[72px_minmax(88px,0.7fr)_88px_minmax(0,1.2fr)_minmax(0,1fr)_minmax(96px,1fr)_64px] items-start gap-2 border-b border-[#f5f6f7] px-3 py-2.5 text-[11.5px] leading-[1.5] text-[#4e535a] last:border-b-0 hover:bg-[#fcfcfd]">
                      {record.arrive_time ? <time className="tabular-nums text-[#8f959e]">{record.arrive_time}</time> : <EmptyValue />}
                      {record.customer_id && record.name ? (
                        <button type="button" onClick={() => onOpenCustomer(record.customer_id)}
                          className="min-w-0 self-start truncate border-0 bg-transparent p-0 text-left text-[11.5px] font-medium leading-[1.5] text-[#2b2f36] hover:text-[#3370ff] hover:underline focus-visible:rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3370ff]"
                          title={record.name}>
                          {record.name}
                        </button>
                      ) : <span className="min-w-0 self-start truncate text-[11.5px] font-medium leading-[1.5] text-[#2b2f36]">{record.name || <EmptyValue />}</span>}
                      {record.arrive_inviter ? <span title={record.arrive_inviter} className="min-w-0 truncate">{record.arrive_inviter}</span> : <EmptyValue />}
                      {record.needs ? <span title={record.needs} className="min-w-0 whitespace-pre-wrap break-words">{record.needs}</span> : <EmptyValue />}
                      {record.same_day_activities ? <span title={record.same_day_activities} className="min-w-0 whitespace-pre-wrap break-words">{record.same_day_activities}</span> : <EmptyValue />}
                      {record.same_day_deal_text ? <span title={record.same_day_deal_text} className="min-w-0 whitespace-pre-wrap break-words">{record.same_day_deal_text}</span> : <EmptyValue />}
                      <span className={record.status === "arrived" ? "text-[#2f8f57]" : "text-[#8f959e]"}>{record.status_label || "已到店"}</span>
                    </div>
                  ))}
                </div>
              </div>
              {group.records.length > PREVIEW_COUNT && (
                <div className="border-t border-[#f5f6f7] px-3 py-2">
                  <button type="button" aria-expanded={groupExpanded} onClick={() => toggleExpanded(group.id)} className="text-[12px] text-[#8f959e] hover:text-[#4e535a] hover:underline">
                    {groupExpanded ? "收起" : `展开其余 ${group.records.length - PREVIEW_COUNT} 条`}
                  </button>
                </div>
              )}
            </article>
          )
        })}
      </div>
      {!pagination.paginatedItems.length && !pagination.error && (
        <div className="py-16 text-center text-[13px] text-[#8f959e]">{pagination.loading ? "加载中…" : "暂无符合条件的到店记录"}</div>
      )}
      <PaginationBar currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
        startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} />
    </section>
  )
}
