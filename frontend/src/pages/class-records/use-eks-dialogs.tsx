import { useState, useRef, useMemo, type ReactNode } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  energyKnotSessionApi, energyKnotApi,
  type EnergyKnotSession, type Customer, type EnergyKnotCustomerSearchResult,
} from "@/lib/api"

export interface EksActions {
  handleOpenEdit: (session: EnergyKnotSession) => void
  handleDrop: (session: EnergyKnotSession, customer: { customer_id: string }) => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
}

interface UseEksDialogsProps {
  allCustomers: Customer[]
  onReload: () => void
}

const today = new Date().toISOString().split("T")[0]

export function useEksDialogs({
  allCustomers, onReload,
}: UseEksDialogsProps) {
  const enterToNext = useEnterToNext()

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<EnergyKnotSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(today)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerIds, setFormOwnerIds] = useState<string[]>([])
  const [formOwnerNames, setFormOwnerNames] = useState<string[]>([])
  const [formTeacherIds, setFormTeacherIds] = useState<string[]>([])
  const [formTeacherNames, setFormTeacherNames] = useState<string[]>([])
  const [formOwnerDescriptions, setFormOwnerDescriptions] = useState<{id: string; name: string; description: string; count: number}[]>([])
  const [searchField, setSearchField] = useState<"owner" | "host" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<EnergyKnotCustomerSearchResult[]>([])
  const [remainingMap, setRemainingMap] = useState<Record<string, number>>({})
  const [ownerErrors, setOwnerErrors] = useState<Record<string, string>>({})
  const [, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 购买弹窗
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<EnergyKnotCustomerSearchResult | null>(null)
  const [purchaseCount, setPurchaseCount] = useState("")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [purchaseSaving, setPurchaseSaving] = useState(false)

  // ===== Handlers =====
  const handleOpenEdit = (session: EnergyKnotSession) => {
    setEditingRecord(session)
    setFormDate(session.date)
    setFormStartTime(session.start_time || "09:00")
    setFormEndTime(session.end_time || "10:00")
    const names = session.owner_name ? session.owner_name.split("、").filter(Boolean) : []
    const ids = session.owner_id ? [session.owner_id] : []
    setFormOwnerIds(ids.concat(new Array(Math.max(0, names.length - ids.length)).fill("")))
    setFormOwnerNames(names)
    const teacherIds = session.teacher_ids || []
    setFormTeacherIds(teacherIds)
    setFormTeacherNames(teacherIds.map(id => { const c = allCustomers.find(c => c.id === id); return c?.nickname || c?.name || "" }))
    // 解析每个案主的详情，补全 id/name
    try {
      const parsed = JSON.parse(session.description || "[]")
      if (Array.isArray(parsed) && parsed.length > 0) {
        const merged = names.map((name, i) => ({
          id: ids[i] || parsed[i]?.id || "",
          name,
          description: parsed[i]?.description || "",
          count: parsed[i]?.count ?? 1,
        }))
        setFormOwnerDescriptions(merged)
      } else {
        setFormOwnerDescriptions(names.map((name, i) => ({ id: ids[i] || "", name, description: "", count: 1 })))
      }
    } catch {
      setFormOwnerDescriptions(names.map((name, i) => ({ id: ids[i] || "", name, description: "", count: 1 })))
    }
    setSearchField(null)
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setDialogOpen(true)
    // 加载案主的剩余次数用于校验
    if (ids.length > 0) {
      energyKnotSessionApi.searchCustomers("").then(results => {
        setRemainingMap(prev => { const next = { ...prev }; results.forEach(r => { next[r.id] = r.remaining }); return next })
      }).catch(() => {})
    }
  }

  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await energyKnotSessionApi.searchCustomers(keyword)
        setSearchResults(results.filter(r => !formOwnerIds.includes(r.id) && !formTeacherIds.includes(r.id)))
        setRemainingMap(prev => { const next = { ...prev }; results.forEach(r => { next[r.id] = r.remaining }); return next })
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: EnergyKnotCustomerSearchResult) => {
    if (!searchField) return
    if (searchField === "owner") {
      if (customer.remaining !== -1 && customer.remaining <= 0) {
        setPendingOwner(customer)
        setPurchaseDialogOpen(true)
        return
      }
      if (!formOwnerIds.includes(customer.id)) {
        setFormOwnerIds([...formOwnerIds, customer.id])
        setFormOwnerNames([...formOwnerNames, customer.nickname || customer.name])
        setFormOwnerDescriptions([...formOwnerDescriptions, { id: customer.id, name: customer.nickname || customer.name, description: "", count: 1 }])
      }
    } else if (searchField === "host") {
      if (!formTeacherIds.includes(customer.id)) {
        setFormTeacherIds([...formTeacherIds, customer.id])
        setFormTeacherNames([...formTeacherNames, customer.nickname || customer.name])
      }
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchField(null)
  }

  const handleRemoveOwner = (index: number) => {
    setFormOwnerIds(formOwnerIds.filter((_, i) => i !== index))
    setFormOwnerNames(formOwnerNames.filter((_, i) => i !== index))
    setFormOwnerDescriptions(formOwnerDescriptions.filter((_, i) => i !== index))
  }

  const handleRemoveHost = (index: number) => {
    setFormTeacherIds(formTeacherIds.filter((_, i) => i !== index))
    setFormTeacherNames(formTeacherNames.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    if (formOwnerIds.length === 0) return
    // 校验部位数是否超过剩余次数
    let oldDescs: {id: string; count: number}[] = []
    if (editingRecord) {
      try { oldDescs = JSON.parse(editingRecord.description || "[]") } catch { oldDescs = [] }
    }
    const errors: Record<string, string> = {}
    for (const desc of formOwnerDescriptions) {
      if (!desc.id) continue
      const remaining = remainingMap[desc.id]
      if (remaining === undefined || remaining === -1) continue
      const oldCount = oldDescs.find(d => d.id === desc.id)?.count ?? 0
      const effective = remaining + oldCount
      if (desc.count > effective) {
        errors[desc.id] = `剩余次数不足（剩余 ${remaining} 次，需要 ${desc.count} 次）`
      }
    }
    if (Object.keys(errors).length > 0) {
      setOwnerErrors(errors)
      return
    }
    setOwnerErrors({})
    setSaving(true)
    try {
      const data = {
        date: formDate,
        start_time: formStartTime || null,
        end_time: formEndTime || null,
        owner_id: formOwnerIds[0] || "",
        owner_name: formOwnerNames.join("、"),
        teacher_ids: formTeacherIds,
        description: formOwnerDescriptions.length > 0 ? JSON.stringify(formOwnerDescriptions) : undefined,
      }
      if (editingRecord) {
        await energyKnotSessionApi.update(editingRecord.id, data)
      } else {
        await energyKnotSessionApi.create(data)
      }
      setDialogOpen(false)
      onReload()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await energyKnotSessionApi.delete(deleteId)
      setDeleteId(null)
      onReload()
    } catch { alert("删除失败，请重试") }
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
      // 刷新剩余次数
      setRemainingMap(prev => ({ ...prev, [pendingOwner.id]: (prev[pendingOwner.id] ?? 0) + (parseInt(purchaseCount) || 0) }))
      if (!formOwnerIds.includes(pendingOwner.id)) {
        setFormOwnerIds([...formOwnerIds, pendingOwner.id])
        setFormOwnerNames([...formOwnerNames, pendingOwner.nickname])
        setFormOwnerDescriptions([...formOwnerDescriptions, { id: pendingOwner.id, name: pendingOwner.nickname, description: "", count: 1 }])
      }
      setPurchaseDialogOpen(false)
      setPendingOwner(null)
      onReload()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setPurchaseSaving(false)
    }
  }

  const handleDrop = async (session: EnergyKnotSession, customer: { customer_id: string }) => {
    const ids = session.teacher_ids || []
    if (ids.includes(customer.customer_id)) return
    try {
      await energyKnotSessionApi.update(session.id, { teacher_ids: [...ids, customer.customer_id] } as any)
      onReload()
    } catch { alert("添加失败，请重试") }
  }

  const actions: EksActions = useMemo(() => ({
    handleOpenEdit, handleDrop, deleteId, setDeleteId,
  }), [deleteId, allCustomers, onReload])

  const dialogs: ReactNode = (
    <>
      {/* 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingRecord ? "编辑能量结" : "新增能量结"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input rounded="[2px]" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input rounded="[2px]" type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input rounded="[2px]" type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <div className="space-y-1.5" ref={dropdownRef}>
                <div className="relative">
                  {searchField === "owner" ? (
                    <Input
                      rounded="[2px]"
                      value={searchKeyword}
                      onChange={(e) => handleSearch(e.target.value)}
                      placeholder="搜索添加案主..."
                      className="h-8 text-xs"
                      autoFocus
                      onBlur={() => { setTimeout(() => { setSearchField(null); setShowDropdown(false) }, 200) }}
                    />
                  ) : (
                    <div
                      className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center text-muted-foreground"
                      onClick={() => { setSearchField("owner"); setSearchKeyword(""); setSearchResults([]); setShowDropdown(false) }}
                    >
                      搜索添加案主
                    </div>
                  )}
                  {showDropdown && searchField === "owner" && searchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                      {searchResults.map((c) => (
                        <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleSelectCustomer(c)}>
                          <span>{c.nickname || c.name}</span>
                          <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {formOwnerNames.length > 0 && (
                  <div className="space-y-2">
                    {formOwnerNames.map((name, i) => {
                      const ownerId = formOwnerDescriptions[i]?.id
                      return (
                        <div key={i}>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[12px] font-medium text-[#2b2f36]">{name}</span>
                              <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0] text-muted-foreground" onClick={() => handleRemoveOwner(i)}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                            <Input
                              rounded="[2px]"
                              value={formOwnerDescriptions[i]?.description || ""}
                              onChange={(e) => {
                                const updated = [...formOwnerDescriptions]
                                updated[i] = { ...updated[i], description: e.target.value }
                                setFormOwnerDescriptions(updated)
                              }}
                              placeholder="情况介绍..."
                              className="flex-1 h-8 text-xs"
                            />
                            <div className="flex items-center gap-1 shrink-0">
                              <span className="text-[11px] text-[#8f959e]">次数</span>
                              <Input
                                rounded="[2px]"
                                type="number"
                                min={1}
                                value={formOwnerDescriptions[i]?.count ?? 1}
                                onChange={(e) => {
                                  const updated = [...formOwnerDescriptions]
                                  updated[i] = { ...updated[i], count: Math.max(1, parseInt(e.target.value) || 1) }
                                  setFormOwnerDescriptions(updated)
                                  if (ownerId) setOwnerErrors(prev => { const next = { ...prev }; delete next[ownerId]; return next })
                                }}
                                className="w-14 h-8 text-xs text-center"
                              />
                            </div>
                          </div>
                          {ownerId && ownerErrors[ownerId] && (
                            <div className="text-[11px] text-red-500 mt-0.5 ml-1">{ownerErrors[ownerId]}</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="space-y-1.5">
                <select
                  className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] outline-none"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id || formTeacherIds.includes(id)) return
                    const c = allCustomers.find(c => c.id === id)
                    setFormTeacherIds([...formTeacherIds, id])
                    setFormTeacherNames([...formTeacherNames, c?.nickname || c?.name || ""])
                  }}
                >
                  <option value="">选择课程老师</option>
                  {allCustomers.filter(c => c.positions?.includes("能量结老师")).sort((a, b) => (a.position_sort_orders?.["能量结老师"] ?? 9999) - (b.position_sort_orders?.["能量结老师"] ?? 9999)).map(c => (
                    <option key={c.id} value={c.id}>{c.nickname || c.name}</option>
                  ))}
                </select>
                {formTeacherNames.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {formTeacherNames.map((name, i) => (
                      <Badge key={i} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                        {name}
                        <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleRemoveHost(i)}>
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || formOwnerIds.length === 0}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 购买弹窗 */}
      <Dialog open={purchaseDialogOpen} onOpenChange={setPurchaseDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增购买</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="text-[12px] text-[#8f959e]">
              {pendingOwner?.nickname || pendingOwner?.name} 暂无剩余次数，请先录入购买信息
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input rounded="[2px]" type="number" value={purchaseCount} onChange={(e) => setPurchaseCount(e.target.value)} placeholder="输入次数" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input rounded="[2px]" type="number" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} placeholder="输入金额" className="h-8 text-xs" />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => { setPurchaseDialogOpen(false); setPendingOwner(null) }}>取消</Button>
              <Button size="sm" onClick={handleAddPurchase} disabled={purchaseSaving || !purchaseCount}>
                {purchaseSaving ? "保存中..." : "确认购买"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除能量结</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条能量结记录吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )

  return { actions, dialogs }
}
