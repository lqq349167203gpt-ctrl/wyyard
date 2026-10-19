import { useState } from "react"

import { EmptyValue } from "@/components/empty-value"
import { PaginationBar } from "@/components/pagination-bar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { principalApi, type PrincipalQuery, type PrincipalRow } from "@/lib/api"

const PAGE_SIZE = 20

export function ParticipantCourseHistoryDialog({ customer, customerId, organizationId, organization, query, onClose }: {
  customer: string
  customerId: string
  organizationId: string
  organization: string
  query: PrincipalQuery
  onClose: () => void
}) {
  const [allHistory, setAllHistory] = useState(false)
  const [resultKey, setResultKey] = useState("")
  const historyQuery: PrincipalQuery = {
    ...query,
    tab: "courses", course_view: "participant", participant_layout: "rows",
    participant_history_organization_id: organizationId, customer_id: customerId,
    date_from: allHistory ? "2026-01-01" : query.date_from,
    date_to: allHistory ? null : query.date_to,
    activity_type: allHistory ? "" : query.activity_type,
    course_subtype: allHistory ? "" : query.course_subtype,
    breakdown: [], detail_picks: [], course_deal: "", participant_scope: "",
    include_overview: false, overview_detail: "", sort_by: "", log_analysis: false,
  }
  const queryKey = JSON.stringify(historyQuery)
  const pagination = useServerPagination<PrincipalRow>(async (page, size, isCurrent) => {
    const result = await principalApi.query(historyQuery, page, size)
    if (isCurrent()) setResultKey(queryKey)
    return result
  }, { queryKey, pageSize: PAGE_SIZE })
  const ready = resultKey === queryKey && !pagination.loading && !pagination.error
  const period = allHistory ? "2026-01-01 至今"
    : `${query.date_from || "最早"} 至 ${query.date_to || "今天"}`
  const type = allHistory ? "全部课程类型" : query.course_subtype || query.activity_type && ({ class: "沙龙活动", gcs: "觉醒游戏", ers: "情绪释放", eks: "深度情绪释放", ics: "沙龙技能学习" }[query.activity_type] || query.activity_type) || "全部课程类型"

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent initialFocus={false} className="relative flex max-h-[80vh] w-[800px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border-[0.5px] border-[#e8eaed] bg-white p-0">
        <DialogHeader className="shrink-0 gap-1 border-b-[0.5px] border-[#f0f0f0] py-3 pl-5 pr-12">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <DialogTitle className="text-[14px] font-medium leading-5 text-[#1f2329]">{customer || "用户"}的参与课程</DialogTitle>
            <div role="group" aria-label="课程记录范围" className="inline-flex shrink-0 overflow-hidden rounded-[4px] border border-[#e1e4e7]">
              {[{ all: false, label: "当前统计范围" }, { all: true, label: "全部历史" }].map(item => <button
                key={item.label} type="button" aria-pressed={allHistory === item.all}
                onClick={() => setAllHistory(item.all)}
                className={`px-2.5 py-1 text-[11.5px] leading-4 transition-colors first:border-r first:border-[#e1e4e7] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-2 focus-visible:outline-[#8f959e] ${allHistory === item.all ? "bg-[#f0f2f5] font-medium text-[#2b2f36]" : "bg-white text-[#8f959e] hover:bg-[#f7f8fa] hover:text-[#646a73]"}`}
              >{item.label}</button>)}
            </div>
          </div>
          <p className="text-[11.5px] leading-5 text-[#8f959e]">{organization} · {period} · {type}</p>
        </DialogHeader>
        <div className="min-h-[180px] min-w-0 flex-1 overflow-auto px-5 py-3" aria-busy={!ready && !pagination.error}>
          {pagination.error ? <div role="alert" className="py-12 text-center text-[12px] text-destructive">
            <p>{pagination.error}</p>
            <button type="button" onClick={pagination.refresh} className="mt-3 text-[#646a73] underline underline-offset-2">重新加载</button>
          </div> : !ready ? <div className="py-12 text-center text-[12px] text-[#8f959e]">加载中…</div>
            : !pagination.paginatedItems.length ? <div className="py-12 text-center text-[12px] text-[#8f959e]">暂无参与课程记录</div>
              : <div className="overflow-hidden rounded-[6px] border border-[#eceef0]"><Table
                className="min-w-[660px] [&_th]:h-8 [&_th]:px-2.5 [&_th]:text-[11.5px] [&_td]:px-2.5 [&_td]:py-2 [&_td]:text-[12px] [&_td]:text-[#4e535a]"
                aria-label={`${customer}的历史参与课程`}>
                <TableHeader className="bg-[#f9fafb] [&_tr]:h-8"><TableRow>
                  <TableHead>课程日期</TableHead><TableHead>课程名称</TableHead><TableHead>课程类型</TableHead>
                  <TableHead>课程老师</TableHead><TableHead>本场身份</TableHead><TableHead className="text-right">课时数</TableHead>
                </TableRow></TableHeader>
                <TableBody>{pagination.paginatedItems.map(row => <TableRow key={row.id} className="h-10 hover:bg-[#fcfcfd]">
                  <TableCell className="w-[100px] tabular-nums">{String(row.date || "")}</TableCell>
                  <TableCell className="max-w-[220px] whitespace-normal break-words">{String(row.name || "未命名课程")}</TableCell>
                  <TableCell className="max-w-[140px] whitespace-normal break-words">{String(row.course_subtype || row.type || "") || <EmptyValue />}</TableCell>
                  <TableCell className="max-w-[140px] whitespace-normal break-words">{String(row.teachers || "") || <EmptyValue />}</TableCell>
                  <TableCell>{String(row.participant_role || "参与者")}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(row.hours || 0)} 课时</TableCell>
                </TableRow>)}</TableBody>
              </Table></div>}
        </div>
        {ready && <div className="shrink-0"><PaginationBar
          currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems}
          startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} pageSize={PAGE_SIZE}
        /></div>}
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
