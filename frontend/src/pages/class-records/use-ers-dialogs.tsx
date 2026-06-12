import { useState, useRef, useMemo, type ReactNode } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { X, File, Download, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  emotionalReleaseSessionApi, emotionalReleaseApi, uploadApi,
  type EmotionalReleaseSession, type Customer, type EmotionalReleaseCustomerSearchResult,
} from "@/lib/api"

interface DayVisit { id: string; nickname: string; member_type: string }

export interface ErsActions {
  handleOpenEdit: (session: EmotionalReleaseSession) => void
  handleOpenMaterials: (session: EmotionalReleaseSession) => void
  handleOpenMembers: (session: EmotionalReleaseSession) => void
  handleDrop: (session: EmotionalReleaseSession, customer: { customer_id: string }) => void
  deleteId: string | null
  setDeleteId: (id: string | null) => void
}

interface UseErsDialogsProps {
  allCustomers: Customer[]
  dayVisits: DayVisit[]
  draggingVisitorId: string | null
  setDraggingVisitorId: (id: string | null) => void
  getMemberName: (id: string) => string
  onReload: () => void
  onApiError: (error: any) => void
}

const today = new Date().toISOString().split("T")[0]

export function useErsDialogs({
  allCustomers, dayVisits, draggingVisitorId, setDraggingVisitorId,
  getMemberName, onReload, onApiError,
}: UseErsDialogsProps) {
  const enterToNext = useEnterToNext()

  // 编辑弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<EmotionalReleaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [formDate, setFormDate] = useState(today)
  const [formStartTime, setFormStartTime] = useState("09:00")
  const [formEndTime, setFormEndTime] = useState("10:00")
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
  const [formHostId, setFormHostId] = useState("")
  const [formHostName, setFormHostName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [searchField, setSearchField] = useState<"owner" | "achiever" | "host" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const blurTimeoutRef = useRef<number | null>(null)

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<EmotionalReleaseSession | null>(null)
  const [uploading, setUploading] = useState(false)

  // 删除确认
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 成员弹窗
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [membersRecord, setMembersRecord] = useState<EmotionalReleaseSession | null>(null)
  const [memberSearchKeyword, setMemberSearchKeyword] = useState("")
  const [memberSearchResults, setMemberSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [, setMemberSearching] = useState(false)
  const [memberShowDropdown, setMemberShowDropdown] = useState(false)
  const memberSearchTimeoutRef = useRef<number | null>(null)
  const memberDropdownRef = useRef<HTMLDivElement>(null)

  // 成员弹窗中的主持人搜索
  const [memberHostSearchKeyword, setMemberHostSearchKeyword] = useState("")
  const [memberHostSearchResults, setMemberHostSearchResults] = useState<EmotionalReleaseCustomerSearchResult[]>([])
  const [, setMemberHostSearching] = useState(false)
  const [memberHostShowDropdown, setMemberHostShowDropdown] = useState(false)
  const memberHostSearchTimeoutRef = useRef<number | null>(null)
  const memberHostDropdownRef = useRef<HTMLDivElement>(null)

  // 购买弹窗
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<EmotionalReleaseCustomerSearchResult | null>(null)
  const [purchaseCount, setPurchaseCount] = useState("")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [purchaseSaving, setPurchaseSaving] = useState(false)

  // ===== Handlers =====
  const handleOpenEdit = (session: EmotionalReleaseSession) => {
    setEditingRecord(session)
    setFormDate(session.date)
    setFormStartTime(session.start_time || "09:00")
    setFormEndTime(session.end_time || "10:00")
    setFormOwnerId(session.owner_id)
    setFormOwnerName(session.owner_name || "")
    setFormAchieverId(session.achiever_id || "")
    setFormAchieverName(session.achiever_name || "")
    setFormHostId(session.host_id || "")
    setFormHostName(session.host_name || "")
    setFormDescription(session.description || "")
    setSearchField(null)
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setDialogOpen(true)
  }

  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setSearchResults(results)
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!searchField) return
    if (searchField === "owner") {
      if (customer.remaining !== -1 && customer.remaining <= 0) {
        setPendingOwner(customer)
        setPurchaseDialogOpen(true)
        return
      }
      setFormOwnerId(customer.id)
      setFormOwnerName(customer.nickname || customer.name)
    } else if (searchField === "achiever") {
      setFormAchieverId(customer.id)
      setFormAchieverName(customer.nickname || customer.name)
    } else if (searchField === "host") {
      setFormHostId(customer.id)
      setFormHostName(customer.nickname || customer.name)
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchField(null)
  }

  const handleSave = async () => {
    if (!formOwnerId) return
    setSaving(true)
    try {
      const data = {
        date: formDate,
        start_time: formStartTime || null,
        end_time: formEndTime || null,
        owner_id: formOwnerId,
        owner_name: formOwnerName,
        description: formDescription || undefined,
        achiever_id: formAchieverId || undefined,
        achiever_name: formAchieverName || undefined,
        host_id: formHostId || undefined,
        host_name: formHostName || undefined,
      }
      if (editingRecord) {
        await emotionalReleaseSessionApi.update(editingRecord.id, data)
      } else {
        await emotionalReleaseSessionApi.create(data)
      }
      setDialogOpen(false)
      onReload()
    } catch (error) {
      onApiError(error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await emotionalReleaseSessionApi.delete(deleteId)
    setDeleteId(null)
    onReload()
  }

  const handleAddPurchase = async () => {
    if (!pendingOwner || !purchaseCount) return
    setPurchaseSaving(true)
    try {
      await emotionalReleaseApi.create({
        customer_id: pendingOwner.id,
        nickname: pendingOwner.nickname,
        purchase_count: parseInt(purchaseCount) || 0,
        amount: parseFloat(purchaseAmount) || 0,
      })
      setFormOwnerId(pendingOwner.id)
      setFormOwnerName(pendingOwner.nickname)
      setPurchaseDialogOpen(false)
      setPendingOwner(null)
      onReload()
    } catch (error) {
      console.error("新增购买失败:", error)
    } finally {
      setPurchaseSaving(false)
    }
  }

  // 资料
  const handleOpenMaterials = (session: EmotionalReleaseSession) => {
    setMaterialsRecord(session)
    setMaterialsDialogOpen(true)
  }

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !materialsRecord) return
    setUploading(true)
    try {
      const material = await uploadApi.uploadMaterial(file)
      const newMaterials = [...(materialsRecord.materials || []), material]
      await emotionalReleaseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      onReload()
    } catch { alert("上传失败，请重试") }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteMaterial = async (filename: string) => {
    if (!materialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (materialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await emotionalReleaseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      setMaterialsRecord({ ...materialsRecord, materials: newMaterials })
      onReload()
    } catch { }
  }

  // 成员
  const handleOpenMembers = (session: EmotionalReleaseSession) => {
    setMembersRecord(session)
    setMembersDialogOpen(true)
    setMemberSearchKeyword("")
    setMemberSearchResults([])
    setMemberShowDropdown(false)
  }

  const handleMemberSearch = (keyword: string) => {
    setMemberSearchKeyword(keyword)
    if (memberSearchTimeoutRef.current) clearTimeout(memberSearchTimeoutRef.current)
    if (!keyword.trim()) { setMemberSearchResults([]); setMemberShowDropdown(false); return }
    memberSearchTimeoutRef.current = window.setTimeout(async () => {
      setMemberSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setMemberSearchResults(results.filter(r => r.id !== membersRecord?.owner_id && r.id !== membersRecord?.host_id && !(membersRecord?.participant_ids || []).includes(r.id)))
        setMemberShowDropdown(true)
      } catch { setMemberSearchResults([]) }
      finally { setMemberSearching(false) }
    }, 300)
  }

  const handleAddParticipant = async (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!membersRecord) return
    if (customer.remaining === 0) return
    const newIds = [...(membersRecord.participant_ids || []), customer.id]
    try {
      await emotionalReleaseSessionApi.update(membersRecord.id, { participant_ids: newIds } as any)
      setMembersRecord({ ...membersRecord, participant_ids: newIds })
      setMemberSearchKeyword("")
      setMemberSearchResults([])
      setMemberShowDropdown(false)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleRemoveParticipant = async (id: string) => {
    if (!membersRecord) return
    const newIds = (membersRecord.participant_ids || []).filter(pid => pid !== id)
    try {
      await emotionalReleaseSessionApi.update(membersRecord.id, { participant_ids: newIds } as any)
      setMembersRecord({ ...membersRecord, participant_ids: newIds })
      onReload()
    } catch (e) { onApiError(e) }
  }

  // 成员弹窗中的主持人搜索
  const handleMemberHostSearch = (keyword: string) => {
    setMemberHostSearchKeyword(keyword)
    if (memberHostSearchTimeoutRef.current) clearTimeout(memberHostSearchTimeoutRef.current)
    if (!keyword.trim()) { setMemberHostSearchResults([]); setMemberHostShowDropdown(false); return }
    memberHostSearchTimeoutRef.current = window.setTimeout(async () => {
      setMemberHostSearching(true)
      try {
        const results = await emotionalReleaseSessionApi.searchCustomers(keyword)
        setMemberHostSearchResults(results.filter(r => r.id !== membersRecord?.owner_id && !(membersRecord?.participant_ids || []).includes(r.id)))
        setMemberHostShowDropdown(true)
      } catch { setMemberHostSearchResults([]) }
      finally { setMemberHostSearching(false) }
    }, 300)
  }

  const handleMemberSetHost = async (customer: EmotionalReleaseCustomerSearchResult) => {
    if (!membersRecord) return
    if (customer.remaining === 0) return
    try {
      await emotionalReleaseSessionApi.update(membersRecord.id, { host_id: customer.id, host_name: customer.nickname || customer.name } as any)
      setMembersRecord({ ...membersRecord, host_id: customer.id, host_name: customer.nickname || customer.name })
      setMemberHostSearchKeyword("")
      setMemberHostSearchResults([])
      setMemberHostShowDropdown(false)
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleMemberRemoveHost = async () => {
    if (!membersRecord) return
    try {
      await emotionalReleaseSessionApi.update(membersRecord.id, { host_id: "", host_name: "" } as any)
      setMembersRecord({ ...membersRecord, host_id: "", host_name: "" })
      onReload()
    } catch (e) { onApiError(e) }
  }

  const handleDrop = async (session: EmotionalReleaseSession, customer: { customer_id: string }) => {
    const ids = session.participant_ids || []
    if (ids.includes(customer.customer_id) || customer.customer_id === session.host_id) return
    await emotionalReleaseSessionApi.update(session.id, { participant_ids: [...ids, customer.customer_id] } as any)
    onReload()
  }

  const actions: ErsActions = useMemo(() => ({
    handleOpenEdit, handleOpenMaterials, handleOpenMembers, handleDrop, deleteId, setDeleteId,
  }), [deleteId])

  const dialogs: ReactNode = (
    <>
      {/* 编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingRecord ? "编辑情绪释放" : "新增情绪释放"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时间段</span>
              <div className="flex items-center gap-2">
                <Input type="time" value={formStartTime} onChange={(e) => setFormStartTime(e.target.value)} className="h-8 text-xs flex-1" />
                <span className="text-[12px] text-[#4e535a]">至</span>
                <Input type="time" value={formEndTime} onChange={(e) => setFormEndTime(e.target.value)} className="h-8 text-xs flex-1" />
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <div className="relative" ref={dropdownRef}>
                {searchField === "owner" ? (
                  <Input
                    value={searchKeyword}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="搜索案主..."
                    className="h-8 text-xs"
                    autoFocus
                    onBlur={() => { if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current); blurTimeoutRef.current = window.setTimeout(() => { if (searchField === "owner") { setSearchField(null); setShowDropdown(false) } }, 200) }}
                  />
                ) : (
                  <div
                    className="min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] cursor-pointer flex items-center justify-between"
                    onClick={() => { if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current); setSearchField("owner"); setSearchKeyword(formOwnerName); setSearchResults([]); setShowDropdown(false); if (formOwnerName) handleSearch(formOwnerName) }}
                  >
                    <span className={formOwnerId ? "text-[#2b2f36]" : "text-muted-foreground"}>
                      {formOwnerName || "选择案主"}
                    </span>
                  </div>
                )}
                {showDropdown && searchField === "owner" && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                    {searchResults.map((c) => (
                      <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectCustomer(c)}>
                        <span>{c.nickname || c.name}</span>
                        <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成就君</span>
              <select
                className="h-8 w-full rounded-md border border-input bg-transparent px-2 py-1 text-[12px] text-[#2b2f36] outline-none"
                value={formAchieverId}
                onChange={(e) => {
                  const id = e.target.value
                  const c = allCustomers.find(c => c.id === id)
                  setFormAchieverId(id)
                  setFormAchieverName(c?.nickname || c?.name || "")
                }}
              >
                <option value="">选择成就君</option>
                {allCustomers.filter(c => c.positions?.includes("成就君")).sort((a, b) => (a.position_sort_orders?.["成就君"] ?? 9999) - (b.position_sort_orders?.["成就君"] ?? 9999)).map(c => (
                  <option key={c.id} value={c.id}>{c.nickname || c.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">个案详情</span>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="输入个案详情..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-2 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formOwnerId}>
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
              <Input type="number" value={purchaseCount} onChange={(e) => setPurchaseCount(e.target.value)} placeholder="输入次数" className="h-8 text-xs" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} placeholder="输入金额" className="h-8 text-xs" />
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

      {/* 资料弹窗 */}
      <Dialog open={materialsDialogOpen} onOpenChange={setMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">情绪释放</span>
              <div className="shrink-0">
                <input type="file" id="ers-materials-upload" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("ers-materials-upload")?.click()}>
                  {uploading ? "上传中..." : "上传文件"}
                </Button>
              </div>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto overflow-x-hidden">
              {(materialsRecord?.materials || []).length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无资料</div>
              ) : (
                (materialsRecord?.materials || []).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded border gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
                      <File className="h-4 w-4 text-[#8f959e] shrink-0" />
                      <span className="text-xs text-[#2b2f36] truncate">{m.name}</span>
                      <span className="text-[12px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={`${"http://127.0.0.1:8000"}${m.url}`} download className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]">
                        <Download className="h-3.5 w-3.5 text-[#8f959e]" />
                      </a>
                      <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => handleDeleteMaterial(m.url.split("/").pop()!)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 成员弹窗 */}
      {membersDialogOpen && <Dialog open={membersDialogOpen} onOpenChange={(open) => { setMembersDialogOpen(open); if (!open) setMembersRecord(null) }}>
        <DialogContent className="max-w-3xl p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">成员配置</DialogTitle>
          </DialogHeader>
          {membersRecord && (
            <div className="flex max-h-[65vh]">
              {/* 左侧：当日到场人员 */}
              <div className="w-48 shrink-0 border-r border-[#e8e8e8] overflow-y-auto">
                <div className="px-3 py-3 border-b border-[#f0f0f0] bg-[#f7f8fa]">
                  <span className="text-[12px] font-medium text-[#2b2f36]">当日到场</span>
                  <span className="text-[12px] text-[#8f959e] ml-1">{dayVisits.length}人</span>
                </div>
                <div className="p-2 space-y-1">
                  {dayVisits.length === 0 ? (
                    <p className="text-[12px] text-[#b0b5bb] text-center py-4">暂无到场人员</p>
                  ) : (
                    dayVisits.map((v) => {
                      const assigned = membersRecord.participant_ids?.includes(v.id) || membersRecord.host_id === v.id || membersRecord.owner_id === v.id
                      return (
                        <div
                          key={v.id}
                          draggable={!assigned}
                          onDragStart={() => !assigned && setDraggingVisitorId(v.id)}
                          onDragEnd={() => setDraggingVisitorId(null)}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded text-[12px] select-none ${
                            assigned
                              ? "bg-[#f5f5f5] text-[#b0b5bb] cursor-not-allowed"
                              : "bg-white hover:bg-[#f0f5ff] cursor-grab active:cursor-grabbing"
                          } ${draggingVisitorId === v.id ? "opacity-50" : ""}`}
                        >
                          <span className="flex-1 truncate">{v.nickname}</span>
                          {assigned && <span className="text-[10px] text-[#b0b5bb]">已分配</span>}
                          {v.member_type && !assigned && <span className="text-[10px] text-[#8f959e]">{v.member_type}</span>}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* 右侧：人员配置 */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const vid = draggingVisitorId
                  if (!vid) return
                  const visitor = dayVisits.find(v => v.id === vid)
                  if (visitor && membersRecord) {
                    handleAddParticipant({ id: visitor.id, nickname: visitor.nickname, name: visitor.nickname, member_type: visitor.member_type, remaining: -1 })
                  }
                  setDraggingVisitorId(null)
                }}
              >
                <div className="text-[12px] text-[#8f959e]">情绪释放 · {membersRecord.date}</div>

                <div className="border border-[#e8e8e8] rounded-lg bg-white">
                  <div className="px-3 py-2 border-b border-[#f0f0f0]">
                    <span className="text-[12px] font-medium text-[#2b2f36]">人员配置</span>
                  </div>

                  <div className="px-3 py-2.5 space-y-2.5">
                    {/* 主持人 */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-[12px] text-[#4e535a] shrink-0">主持人</span>
                      {membersRecord.host_id ? (
                        <div className="flex items-center gap-1 flex-1">
                          <Badge variant="secondary" className="text-[12px] font-normal">{membersRecord.host_name || getMemberName(membersRecord.host_id)}</Badge>
                          <button className="h-4 w-4 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={handleMemberRemoveHost}>
                            <X className="h-2.5 w-2.5 text-[#8f959e]" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex-1 relative" ref={memberHostDropdownRef}>
                          <Input
                            value={memberHostSearchKeyword}
                            onChange={(e) => handleMemberHostSearch(e.target.value)}
                            placeholder="选择主持人"
                            className="h-7 text-[12px]"
                          />
                          {memberHostShowDropdown && memberHostSearchResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                              {memberHostSearchResults.map((c) => c.remaining === 0 ? (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                                </div>
                              ) : (
                                <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleMemberSetHost(c)}>
                                  <span>{c.nickname || c.name}</span>
                                  <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 参与者 */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[12px] text-[#4e535a] shrink-0">参与者</span>
                        <div className="flex-1 relative min-w-0" ref={memberDropdownRef}>
                        <Input
                          value={memberSearchKeyword}
                          onChange={(e) => handleMemberSearch(e.target.value)}
                          placeholder="搜索添加组员"
                          className="h-7 text-[12px]"
                        />
                        {memberShowDropdown && memberSearchResults.length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-40 overflow-y-auto">
                            {memberSearchResults.map((c) => c.remaining === 0 ? (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-[12px] bg-[#f5f5f5]" onMouseDown={(e) => e.preventDefault()}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-[#ff4d4f]">已无剩余活动次数</span>
                              </div>
                            ) : (
                              <div key={c.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted text-[12px]" onClick={() => handleAddParticipant(c)}>
                                <span>{c.nickname || c.name}</span>
                                <span className="text-[12px] text-muted-foreground">{c.remaining === -1 ? "不限" : `剩余 ${c.remaining} 次`}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        </div>
                      </div>
                      {(membersRecord.participant_ids || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 ml-[42px]">
                          {membersRecord.participant_ids.map((id) => (
                            <Badge key={id} variant="secondary" className="text-[12px] font-normal gap-1 pr-1">
                              {getMemberName(id)}
                              <button className="h-3.5 w-3.5 flex items-center justify-center rounded hover:bg-[#e0e0e0]" onClick={() => handleRemoveParticipant(id)}>
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2 border-t">
                  <Button size="sm" className="h-8 text-xs px-5" onClick={() => setMembersDialogOpen(false)}>确定</Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>}

      {/* 删除确认 */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除情绪释放</AlertDialogTitle>
            <AlertDialogDescription>确定要删除这条情绪释放记录吗？此操作不可撤销。</AlertDialogDescription>
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
