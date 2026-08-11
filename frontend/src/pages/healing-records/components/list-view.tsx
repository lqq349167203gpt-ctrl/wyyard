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
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"
import { EmptyValue } from "@/components/empty-value"

const SORT_FIELDS = ["member_type", "visit_count", "activity_count", "total_payment", "last_visit_date", "referral_date"] as const
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
  filterReferrer: string
  filterReferrerHandler: string
  filterTagIds: string[]
  filterTagMatch: "any" | "all"
  refreshKey?: number
  summary?: import("@/lib/api").DashboardSummary | null
}

export default function ListView({ onSelectCustomer, onInviteCustomer, onDeleteCustomer, onEditCustomer, filterNickname, filterIdentity, filterReferrer, filterReferrerHandler, filterTagIds, filterTagMatch, refreshKey = 0, summary = null }: Props) {
  const { permissions: cpCustomers, ready: permReady } = useCustomerPermissions("customers")

  // Keep latest permission values in refs so the fetch function always reads current state
  const permReadyRef = useRef(permReady)
  permReadyRef.current = permReady
  const cpRef = useRef(cpCustomers)
  cpRef.current = cpCustomers

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
    // Wait for permissions to be ready
    if (!permReadyRef.current) {
      return { items: [] as Customer[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }

    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
    const allowed = cpRef.current

    // Non-admin with no allowed types → empty result
    if (currentUser.role !== "超级管理员" && allowed.length === 0) {
      return { items: [] as Customer[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }

    // Non-admin with permission restrictions → pass allowed types to backend
    const memberTypes = currentUser.role !== "超级管理员" && allowed.length > 0
      ? allowed.join(",")
      : undefined

    return customerApi.listPaginated(page, pageSize, {
      nickname: filterNickname || undefined,
      member_type: filterIdentity || undefined,
      referrer: filterReferrer || undefined,
      referrer_handler: filterReferrerHandler || undefined,
      tag_ids: filterTagIds.length ? filterTagIds.join(",") : undefined,
      tag_match: filterTagMatch,
      member_types: memberTypes,
      sort_by: sortField || undefined,
      sort_order: sortOrder,
    })
  }, [filterNickname, filterIdentity, filterReferrer, filterReferrerHandler, filterTagIds, filterTagMatch, sortField, sortOrder])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, resetPage, startIndex, endIndex, loading, refresh } = useServerPagination(fetchFn)

  // 外部触发刷新（新增/编辑/删除后）
  const refreshKeyRef = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey !== refreshKeyRef.current) {
      refreshKeyRef.current = refreshKey
      refresh()
    }
  }, [refreshKey, refresh])

  // Re-fetch when permissions become ready (skip initial mount when already ready)
  const isFirst = useRef(true)
  useEffect(() => {
    if (permReady && !isFirst.current) {
      refresh()
    }
    isFirst.current = false
  }, [permReady, refresh])

  // 筛选条件变化时回到第一页（跳过首次挂载）
  const filterInitRef = useRef(true)
  useEffect(() => {
    if (filterInitRef.current) { filterInitRef.current = false; return }
    resetPage()
  }, [filterNickname, filterIdentity, filterReferrer, filterReferrerHandler, filterTagIds, filterTagMatch, resetPage])

  // 排序变化时回到第一页
  useEffect(() => {
    resetPage()
  }, [sortField, sortOrder, resetPage])

  return (
      <div className="dv-list w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        <style>{`.dv-list th, .dv-list td { overflow: hidden; font-size: 13px; }`}</style>
        {loading || !permReady ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table className="w-full min-w-0" style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "13%" }}>客户</TableHead>
                <TableHead style={{ width: "9%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("member_type")}>
                    会员身份<SortArrow field="member_type" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "10%" }}>客户标签</TableHead>
                <TableHead style={{ width: "7%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("visit_count")}>
                    到店<SortArrow field="visit_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "7%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("activity_count")}>
                    活动<SortArrow field="activity_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "8%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("total_payment")}>
                    消费<SortArrow field="total_payment" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "9%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("last_visit_date")}>
                    最近到访<SortArrow field="last_visit_date" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "12%" }}>引流 / 承接</TableHead>
                <TableHead style={{ width: "9%" }}>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("referral_date")}>
                    引流日期<SortArrow field="referral_date" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead style={{ width: "7%" }}>创建人</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "9%" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((c) => (
              <TableRow
                key={c.id}
                className="group cursor-pointer hover:bg-[#f7f8fa]"
                onClick={() => onSelectCustomer(c.id)}
              >
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[11px] font-medium text-[#646a73]">
                      {(c.nickname || c.name || "客").charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] font-medium text-[#212631]">
                        {c.nickname || c.name || <EmptyValue />}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#a8b1bd]">
                        {[c.name && c.name !== c.nickname ? c.name : "", c.gender].filter(Boolean).join(" · ") || <EmptyValue />}
                      </span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {c.member_type ? (
                    <span className="inline-block max-w-[110px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[11px] text-[#4e535a]">{c.member_type}</span>
                  ) : (
                    <EmptyValue />
                  )}
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
                <TableCell className="tabular-nums text-[#2b2f36]">¥{(c.total_payment ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-[11px] text-[#8f959e] tabular-nums">
                  {c.last_visit_date ? new Date(c.last_visit_date).toLocaleDateString("zh-CN") : <EmptyValue />}
                </TableCell>
                <TableCell>
                  <span className="flex min-w-0 items-center" title={`${c.referrer || "-"} / ${c.referrer_handler || "-"}`}>
                    <span className="min-w-0 truncate text-[#2b2f36]">{c.referrer || <EmptyValue />}</span>
                    <span className="mx-1.5 shrink-0 text-[#d0d3d6]">/</span>
                    <span className="min-w-0 truncate text-[#8f959e]">{c.referrer_handler || <EmptyValue />}</span>
                  </span>
                </TableCell>
                <TableCell className="text-[11px] text-[#a8b1bd] tabular-nums">
                  {c.referral_date ? new Date(c.referral_date).toLocaleDateString("zh-CN") : <EmptyValue />}
                </TableCell>
                <TableCell className="text-[11px] text-[#a8b1bd]">
                  {c.created_by || <EmptyValue />}
                </TableCell>
                <TableCell className="text-right pr-4">
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
                </TableCell>
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
        />
      </div>
  )
}
