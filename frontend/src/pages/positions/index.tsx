import { useEffect, useState } from "react"
import { GraduationCap, Plus, Trash2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { POSITION_COURSE_DEPT } from "@/lib/positions"

export default function PositionsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTeacher, setDeletingTeacher] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)

  const [selectedNicknames, setSelectedNicknames] = useState<string[]>([])

  const loadCustomers = () => {
    customerApi.list()
      .then(setCustomers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  // Filter customers who have POSITION_COURSE_DEPT position
  const courseTeachers = customers.filter(c => c.positions?.includes(POSITION_COURSE_DEPT))

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(courseTeachers)

  const handleAddTeachers = async () => {
    if (selectedNicknames.length === 0) return
    setSaving(true)
    try {
      for (const nickname of selectedNicknames) {
        const customer = customers.find(c => c.nickname === nickname)
        if (!customer) continue
        const existingPositions = customer.positions || []
        if (!existingPositions.includes(POSITION_COURSE_DEPT)) {
          await customerApi.update(customer.id, { positions: [...existingPositions, POSITION_COURSE_DEPT] })
        }
      }
      setSelectedNicknames([])
      setDialogOpen(false)
      loadCustomers()
    } catch (error) {
      console.error("添加失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingTeacher) return
    // Remove POSITION_COURSE_DEPT from positions instead of deleting the user
    const newPositions = deletingTeacher.positions.filter(p => p !== POSITION_COURSE_DEPT)
    await customerApi.update(deletingTeacher.id, { positions: newPositions })
    setDeleteDialogOpen(false)
    setDeletingTeacher(null)
    loadCustomers()
  }

  const resetForm = () => {
    setSelectedNicknames([])
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">课程部</h1>
          <p className="text-xs text-muted-foreground mt-1.5">
            共 {courseTeachers.length} 位课程部
          </p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => { resetForm(); setDialogOpen(true) }}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 新增弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增课程部</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">搜索用户</span>
              <CustomerSearchInput
                customers={customers}
                value={selectedNicknames}
                onChange={(v) => setSelectedNicknames(v as string[])}
                multi
                excludeIds={courseTeachers.map(t => t.id)}
                placeholder="输入昵称或姓名搜索..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddTeachers} disabled={saving || selectedNicknames.length === 0}>
                {saving ? "添加中..." : `添加 (${selectedNicknames.length} 人)`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>移除课程部</AlertDialogTitle>
            <AlertDialogDescription>
              确定要将 {deletingTeacher?.nickname || deletingTeacher?.name} 从课程部中移除吗？用户数据不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 课程部列表 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
        ) : courseTeachers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <GraduationCap className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">暂无课程部</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加课程部</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">课程老师</TableHead>
                <TableHead>上课次数</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-medium text-muted-foreground">
                        {(teacher.nickname || teacher.name || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <span className="text-[13px] text-[#2b2f36] truncate block">{teacher.nickname || "-"}</span>
                        {teacher.name && teacher.name !== teacher.nickname && (
                          <span className="text-[11px] text-[#8f959e]">{teacher.name}</span>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36]">{teacher.visit_count || 0}</span>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingTeacher(teacher); setDeleteDialogOpen(true) }}>
                      <Trash2 className="h-3 w-3 text-destructive" />
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
      </div>
    </div>
  )
}
