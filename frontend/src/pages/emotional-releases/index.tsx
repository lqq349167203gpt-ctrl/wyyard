import { useEffect, useState, useRef, useCallback } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, Heart, Search, X } from "lucide-react"
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
import { customerApi, emotionalReleaseApi, type Customer, type EmotionalRelease } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

export function EmotionalReleasesContent({ embedded }: { embedded?: boolean } = {}) {
  const enterToNext = useEnterToNext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<EmotionalRelease | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formCustomerId, setFormCustomerId] = useState("")
  const [formNickname, setFormNickname] = useState("")
  const [formPurchaseCount, setFormPurchaseCount] = useState("")
  const [formAmount, setFormAmount] = useState("")
  const [formCloserId, setFormCloserId] = useState("")
  const [formCloserName, setFormCloserName] = useState("")

  // 搜索
  const [searchNickname, setSearchNickname] = useState("")
  const [searchCloserName, setSearchCloserName] = useState("")
  const appliedNicknameRef = useRef("")
  const appliedCloserNameRef = useRef("")
  const [filterKey, setFilterKey] = useState(0)

  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersReady, setCustomersReady] = useState(false)

  const cpRef = useRef(cp)
  cpRef.current = cp
  const customersRef = useRef<Customer[]>([])
  const customersReadyRef = useRef(false)
  const isSuperAdminRef = useRef(false)

  const fetchFn = useCallback(async (page: number, pageSize: number) => {
    if (!customersReadyRef.current) {
      return { items: [] as EmotionalRelease[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }
    const params: any = {}
    if (!isSuperAdminRef.current) {
      const allowed = customersRef.current
      if (allowed.length === 0) {
        return { items: [] as EmotionalRelease[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
      }
      params.customer_ids = allowed.map(c => c.id).join(",")
    }
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedCloserNameRef.current) params.closer_name = appliedCloserNameRef.current
    return emotionalReleaseApi.listPaginated(page, pageSize, Object.keys(params).length > 0 ? params : undefined)
  }, [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex, loading, refresh } = useServerPagination(fetchFn)

  useEffect(() => {
    if (!permReady) return
    customerApi.list().then((data) => {
      let filtered = data
      const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
      isSuperAdminRef.current = cu.role === "超级管理员"
      if (cu.role !== "超级管理员") {
        if (cpRef.current.length > 0) {
          filtered = data.filter(c => c.member_type && cpRef.current.includes(c.member_type))
        } else {
          filtered = []
        }
      }
      setCustomers(filtered)
      customersRef.current = filtered
      customersReadyRef.current = true
      setCustomersReady(true)
      refresh()
    }).catch(() => {
      customersReadyRef.current = true
      setCustomersReady(true)
      refresh()
    })
  }, [permReady])

  const handleSearch = () => {
    appliedNicknameRef.current = searchNickname
    appliedCloserNameRef.current = searchCloserName
    setFilterKey(k => k + 1)
    refresh()
  }

  const handleClearSearch = () => {
    setSearchNickname("")
    setSearchCloserName("")
    appliedNicknameRef.current = ""
    appliedCloserNameRef.current = ""
    setFilterKey(k => k + 1)
    refresh()
  }

  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormCustomerId("")
    setFormNickname("")
    setFormPurchaseCount("")
    setFormAmount("")
    setFormCloserId("")
    setFormCloserName("")
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: EmotionalRelease) => {
    setEditingItem(item)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormPurchaseCount(String(item.purchase_count))
    setFormAmount(String(item.amount))
    setFormCloserId(item.closer_id || "")
    setFormCloserName(item.closer_name || "")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCustomerId) return
    setSaving(true)
    try {
      const data = {
        customer_id: formCustomerId,
        nickname: formNickname,
        purchase_count: parseInt(formPurchaseCount) || 0,
        amount: parseFloat(formAmount) || 0,
        closer_id: formCloserId || null,
        closer_name: formCloserName || null,
      }
      if (editingItem) {
        await emotionalReleaseApi.update(editingItem.id, data)
      } else {
        await emotionalReleaseApi.create(data)
      }
      setDialogOpen(false)
      refresh()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await emotionalReleaseApi.delete(deleteId)
      setDeleteId(null)
      refresh()
    } catch (e: any) {
      setDeleteError(e?.message || "删除失败")
      setDeleteId(null)
    }
  }

  const content = (
    <>
      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchNickname}
            onChange={(v) => setSearchNickname(typeof v === "string" ? v : "")}
            placeholder="搜索用户"
            filterSelected={false}
          />
        </div>
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchCloserName}
            onChange={(v) => setSearchCloserName(typeof v === "string" ? v : "")}
            placeholder="搜索成交人"
            filterSelected={false}
          />
        </div>
        <button onClick={handleSearch} className="h-8 px-4 rounded-md bg-[#3370ff] text-white text-[12px] hover:bg-[#2860e1] flex items-center gap-1">
          <Search className="h-3.5 w-3.5" /> 查询
        </button>
        <button onClick={handleClearSearch} className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1">
          <X className="h-3.5 w-3.5" /> 清空
        </button>
        <div className="flex-1" />
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          {totalItems > 0 && (
            <span>共 {totalItems} 条记录</span>
          )}
        </p>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading || !customersReady ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Heart className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无情绪释放记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">录入日期</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>购买次数</TableHead>
                <TableHead>付费金额</TableHead>
                <TableHead>成交人</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{item.created_at.split("T")[0]}</TableCell>
                  <TableCell className="text-[#2b2f36] font-medium">{item.nickname}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.purchase_count} 次</TableCell>
                  <TableCell className="text-[#2b2f36]">¥{item.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.closer_name || <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(item)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(item.id)}>
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

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingItem ? "编辑记录" : "新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">用户</span>
              <CustomerSearchInput
                customers={customers}
                value={formNickname || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) { setFormNickname(""); setFormCustomerId("") }
                }}
                onSelectItem={(c) => { setFormNickname(c.nickname); setFormCustomerId(c.id) }}
                placeholder="搜索客户昵称"
                disabled={!!editingItem}
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input type="number" value={formPurchaseCount} onChange={(e) => setFormPurchaseCount(e.target.value)} placeholder="0" min="0" className="h-8 text-xs" />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="h-8 text-xs" />
            </div>

            {/* 成交人搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成交人</span>
              <CustomerSearchInput
                customers={customers}
                value={formCloserName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) { setFormCloserName(""); setFormCloserId("") }
                }}
                onSelectItem={(c) => { setFormCloserName(c.nickname); setFormCloserId(c.id) }}
                placeholder="搜索客户昵称"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCustomerId}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除记录</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteError} onOpenChange={(open) => !open && setDeleteError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>{deleteError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDeleteError(null)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  if (embedded) return content
  return <div className="px-6 pt-12 pb-6 space-y-3"><h1 className="text-lg font-semibold">情绪释放</h1>{content}</div>
}

export default function EmotionalReleasesPage() {
  return <EmotionalReleasesContent />
}
