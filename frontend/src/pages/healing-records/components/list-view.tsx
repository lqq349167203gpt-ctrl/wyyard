import { useRef, useCallback, useEffect, useState } from "react"
import { ChevronRight, Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type Customer } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

/** 空值占位：极淡极短圆角小横（4×2），与详情页 DvEmpty 一致 */
const DvEmpty = ({ className = "" }: { className?: string }) => (
  <span className={`inline-block align-middle h-[2px] w-[4px] rounded-full bg-[#e5e8eb] shrink-0 ${className}`} />
)

const SORT_FIELDS = ["member_type", "visit_count", "activity_count", "total_payment", "last_visit_date", "created_at"] as const
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
  onDeleteCustomer: (id: string, nickname: string) => void
  onEditCustomer: (id: string) => void
  filterNickname: string
  filterIdentity: string
  filterReferrer: string
  filterReferrerHandler: string
  refreshKey?: number
  summary?: import("@/lib/api").DashboardSummary | null
}

export default function ListView({ onSelectCustomer, onDeleteCustomer, onEditCustomer, filterNickname, filterIdentity, filterReferrer, filterReferrerHandler, refreshKey = 0, summary = null }: Props) {
  const { permissions: cpCustomers, ready: permReady } = useCustomerPermissions("customers")

  // Keep latest permission values in refs so the fetch function always reads current state
  const permReadyRef = useRef(permReady)
  permReadyRef.current = permReady
  const cpRef = useRef(cpCustomers)
  cpRef.current = cpCustomers

  // 排序状态
  const [sortField, setSortField] = useState<SortField | null>(null)
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const sortFieldRef = useRef(sortField)
  sortFieldRef.current = sortField
  const sortOrderRef = useRef(sortOrder)
  sortOrderRef.current = sortOrder

  const handleSort = useCallback((field: SortField) => {
    if (sortFieldRef.current === field) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
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
      member_types: memberTypes,
      sort_by: sortFieldRef.current || undefined,
      sort_order: sortOrderRef.current || undefined,
    })
  }, [filterNickname, filterIdentity, filterReferrer, filterReferrerHandler])

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
  }, [filterNickname, filterIdentity, filterReferrer, filterReferrerHandler, resetPage])

  // 排序变化时回到第一页
  useEffect(() => {
    resetPage()
  }, [sortField, sortOrder, resetPage])

  return (
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)]">
        {loading || !permReady ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">客户</TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("member_type")}>
                    会员身份<SortArrow field="member_type" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("visit_count")}>
                    到店<SortArrow field="visit_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("activity_count")}>
                    活动<SortArrow field="activity_count" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("total_payment")}>
                    消费<SortArrow field="total_payment" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("last_visit_date")}>
                    最近到访<SortArrow field="last_visit_date" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>引流 / 承接</TableHead>
                <TableHead>
                  <span className="inline-flex items-center cursor-pointer select-none" onClick={() => handleSort("created_at")}>
                    创建日期<SortArrow field="created_at" sortField={sortField} sortOrder={sortOrder} />
                  </span>
                </TableHead>
                <TableHead>创建人</TableHead>
                <TableHead className="w-[88px] text-right pr-4">操作</TableHead>
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
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                      {(c.nickname || c.name || "客").charAt(0)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-[#212631]">
                        {c.nickname || c.name || <DvEmpty />}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#a8b1bd]">
                        {[c.name && c.name !== c.nickname ? c.name : "", c.gender, c.age ? `${c.age} 岁` : ""].filter(Boolean).join(" · ") || <DvEmpty />}
                      </span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {c.member_type ? (
                    <span className="inline-flex rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[12px] text-[#4e535a]">{c.member_type}</span>
                  ) : (
                    <DvEmpty />
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">
                  {c.visit_count ? `${c.visit_count} 次` : <DvEmpty />}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">
                  {c.activity_count ? `${c.activity_count} 场` : <DvEmpty />}
                </TableCell>
                <TableCell className="tabular-nums text-[#2b2f36]">¥{(c.total_payment ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-[12px] text-[#8f959e] tabular-nums">
                  {c.last_visit_date ? new Date(c.last_visit_date).toLocaleDateString("zh-CN") : <DvEmpty />}
                </TableCell>
                <TableCell>
                  <span className="text-[#2b2f36]">{c.referrer || <DvEmpty />}</span>
                  <span className="mx-1.5 text-[#d0d3d6]">/</span>
                  <span className="text-[#8f959e]">{c.referrer_handler || <DvEmpty />}</span>
                </TableCell>
                <TableCell className="text-[12px] text-[#a8b1bd] tabular-nums">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString("zh-CN") : <DvEmpty />}
                </TableCell>
                <TableCell className="text-[12px] text-[#a8b1bd]">
                  {c.created_by || <DvEmpty />}
                </TableCell>
                <TableCell className="text-right pr-4">
                  <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditCustomer(c.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteCustomer(c.id, c.nickname || c.name || c.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                    </div>
                    <ChevronRight className="ml-1 h-3.5 w-3.5 text-[#c9cdd4] transition-colors group-hover:text-[#79838f]" />
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
