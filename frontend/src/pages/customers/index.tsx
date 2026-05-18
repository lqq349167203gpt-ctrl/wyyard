import { useEffect, useState } from "react"
import { Plus, Trash2, Search, Loader2 } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { customerApi, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const POSITION_COLORS: Record<string, string> = {
  "成就君": "bg-[#f0f5ff] text-[#3370ff] border-[#d6e4ff]",
  "能量结老师": "bg-[#fff7e6] text-[#d48806] border-[#ffe7ba]",
  "课程老师": "bg-[#f6ffed] text-[#52c41a] border-[#d9f7be]",
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<Customer | null>(null)
  const [editing, setEditing] = useState<Customer | null>(null)

  const loadCustomers = () => {
    customerApi.list()
      .then(setCustomers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadCustomers() }, [])

  const filtered = customers.filter(c => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      (c.nickname || "").toLowerCase().includes(q) ||
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").includes(q) ||
      (c.wechat || "").includes(q) ||
      (c.member_type || "").toLowerCase().includes(q)
    )
  })

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filtered)

  const handleDelete = async () => {
    if (!deleting) return
    await customerApi.delete(deleting.id)
    setDeleteDialogOpen(false)
    setDeleting(null)
    loadCustomers()
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">用户管理</h1>
          <p className="text-xs text-muted-foreground mt-1.5">管理所有客户信息</p>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={() => { setEditing(null); setDialogOpen(true) }}>
          <Plus className="mr-1 h-3 w-3" /> 新增
        </Button>
      </div>

      <div className="bg-white rounded-lg flex flex-col" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="flex items-center gap-3 px-4 h-[45px] border-b border-[#f0f0f0] shrink-0">
          <div className="relative flex-1 max-w-[300px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8f959e]" />
            <Input
              placeholder="搜索昵称、姓名、手机号..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); goToPage(1) }}
              className="h-8 pl-8 text-[12px] rounded-md border-[#e0e0e0]"
            />
          </div>
          <span className="text-[11px] text-[#8f959e]">{filtered.length} 人</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">暂无数据</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium pl-4">昵称</TableHead>
                  <TableHead className="text-xs font-medium">姓名</TableHead>
                  <TableHead className="text-xs font-medium">手机号</TableHead>
                  <TableHead className="text-xs font-medium">会员类型</TableHead>
                  <TableHead className="text-xs font-medium">身份</TableHead>
                  <TableHead className="text-xs font-medium">到场次数</TableHead>
                  <TableHead className="text-xs text-right pr-4">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs pl-4 font-medium">{c.nickname || "-"}</TableCell>
                    <TableCell className="text-xs">{c.name || "-"}</TableCell>
                    <TableCell className="text-xs">{c.phone || "-"}</TableCell>
                    <TableCell className="text-xs">{c.member_type || "-"}</TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(c.positions || []).map(p => (
                          <span key={p} className={`inline-block px-1.5 py-0.5 rounded text-[10px] border ${POSITION_COLORS[p] || "bg-gray-50 text-[#8f959e] border-gray-200"}`}>
                            {p}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{c.visit_count || 0}</TableCell>
                    <TableCell className="text-right pr-4">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeleting(c); setDeleteDialogOpen(true) }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      </div>

      {/* TODO: Add/Edit Dialog - to be implemented when needed */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editing ? "编辑用户" : "新增用户"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <p className="text-sm text-muted-foreground">用户新增/编辑功能开发中...</p>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除用户</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 {deleting?.nickname || deleting?.name} 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
