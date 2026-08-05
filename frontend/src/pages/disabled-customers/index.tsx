import { useState, useEffect, useCallback, useMemo } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { PaginationBar } from "@/components/pagination-bar"
import { customerApi, type DisabledCustomer } from "@/lib/api"

const PAGE_SIZE = 20

export default function DisabledCustomersPage() {
  const [customers, setCustomers] = useState<DisabledCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // 启用确认
  const [restoreTarget, setRestoreTarget] = useState<DisabledCustomer | null>(null)
  // 彻底删除确认
  const [deleteTarget, setDeleteTarget] = useState<DisabledCustomer | null>(null)
  const [deleteError, setDeleteError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const data = await customerApi.listDisabled()
      setCustomers(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // 客户端分页
  const totalPages = Math.max(1, Math.ceil(customers.length / PAGE_SIZE))
  const paginatedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE
    return customers.slice(start, start + PAGE_SIZE)
  }, [customers, page])

  // 数据变化时回到第一页
  useEffect(() => { setPage(1) }, [customers.length])

  const handleRestore = async () => {
    if (!restoreTarget) return
    try {
      await customerApi.restore(restoreTarget.id)
      setRestoreTarget(null)
      loadData()
    } catch {
      // ignore
    }
  }

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError("")
    try {
      await customerApi.permanentDelete(deleteTarget.id)
      setDeleteTarget(null)
      loadData()
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "删除失败")
    } finally {
      setDeleting(false)
    }
  }

  const startIndex = customers.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const endIndex = Math.min(page * PAGE_SIZE, customers.length)

  return (
    <div className="min-h-full space-y-3 bg-[#f4f5f6] p-4">
      <div className="flex items-center rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631]">停用客户</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5">管理已停用的客户，可恢复或彻底删除</span>
      </div>

      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">昵称</TableHead>
                  <TableHead>姓名</TableHead>
                  <TableHead>手机号</TableHead>
                  <TableHead>会员身份</TableHead>
                  <TableHead>停用时间</TableHead>
                  <TableHead>操作人</TableHead>
                  <TableHead className="text-right pr-4">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7} className="text-center py-16 text-sm text-muted-foreground">
                      暂无停用客户
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map((c) => (
                    <TableRow key={c.id} className="hover:bg-[#f7f8fa]">
                      <TableCell className="pl-4 font-medium text-[#212631]">{c.nickname || "-"}</TableCell>
                      <TableCell className="text-[#4e535a]">{c.name || "-"}</TableCell>
                      <TableCell className="text-[#4e535a]">{c.phone || "-"}</TableCell>
                      <TableCell>
                        {c.member_type ? (
                          <span className="inline-flex rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[12px] text-[#4e535a]">{c.member_type}</span>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-[12px] text-[#a8b1bd]">
                        {c.deleted_at ? new Date(c.deleted_at).toLocaleDateString("zh-CN") : "-"}
                      </TableCell>
                      <TableCell className="text-[#4e535a]">{c.deleted_by || "-"}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setRestoreTarget(c)}>
                            启用
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(c)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              currentPage={page}
              totalPages={totalPages}
              totalItems={customers.length}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {/* 启用确认弹窗 */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(open) => { if (!open) setRestoreTarget(null) }}>
        <AlertDialogContent className="w-[360px]">
          <AlertDialogHeader>
            <AlertDialogTitle>启用客户</AlertDialogTitle>
            <AlertDialogDescription>
              确定要启用「{restoreTarget?.nickname}」吗？启用后客户资料和历史关联数据将重新可见。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore}>确定启用</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 彻底删除确认弹窗 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteError("") } }}>
        <AlertDialogContent className="w-[400px]">
          <AlertDialogHeader>
            <AlertDialogTitle>彻底删除</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>确定要彻底删除「{deleteTarget?.nickname}」吗？此操作不可撤销。</span>
              {deleteError && <span className="block text-[#f54a45]">{deleteError}</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} disabled={deleting} className="bg-[#f54a45] hover:bg-[#e03d3d]">
              {deleting ? "删除中..." : "彻底删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
