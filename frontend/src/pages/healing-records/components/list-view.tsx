import { useEffect, useState } from "react"
import { Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { customerApi, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

interface Props {
  onSelectCustomer: (id: string) => void
  onDeleteCustomer: (id: string) => void
}

export default function ListView({ onSelectCustomer, onDeleteCustomer }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    customerApi.list()
      .then((data) => setCustomers(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(customers)

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>年龄</TableHead>
                <TableHead>身份</TableHead>
                <TableHead>引流人</TableHead>
                <TableHead>创建日期</TableHead>
                <TableHead>到店次数</TableHead>
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
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium text-muted-foreground">
                        {(c.nickname || c.name || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[12px] text-[#2b2f36] truncate block">{c.nickname || "-"}</span>
                        {c.name && c.name !== c.nickname && (
                          <span className="text-[11px] text-[#8f959e]">{c.name}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-[12px] text-[#2b2f36]">{c.age || "-"}</TableCell>
                  <TableCell>
                    {c.member_type ? (
                      <span className="text-[12px] text-[#2b2f36]">{c.member_type}</span>
                    ) : (
                      <span className="text-[12px] text-[#8f959e]">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-[12px] text-[#2b2f36]">{c.referrer || "-"}</TableCell>
                  <TableCell className="text-[12px] text-[#8f959e]">{new Date(c.created_at).toLocaleDateString("zh-CN")}</TableCell>
                  <TableCell className="text-[12px] text-[#2b2f36]">{c.visit_count}</TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onSelectCustomer(c.id)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onDeleteCustomer(c.id)}>
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
    </div>
  )
}
