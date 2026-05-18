import { useEffect, useState, useMemo } from "react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { visitApi, type VisitRecord } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function ListView() {
  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 筛选状态
  const [filterNickname, setFilterNickname] = useState("")
  const [filterArrived, setFilterArrived] = useState<string>("all")
  const [filterStartDate, setFilterStartDate] = useState("")
  const [filterEndDate, setFilterEndDate] = useState("")

  const load = () => {
    visitApi.list()
      .then(setVisits)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const filteredVisits = useMemo(() => {
    return visits.filter(v => {
      if (filterNickname && !v.nickname?.toLowerCase().includes(filterNickname.toLowerCase())) return false
      if (filterArrived === "arrived" && !v.arrived) return false
      if (filterArrived === "not_arrived" && v.arrived) return false
      if (filterStartDate && v.visit_date < filterStartDate) return false
      if (filterEndDate && v.visit_date > filterEndDate) return false
      return true
    })
  }, [visits, filterNickname, filterArrived, filterStartDate, filterEndDate])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredVisits)

  const handleDelete = async () => {
    if (!deleteId) return
    await visitApi.delete(deleteId)
    setDeleteId(null)
    load()
  }

  return (
    <div className="bg-white rounded-lg">
      {/* 筛选栏 */}
      <div className="px-4 py-3 border-b border-[#f0f0f0] flex items-end gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">昵称</label>
          <Input
            placeholder="搜索昵称"
            value={filterNickname}
            onChange={(e) => setFilterNickname(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">到店状态</label>
          <select
            value={filterArrived}
            onChange={(e) => setFilterArrived(e.target.value)}
            className="h-8 w-24 rounded-md border border-[#e0e0e0] bg-white px-2.5 text-xs text-[#2b2f36] outline-none focus:border-[#3370ff] cursor-pointer"
          >
            <option value="all">全部</option>
            <option value="arrived">已到店</option>
            <option value="not_arrived">未到店</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">开始日期</label>
          <Input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[12px] text-[#8f959e]">结束日期</label>
          <Input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className="h-8 text-xs w-36"
          />
        </div>
        <span className="text-xs text-[#8f959e] ml-2 pb-1">{filteredVisits.length} 条记录</span>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
      ) : filteredVisits.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">暂无数据</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">昵称</TableHead>
              <TableHead>会员身份</TableHead>
              <TableHead>历史到场</TableHead>
              <TableHead>本次需求</TableHead>
              <TableHead>预计到场时间</TableHead>
              <TableHead>是否到店</TableHead>
              <TableHead className="text-right pr-4">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium text-muted-foreground">
                      {(v.nickname || "?")[0]}
                    </div>
                    <span className="text-[13px] text-[#2b2f36]">{v.nickname}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {v.member_type ? (
                    <span className="text-[13px] text-[#2b2f36]">{v.member_type}</span>
                  ) : (
                    <span className="text-[13px] text-[#8f959e]">-</span>
                  )}
                </TableCell>
                <TableCell className="text-[13px] text-[#2b2f36]">{v.visit_count} 次</TableCell>
                <TableCell className="text-[13px] text-[#2b2f36] max-w-[200px] truncate">{v.needs || <span className="text-[#8f959e]">-</span>}</TableCell>
                <TableCell className="text-[13px] text-[#8f959e]">{v.visit_time || "09:00"}</TableCell>
                <TableCell>
                  <span className={`text-[12px] px-2 py-0.5 rounded-full ${
                    v.arrived
                      ? "bg-green-50 text-green-600"
                      : "bg-gray-50 text-[#8f959e]"
                  }`}>
                    {v.arrived ? "已到店" : "未到店"}
                  </span>
                </TableCell>
                <TableCell className="text-right pr-4">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(v.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
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

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条到场记录吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
