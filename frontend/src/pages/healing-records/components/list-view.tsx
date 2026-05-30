import { useRef, useCallback, useEffect } from "react"
import { Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type Customer } from "@/lib/api"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

interface Props {
  onSelectCustomer: (id: string) => void
  onDeleteCustomer: (id: string, nickname: string) => void
  onEditCustomer: (id: string) => void
  filterNickname: string
  filterIdentity: string
  filterReferrer: string
  filterReferrerHandler: string
}

export default function ListView({ onSelectCustomer, onDeleteCustomer, onEditCustomer, filterNickname, filterIdentity, filterReferrer, filterReferrerHandler }: Props) {
  const { permissions: cpCustomers, ready: permReady } = useCustomerPermissions("customers")

  // Keep latest permission values in refs so the fetch function always reads current state
  const permReadyRef = useRef(permReady)
  permReadyRef.current = permReady
  const cpRef = useRef(cpCustomers)
  cpRef.current = cpCustomers

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
    })
  }, [filterNickname, filterIdentity, filterReferrer, filterReferrerHandler])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex, loading, refresh } = useServerPagination(fetchFn)

  // Re-fetch when permissions become ready (skip initial mount when already ready)
  const isFirst = useRef(true)
  useEffect(() => {
    if (permReady && !isFirst.current) {
      refresh()
    }
    isFirst.current = false
  }, [permReady, refresh])

  return (
    <div className="bg-white rounded-lg">
      {loading || !permReady ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
      ) : paginatedItems.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">昵称</TableHead>
              <TableHead>身份</TableHead>
              <TableHead>到店次数</TableHead>
              <TableHead>引流人</TableHead>
              <TableHead>创建日期</TableHead>
              <TableHead className="text-right pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map((c) => (
              <TableRow
                key={c.id}
                className="group cursor-pointer hover:bg-[#f7f8fa]"
                onClick={() => onSelectCustomer(c.id)}
              >
                <TableCell className="pl-4 text-[#2b2f36]">{c.nickname || c.name || "-"}</TableCell>
                <TableCell className="text-[#2b2f36]">{c.member_type || "-"}</TableCell>
                <TableCell className="text-[#2b2f36]">{c.visit_count}</TableCell>
                <TableCell className="text-[#2b2f36]">{c.referrer || "-"}</TableCell>
                <TableCell className="text-[#8f959e]">{new Date(c.created_at).toLocaleDateString("zh-CN")}</TableCell>
                <TableCell className="text-right pr-4">
                  <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEditCustomer(c.id)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteCustomer(c.id, c.nickname)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
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
