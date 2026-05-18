import { useEffect, useState, useRef } from "react"
import { Plus, Trash2, Edit, Loader2, X, Calendar, Zap } from "lucide-react"
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
import { energyKnotSessionApi, energyKnotApi, type EnergyKnotSession, type EnergyKnotCustomerSearchResult } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const today = new Date().toISOString().split("T")[0]

export default function EnergyKnotSessionsPage() {
  const [sessions, setSessions] = useState<EnergyKnotSession[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<EnergyKnotSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formDate, setFormDate] = useState(today)
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formHostIds, setFormHostIds] = useState<string[]>([])
  const [formHostNames, setFormHostNames] = useState<string[]>([])

  // 搜索状态
  const [searchField, setSearchField] = useState<"owner" | "host" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<EnergyKnotCustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 新增购买弹窗
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<EnergyKnotCustomerSearchResult | null>(null)
  const [purchaseCount, setPurchaseCount] = useState("")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [purchaseSaving, setPurchaseSaving] = useState(false)

  const load = () => {
    energyKnotSessionApi.list()
      .then(setSessions)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setSearchField(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredSessions = filterDate
    ? sessions.filter(s => s.date === filterDate)
    : sessions

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredSessions)

  const handleSearch = (keyword: string, field: "owner" | "host") => {
    setSearchKeyword(keyword)
    setSearchField(field)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await energyKnotSessionApi.searchCustomers(keyword)
        setSearchResults(results)
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: EnergyKnotCustomerSearchResult) => {
    if (searchField === "owner") {
      if (customer.remaining <= 0) {
        setPendingOwner(customer)
        setPurchaseCount("")
        setPurchaseAmount("")
        setPurchaseDialogOpen(true)
        setSearchKeyword("")
        setSearchResults([])
        setShowDropdown(false)
        setSearchField(null)
        return
      }
      setFormOwnerId(customer.id)
      setFormOwnerName(customer.nickname)
    } else if (searchField === "host") {
      if (!formHostIds.includes(customer.id)) {
        setFormHostIds([...formHostIds, customer.id])
        setFormHostNames([...formHostNames, customer.nickname])
      }
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchField(null)
  }

  const handleAddPurchase = async () => {
    if (!pendingOwner || !purchaseCount) return
    setPurchaseSaving(true)
    try {
      await energyKnotApi.create({
        customer_id: pendingOwner.id,
        nickname: pendingOwner.nickname,
        purchase_count: parseInt(purchaseCount) || 0,
        amount: parseFloat(purchaseAmount) || 0,
      })
      setFormOwnerId(pendingOwner.id)
      setFormOwnerName(pendingOwner.nickname)
      setPurchaseDialogOpen(false)
      setPendingOwner(null)
      load()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setPurchaseSaving(false)
    }
  }

  const handleOpenCreate = () => {
    setEditingSession(null)
    setFormDate(today)
    setFormOwnerId("")
    setFormOwnerName("")
    setFormHostIds([])
    setFormHostNames([])
    setSearchKeyword("")
    setSearchField(null)
    setDialogOpen(true)
  }

  const handleOpenEdit = (session: EnergyKnotSession) => {
    setEditingSession(session)
    setFormDate(session.date)
    setFormOwnerId(session.owner_id)
    setFormOwnerName(session.owner_name)
    setFormHostIds(session.host_ids || [])
    setFormHostNames(session.host_names || [])
    setSearchKeyword("")
    setSearchField(null)
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formOwnerId) return
    setSaving(true)
    try {
      const data = {
        date: formDate,
        owner_id: formOwnerId,
        owner_name: formOwnerName,
        host_ids: formHostIds,
        host_names: formHostNames,
      }
      if (editingSession) {
        await energyKnotSessionApi.update(editingSession.id, data)
      } else {
        await energyKnotSessionApi.create(data)
      }
      setDialogOpen(false)
      load()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await energyKnotSessionApi.delete(deleteId)
    setDeleteId(null)
    load()
  }

  const renderOwnerSearch = () => {
    const isActive = searchField === "owner"
    const showClear = !isActive && !!formOwnerName
    return (
      <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={isActive ? dropdownRef : undefined}>
        <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
        <div className="relative">
          <Input
            value={isActive ? searchKeyword : formOwnerName}
            onChange={(e) => handleSearch(e.target.value, "owner")}
            placeholder="搜索案主..."
            className="h-8 text-xs pr-16"
            onFocus={() => {
              if (!isActive) handleSearch("", "owner")
              if (isActive && searchResults.length > 0) setShowDropdown(true)
            }}
          />
          {showClear && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => { e.preventDefault(); setFormOwnerId(""); setFormOwnerName("") }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {isActive && searching && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {isActive && showDropdown && searchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
              {searchResults.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                  onClick={() => handleSelectCustomer(customer)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{customer.nickname}</span>
                    {customer.name && customer.name !== customer.nickname && (
                      <span className="text-[11px] text-muted-foreground">({customer.name})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] ${customer.remaining > 0 ? "text-[#3370ff]" : "text-[#8f959e]"}`}>
                      剩余 {customer.remaining} 次
                    </span>
                    <span className="text-[11px] text-muted-foreground">{customer.member_type || "新人"}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {isActive && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">
              未找到匹配用户
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderHostSearch = () => {
    const isActive = searchField === "host"
    return (
      <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={isActive ? dropdownRef : undefined}>
        <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
        <div className="relative">
          <Input
            value={isActive ? searchKeyword : ""}
            onChange={(e) => handleSearch(e.target.value, "host")}
            placeholder="搜索课程老师..."
            className="h-8 text-xs"
            onFocus={() => {
              if (!isActive) handleSearch("", "host")
              if (isActive && searchResults.length > 0) setShowDropdown(true)
            }}
          />
          {isActive && searching && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
          {isActive && showDropdown && searchResults.length > 0 && (
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
          {isActive && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">
              未找到匹配用户
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div>
        <h1 className="text-lg font-semibold">能量结</h1>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-end gap-2">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
        <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-36 h-8 text-xs" />
        {filterDate && <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilterDate("")}>清除</Button>}
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Zap className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">{filterDate ? "该日期暂无记录" : "暂无能量结记录"}</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">日期</TableHead>
                <TableHead>案主</TableHead>
                <TableHead>课程老师</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{session.date}</TableCell>
                  <TableCell className="text-[#2b2f36] font-medium">{session.owner_name}</TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {session.host_names.length > 0
                      ? session.host_names.join("、")
                      : <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(session)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(session.id)}>
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
            <DialogTitle className="text-base">{editingSession ? "编辑记录" : "新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            {renderOwnerSearch()}
            {renderHostSearch()}

            {/* 已选课程老师 */}
            {formHostIds.length > 0 && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-1.5">已选</span>
                <div className="flex flex-wrap gap-1.5">
                  {formHostNames.map((name, i) => (
                    <div key={formHostIds[i]} className="flex items-center gap-1.5 rounded border bg-muted/50 px-2.5 py-1 text-sm">
                      <span className="font-medium text-xs">{name}</span>
                      <button
                        onClick={() => {
                          setFormHostIds(formHostIds.filter((_, j) => j !== i))
                          setFormHostNames(formHostNames.filter((_, j) => j !== i))
                        }}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>
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

      {/* 新增购买弹窗 */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增能量结次数</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <p className="text-[12px] text-[#4e535a]">
              用户「{pendingOwner?.nickname}」剩余次数为 0，是否新增购买？
            </p>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input
                type="number"
                value={purchaseCount}
                onChange={(e) => setPurchaseCount(e.target.value)}
                placeholder="0"
                min="0"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input
                type="number"
                value={purchaseAmount}
                onChange={(e) => setPurchaseAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setPurchaseDialogOpen(false); setPendingOwner(null) }}>取消</Button>
              <Button size="sm" onClick={handleAddPurchase} disabled={purchaseSaving || !purchaseCount}>
                {purchaseSaving ? "保存中..." : "确认新增"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
