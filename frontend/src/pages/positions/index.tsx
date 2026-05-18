import { useEffect, useState, useRef } from "react"
import { GraduationCap, Plus, Trash2, Loader2, X } from "lucide-react"
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
import { customerApi, visitApi, type Customer, type CustomerSearchResult } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export default function PositionsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTeacher, setDeletingTeacher] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)

  // Search state
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomers, setSelectedCustomers] = useState<CustomerSearchResult[]>([])
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const loadCustomers = () => {
    customerApi.list()
      .then(setCustomers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadCustomers()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Filter customers who have "课程部" position
  const courseTeachers = customers.filter(c => c.positions?.includes("课程部"))

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(courseTeachers)

  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await visitApi.searchCustomers(keyword)
        // Filter out users who are already course teachers
        setSearchResults(results.filter((r) => !courseTeachers.some((t) => t.id === r.id) && !selectedCustomers.some((s) => s.id === r.id)))
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomers([...selectedCustomers, customer])
    setSearchKeyword(""); setSearchResults([]); setShowDropdown(false)
  }

  const handleRemoveCustomer = (id: string) => {
    setSelectedCustomers(selectedCustomers.filter((c) => c.id !== id))
  }

  const handleAddTeachers = async () => {
    if (selectedCustomers.length === 0) return
    setSaving(true)
    try {
      for (const customer of selectedCustomers) {
        // Find the full customer data to get existing positions
        const fullCustomer = await customerApi.get(customer.id)
        const existingPositions = fullCustomer.positions || []
        if (!existingPositions.includes("课程部")) {
          await customerApi.update(customer.id, { positions: [...existingPositions, "课程部"] })
        }
      }
      setSelectedCustomers([])
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
    // Remove "课程部" from positions instead of deleting the user
    const newPositions = deletingTeacher.positions.filter(p => p !== "课程部")
    await customerApi.update(deletingTeacher.id, { positions: newPositions })
    setDeleteDialogOpen(false)
    setDeletingTeacher(null)
    loadCustomers()
  }

  const resetForm = () => {
    setSearchKeyword(""); setSearchResults([]); setShowDropdown(false); setSelectedCustomers([])
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
            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={dropdownRef}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">搜索用户</span>
              <div className="relative">
                <Input value={searchKeyword} onChange={(e) => handleSearch(e.target.value)} placeholder="输入昵称或姓名搜索..." onFocus={() => searchResults.length > 0 && setShowDropdown(true)} />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted" onClick={() => handleSelectCustomer(customer)}>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{customer.nickname}</span>
                          {customer.name && customer.name !== customer.nickname && (
                            <span className="text-xs text-muted-foreground">({customer.name})</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{customer.member_type || "新人"} · 到场 {customer.visit_count} 次</span>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-sm text-muted-foreground text-center">未找到匹配的用户</div>
                )}
              </div>
            </div>

            {selectedCustomers.length > 0 && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-1.5">已选用户</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedCustomers.map((c) => (
                    <div key={c.id} className="flex items-center gap-1.5 rounded border bg-muted/50 px-2.5 py-1 text-sm">
                      <span className="font-medium text-xs">{c.nickname}</span>
                      <button onClick={() => handleRemoveCustomer(c.id)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleAddTeachers} disabled={saving || selectedCustomers.length === 0}>
                {saving ? "添加中..." : `添加 (${selectedCustomers.length} 人)`}
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
