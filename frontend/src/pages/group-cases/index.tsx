import { useEffect, useState, useRef } from "react"
import { Plus, Trash2, Edit, Loader2, Wallet, X } from "lucide-react"
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
import { groupCaseApi, type GroupCase, type CustomerSearchResult } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

export function GroupCasesContent({ embedded }: { embedded?: boolean } = {}) {
  const [cases, setCases] = useState<GroupCase[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCase, setEditingCase] = useState<GroupCase | null>(null)
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
  const [searchTarget, setSearchTarget] = useState<"user" | "closer" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(cases)

  const load = () => {
    groupCaseApi.list()
      .then(setCases)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setSearchTarget(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = (keyword: string, target: "user" | "closer") => {
    setSearchTarget(target)
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await groupCaseApi.searchCustomers(keyword)
        setSearchResults(results)
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    if (searchTarget === "closer") {
      setFormCloserId(customer.id)
      setFormCloserName(customer.nickname)
    } else {
      setFormCustomerId(customer.id)
      setFormNickname(customer.nickname)
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchTarget(null)
  }

  const handleOpenCreate = () => {
    setEditingCase(null)
    setFormCustomerId("")
    setFormNickname("")
    setFormPurchaseCount("")
    setFormAmount("")
    setFormCloserId("")
    setFormCloserName("")
    setSearchKeyword("")
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: GroupCase) => {
    setEditingCase(item)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormPurchaseCount(String(item.purchase_count))
    setFormAmount(String(item.amount))
    setFormCloserId(item.closer_id || "")
    setFormCloserName(item.closer_name || "")
    setSearchKeyword("")
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
      if (editingCase) {
        await groupCaseApi.update(editingCase.id, data)
      } else {
        await groupCaseApi.create(data)
      }
      setDialogOpen(false)
      load()
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
      await groupCaseApi.delete(deleteId)
      setDeleteId(null)
      load()
    } catch (e: any) {
      setDeleteError(e?.message || "删除失败")
      setDeleteId(null)
    }
  }

  const totalAmount = cases.reduce((sum, c) => sum + c.amount, 0)
  const totalCount = cases.reduce((sum, c) => sum + c.purchase_count, 0)

  const content = (
    <>
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          {cases.length > 0 && (
            <span>共 {cases.length} 条记录，{totalCount} 次购买，¥{totalAmount.toLocaleString()}</span>
          )}
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无觉醒游戏记录</p>
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
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingCase ? "编辑记录" : "新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={searchTarget === "user" ? dropdownRef : undefined}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">用户</span>
              <div className="relative">
                <Input
                  value={searchTarget === "user" ? searchKeyword : (formNickname || "")}
                  onChange={(e) => handleSearch(e.target.value, "user")}
                  placeholder="搜索用户..."
                  className="h-8 text-xs pr-16"
                  readOnly={!!editingCase}
                  onFocus={() => {
                    if (!editingCase) {
                      setSearchTarget("user")
                      if (formNickname) { setSearchKeyword(""); setFormNickname(""); setFormCustomerId("") }
                      if (searchResults.length > 0) setShowDropdown(true)
                    }
                  }}
                />
                {!editingCase && formNickname && searchTarget !== "user" && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => { e.preventDefault(); setFormNickname(""); setFormCustomerId("") }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {searching && searchTarget === "user" && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {searchTarget === "user" && showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                        onClick={() => handleSelectCustomer(customer)}
                      >
                        <span className="text-[12px] font-medium">{customer.nickname}</span>
                        <span className="text-[11px] text-muted-foreground">{customer.member_type || "新人"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {searchTarget === "user" && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">未找到匹配用户</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input
                type="number"
                value={formPurchaseCount}
                onChange={(e) => setFormPurchaseCount(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input
                type="number"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>

            {/* 成交人搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={searchTarget === "closer" ? dropdownRef : undefined}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成交人</span>
              <div className="relative">
                <Input
                  value={searchTarget === "closer" ? searchKeyword : (formCloserName || "")}
                  onChange={(e) => handleSearch(e.target.value, "closer")}
                  placeholder="搜索成交人..."
                  className="h-8 text-xs pr-16"
                  onFocus={() => {
                    setSearchTarget("closer")
                    if (formCloserName) { setSearchKeyword(""); setFormCloserId(""); setFormCloserName("") }
                    if (searchResults.length > 0) setShowDropdown(true)
                  }}
                />
                {formCloserName && searchTarget !== "closer" && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => { e.preventDefault(); setFormCloserName(""); setFormCloserId("") }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {searching && searchTarget === "closer" && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {searchTarget === "closer" && showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                        onClick={() => handleSelectCustomer(customer)}
                      >
                        <span className="text-[12px] font-medium">{customer.nickname}</span>
                        <span className="text-[11px] text-muted-foreground">{customer.member_type || "新人"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {searchTarget === "closer" && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">未找到匹配用户</div>
                )}
              </div>
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
  return <div className="px-6 pt-12 pb-6 space-y-3"><h1 className="text-lg font-semibold">觉醒游戏</h1>{content}</div>
}

export default function GroupCasesPage() {
  return <GroupCasesContent />
}
