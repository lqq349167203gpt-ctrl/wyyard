import { MemberLabels } from "@/components/member-labels"
import { useRef, useCallback, useEffect, useState } from "react"
import { Edit } from "lucide-react"
import banCircleIcon from "@/assets/ban-circle.svg"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type Customer } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { EmptyValue } from "@/components/empty-value"

const SORT_FIELDS = ["member_type", "card_status", "visit_count", "activity_count", "transaction_count", "last_visit_date", "referral_date"] as const
type SortField = typeof SORT_FIELDS[number]

/** 列排序箭头 */
const SortArrow = ({ field, sortField, sortOrder }: { field: SortField; sortField: SortField | null; sortOrder: "asc" | "desc" }) => (
  <span className="inline-flex flex-col ml-1 cursor-pointer select-none align-middle">
    <span className={`text-[8px] leading-[8px] ${sortField === field && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
    <span className={`text-[8px] leading-[8px] -mt-[1px] ${sortField === field && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
  </span>
)

interface Props {
  onSelectCustomer: (id: string) => void
  onInviteCustomer: (customer: Customer) => void
  onDeleteCustomer: (id: string, nickname: string) => void
  onEditCustomer: (id: string) => void
  filterNickname: string
  filterIdentity: string
  filterCardStatus?: string
  filterReferrer: string
  filterReferrerHandler: string
  filterServiceTeacher: string
  filterQuality: string
  selectionMode?: boolean
  selectedIds?: string[]
  onSelectionChange?: (ids: string[]) => void
  filterTagIds: string[]
  filterTagMatch: "any" | "all"
  refreshKey?: number
  summary?: import("@/lib/api").DashboardSummary | null
  readOnly?: boolean
}

export default function ListView({ onSelectCustomer, onInviteCustomer, onDeleteCustomer, onEditCustomer, filterNickname, filterIdentity, filterCardStatus, filterReferrer, filterReferrerHandler, filterServiceTeacher, filterQuality, selectionMode = false, selectedIds = [], onSelectionChange, filterTagIds, filterTagMatch, refreshKey = 0, summary = null, readOnly = false }: Props) {
  const [pageSize, setPageSize] = useState(10)
  // 排序状态
  const [sortState, setSortState] = useState<{
    field: SortField | null
    order: "asc" | "desc"
  }>({ field: null, order: "desc" })
  const { field: sortField, order: sortOrder } = sortState

  const handleSort = useCallback((field: SortField) => {
    setSortState(prev => prev.field === field
      ? { field, order: prev.order === "asc" ? "desc" : "asc" }
      : { field, order: "desc" }
    )
  }, [])

  const fetchFn = useCallback(async (page: number, pageSize: number) => {
    return customerApi.listPaginated(page, pageSize, {
      nickname: filterNickname || undefined,
      member_type: filterIdentity || undefined,
      card_status: filterCardStatus || undefined,
      referrer: filterReferrer || undefined,
      referrer_handler: filterReferrerHandler || undefined,
      service_teacher: filterServiceTeacher || undefined,
      customer_quality: filterQuality || undefined,
      tag_ids: filterTagIds.length ? filterTagIds.join(",") : undefined,
      tag_match: filterTagMatch,
      sort_by: sortField || undefined,
      sort_order: sortOrder,
    })
  }, [filterNickname, filterIdentity, filterCardStatus, filterReferrer, filterReferrerHandler, filterServiceTeacher, filterQuality, filterTagIds, filterTagMatch, sortField, sortOrder])

  const queryKey = JSON.stringify([filterNickname, filterIdentity, filterCardStatus, filterReferrer, filterReferrerHandler, filterServiceTeacher, filterQuality, filterTagIds, filterTagMatch, sortField, sortOrder, pageSize])
  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex, loading, error, refresh } = useServerPagination(fetchFn, { queryKey, pageSize })

  // 外部触发刷新（新增/编辑/删除后）
  const refreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey !== refreshKeyRef.current) {
      refreshKeyRef.current = refreshKey
      refresh()
    }
  }, [refreshKey, refresh])

  return (
      <div className="dv-list w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <style>{`.dv-list th, .dv-list td { overflow: hidden; font-size: 12px; }`}</style>
        {error && <div role="alert" className="px-4 py-3 text-sm text-destructive">{error}<button type="button" className="ml-3 text-[#3370ff]" onClick={refresh}>重试</button></div>}
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 && !error ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table className="w-full min-w-0" style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {selectionMode && <TableHead style={{ width: 36 }}><input type="checkbox" aria-label="勾选本页客户" className="accent-[#3370ff]" checked={paginatedItems.length > 0 && paginatedItems.every(customer => selectedIds.includes(customer.id))} ref={element => { if (element) element.indeterminate = paginatedItems.some(customer => selectedIds.includes(customer.id)) && !paginatedItems.every(customer => selectedIds.includes(customer.id)) }} onChange={event => onSelectionChange?.(event.target.checked ? [...new Set([...selectedIds, ...paginatedItems.map(customer => customer.id)])] : selectedIds.filter(id => !paginatedItems.some(customer => customer.id === id)))} /></TableHead>}
                <TableHead className="pl-4" style={{ width: "12%" }}>客户</TableHead>
                <TableHead style={{ width: "9%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("member_type")}>
                    会员身份<SortArrow field="member_type" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "8%" }} aria-sort={sortField === "card_status" ? sortOrder === "asc" ? "ascending" : "descending" : "none"}>
                  <button type="button" className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("card_status")} aria-label="按卡次状态排序" title="按卡次状态配置顺序排序">
                    卡次状态<SortArrow field="card_status" sortField={sortField} sortOrder={sortOrder} />
                  </button>
                </TableHead>
                <TableHead style={{ width: "9%" }}>客户标签</TableHead>
                <TableHead style={{ width: "6%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("visit_count")}>
                    到店<SortArrow field="visit_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "6%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("activity_count")}>
                    活动<SortArrow field="activity_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "7%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("transaction_count")}>
                    交易笔数<SortArrow field="transaction_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "8%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("last_visit_date")}>
                    最近到访<SortArrow field="last_visit_date" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "7%" }}>Sales</TableHead>
                <TableHead style={{ width: "11%" }}>引流 / 承接</TableHead>
                <TableHead style={{ width: "9%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("referral_date")}>
                    引流日期<SortArrow field="referral_date" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "6%" }}>创建人</TableHead>
                {!readOnly && <TableHead className="text-right pr-4" style={{ width: "9%" }}>操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((c) => (
              <TableRow
                key={c.id}
                className="group cursor-pointer hover:bg-[#f7f8fa]"
                onClick={() => onSelectCustomer(c.id)}
              >
                {selectionMode && <TableCell onClick={event => event.stopPropagation()}><input type="checkbox" aria-label={`勾选${c.nickname || c.name}`} className="accent-[#3370ff]" checked={selectedIds.includes(c.id)} onChange={event => onSelectionChange?.(event.target.checked ? [...selectedIds, c.id] : selectedIds.filter(id => id !== c.id))} /></TableCell>}
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                      {(c.nickname || c.name || "客").charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-[#212631]">
                        {c.nickname || c.name || <EmptyValue />}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#a8b1bd]">
                        {[c.name && c.name !== c.nickname ? c.name : "", c.gender].filter(Boolean).join(" · ") || <EmptyValue />}
                      </span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <MemberLabels customer={{ member_type: c.member_type }} />
                </TableCell>
                <TableCell>
                  <MemberLabels customer={{ card_status: c.card_status, card_status_tone: c.card_status_tone }} />
                </TableCell>
                <TableCell>
                  {c.customer_tags?.length ? (
                    <span
                      className="block w-full truncate text-[12px] text-[#4e535a]"
                      title={c.customer_tags.map(tag => tag.name).join("、")}
                    >
                      {c.customer_tags.map(tag => tag.name).join("、")}
                    </span>
                  ) : (
                    <EmptyValue />
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">
                  {c.visit_count ? `${c.visit_count} 次` : <EmptyValue />}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">
                  {c.activity_count ? `${c.activity_count} 场` : <EmptyValue />}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">
                  {c.transaction_count ? `${c.transaction_count.toLocaleString()} 笔` : <EmptyValue />}
                </TableCell>
                <TableCell className="text-[12px] text-[#8f959e] tabular-nums">
                  {c.last_visit_date ? new Date(c.last_visit_date).toLocaleDateString("zh-CN") : <EmptyValue />}
                </TableCell>
                <TableCell className="text-[#2b2f36]">
                  <span className="block truncate" title={c.service_teacher?.trim() || undefined}>
                    {c.service_teacher?.trim() || <EmptyValue />}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center" title={`${c.referrer || "-"} / ${c.referrer_handler || "-"}`}>
                    <span className="min-w-0 truncate text-[#2b2f36]">{c.referrer || <EmptyValue />}</span>
                    <span className="mx-1.5 shrink-0 text-[#d0d3d6]">/</span>
                    <span className="min-w-0 truncate text-[#8f959e]">{c.referrer_handler || <EmptyValue />}</span>
                  </span>
                </TableCell>
                <TableCell className="text-[12px] text-[#a8b1bd] tabular-nums">
                  {c.referral_date ? new Date(c.referral_date).toLocaleDateString("zh-CN") : <EmptyValue />}
                </TableCell>
                <TableCell className="text-[12px] text-[#a8b1bd]">
                  {c.created_by || <EmptyValue />}
                </TableCell>
                {!readOnly && <TableCell className="text-right pr-4">
                  <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 px-1.5 text-[12px] font-normal text-[#3370ff]" onClick={() => onInviteCustomer(c)}>
                      邀约
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditCustomer(c.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteCustomer(c.id, c.nickname || c.name || c.id)}>
                      <img src={banCircleIcon} alt="停用" className="h-3.5 w-3.5" />
                    </Button>
                    </div>
                  </div>
                </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
        />
      </div>
  )
}
