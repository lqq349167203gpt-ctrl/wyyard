import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, X, Calendar, Users, ChevronRight, FileUp, Download, File } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { groupCaseSessionApi, groupCaseApi, customerApi, uploadApi, type GroupCaseSession, type GroupCaseCustomerSearchResult, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"

const today = new Date().toLocaleDateString("sv-SE")

export default function GroupCaseSessionsPage() {
  const enterToNext = useEnterToNext()
  const [sessions, setSessions] = useState<GroupCaseSession[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState("")
  const [selectedSession, setSelectedSession] = useState<GroupCaseSession | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<GroupCaseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formDate, setFormDate] = useState(today)
  const [formOwnerId, setFormOwnerId] = useState("")
  const [formOwnerName, setFormOwnerName] = useState("")
  const [formAchieverId, setFormAchieverId] = useState("")
  const [formAchieverName, setFormAchieverName] = useState("")
  const [formHostId, setFormHostId] = useState("")
  const [formHostName, setFormHostName] = useState("")

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<GroupCaseSession | null>(null)
  const [uploading, setUploading] = useState(false)

  // 新增购买弹窗
  const [purchaseDialogOpen, setPurchaseDialogOpen] = useState(false)
  const [pendingOwner, setPendingOwner] = useState<GroupCaseCustomerSearchResult | null>(null)
  const [purchaseCount, setPurchaseCount] = useState("")
  const [purchaseAmount, setPurchaseAmount] = useState("")
  const [purchaseSaving, setPurchaseSaving] = useState(false)

  // 会员活动余额不足警告弹窗
  const [warningOpen, setWarningOpen] = useState(false)
  const [warningMsg, setWarningMsg] = useState("")
  const handleApiError = (error: any) => {
    const msg = error?.message || ""
    if (msg.includes("已无剩余活动次数")) {
      setWarningMsg(msg)
      setWarningOpen(true)
    }
  }

  const load = () => {
    groupCaseSessionApi.list()
      .then((data) => {
        setSessions(data)
        if (selectedSession) {
          const updated = data.find(s => s.id === selectedSession.id)
          if (updated) setSelectedSession(updated)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    customerApi.list().then(setAllCustomers).catch(() => {})
  }

  useEffect(() => { load() }, [])

  const filteredSessions = filterDate
    ? sessions.filter(s => s.date === filterDate)
    : sessions

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredSessions)

  const handleAddParticipant = async (customer: Customer) => {
    if (!selectedSession) return
    const newIds = [...selectedSession.participant_ids, customer.id]
    try {
      const updated = await groupCaseSessionApi.update(selectedSession.id, { participant_ids: newIds })
      setSelectedSession(updated)

      load()
    } catch (error) {
      handleApiError(error)
    }
  }

  const handleRemoveParticipant = async (customerId: string) => {
    if (!selectedSession) return
    const newIds = selectedSession.participant_ids.filter(id => id !== customerId)
    try {
      const updated = await groupCaseSessionApi.update(selectedSession.id, { participant_ids: newIds })
      setSelectedSession(updated)

      load()
    } catch (error) {
      handleApiError(error)
    }
  }

  // 资料上传
  const handleOpenMaterials = (session: GroupCaseSession) => {
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
      await groupCaseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...materialsRecord, materials: newMaterials }
      setMaterialsRecord(updated)
      if (selectedSession?.id === materialsRecord.id) setSelectedSession(updated)
      load()
    } catch { }
    finally { setUploading(false); e.target.value = "" }
  }

  const handleDeleteMaterial = async (filename: string) => {
    if (!materialsRecord) return
    try {
      await uploadApi.deleteMaterial(filename)
      const newMaterials = (materialsRecord.materials || []).filter(m => !m.url.includes(filename))
      await groupCaseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...materialsRecord, materials: newMaterials }
      setMaterialsRecord(updated)
      if (selectedSession?.id === materialsRecord.id) setSelectedSession(updated)
      load()
    } catch { }
  }

  const handleAddPurchase = async () => {
    if (!pendingOwner || !purchaseCount) return
    setPurchaseSaving(true)
    try {
      await groupCaseApi.create({
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
    setFormAchieverId("")
    setFormAchieverName("")
    setFormHostId("")
    setFormHostName("")
    setDialogOpen(true)
  }

  const handleOpenEdit = (session: GroupCaseSession) => {
    setEditingSession(session)
    setFormDate(session.date)
    setFormOwnerId(session.owner_id)
    setFormOwnerName(session.owner_name)
    setFormAchieverId(session.achiever_id)
    setFormAchieverName(session.achiever_name)
    setFormHostId(session.host_id)
    setFormHostName(session.host_name)
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
        achiever_id: formAchieverId,
        achiever_name: formAchieverName,
        host_id: formHostId,
        host_name: formHostName,
      }
      if (editingSession) {
        await groupCaseSessionApi.update(editingSession.id, data)
      } else {
        await groupCaseSessionApi.create(data)
      }
      setDialogOpen(false)
      load()
    } catch (error) {
      handleApiError(error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await groupCaseSessionApi.delete(deleteId)
    if (selectedSession?.id === deleteId) setSelectedSession(null)
    setDeleteId(null)
    load()
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div>
        <h1 className="text-lg font-semibold">觉醒游戏</h1>
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

      {/* 主内容区 - 左右布局 */}
      <div className="flex" style={{ height: 'calc(100vh - 180px)' }}>
        {/* 左侧 - 记录列表 */}
        <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
            ) : filteredSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{filterDate ? "该日期暂无记录" : "暂无觉醒游戏记录"}</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">日期</TableHead>
                    <TableHead>案主</TableHead>
                    <TableHead>成就君</TableHead>
                    <TableHead>主持人</TableHead>
                    <TableHead>参与者</TableHead>
                    <TableHead className="text-right pr-4">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((session) => (
                    <TableRow
                      key={session.id}
                      className={`cursor-pointer ${selectedSession?.id === session.id ? "bg-[#f0f5ff]" : ""}`}
                      onClick={() => setSelectedSession(session)}
                    >
                      <TableCell className="pl-4 text-[#2b2f36]">{session.date}</TableCell>
                      <TableCell className="text-[#2b2f36] font-medium">{session.owner_name}</TableCell>
                      <TableCell className="text-[#2b2f36]">
                        {session.achiever_name || <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                      </TableCell>
                      <TableCell className="text-[#2b2f36]">
                        {session.host_name || <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-[#3370ff]">
                          <span className="text-[12px]">{session.participant_ids.length} 人</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-[#4e535a]" onClick={(e) => { e.stopPropagation(); handleOpenMaterials(session) }}>
                            <FileUp className="h-3.5 w-3.5 mr-1" /> 资料
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); handleOpenEdit(session) }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); setDeleteId(session.id) }}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
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

        {/* 右侧 - 参与者详情面板 */}
        <div className="w-80 bg-[#fafbfc] border-l border-[#f0f0f0] flex flex-col shrink-0 rounded-r-lg">
          {!selectedSession ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Users className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">点击左侧记录</p>
              <p className="text-xs text-muted-foreground mt-1">查看和管理参与者</p>
            </div>
          ) : (<>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#eee]">
              <div>
                <span className="text-[13px] font-medium text-[#2b2f36]">{selectedSession.owner_name}</span>
                <span className="text-[12px] text-[#8f959e] ml-2">{selectedSession.date}</span>
              </div>
              <button
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                onClick={() => setSelectedSession(null)}
              >
                <X className="h-3.5 w-3.5 text-[#8f959e]" />
              </button>
            </div>

            {/* 案主信息 */}
            <div className="px-4 py-3 border-b border-[#eee] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-[#4e535a] font-light">案主</span>
                <span className="text-[13px] text-[#2b2f36]">{selectedSession.owner_name}</span>
              </div>
              {selectedSession.achiever_name && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#4e535a] font-light">成就君</span>
                  <span className="text-[13px] text-[#2b2f36]">{selectedSession.achiever_name}</span>
                </div>
              )}
              {selectedSession.host_name && (
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-[#4e535a] font-light">主持人</span>
                  <span className="text-[13px] text-[#2b2f36]">{selectedSession.host_name}</span>
                </div>
              )}
            </div>

            {/* 参与者 */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[#eee]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[12px] text-[#4e535a] font-light">参与者</span>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {selectedSession.participant_ids.length} 人
                  </Badge>
                </div>
                <CustomerSearchInput
                  customers={allCustomers}
                  value={""}
                  onChange={() => {}}
                  onSelectItem={(c) => handleAddParticipant(c)}
                  placeholder="搜索用户添加..."
                  excludeIds={[...(selectedSession?.owner_id ? [selectedSession.owner_id] : []), ...(selectedSession?.host_id ? [selectedSession.host_id] : []), ...(selectedSession?.participant_ids || [])]}
                />
              </div>

              {/* 已选参与者列表 */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                {selectedSession.participant_ids.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <Users className="h-6 w-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">暂无参与者</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">通过上方搜索框添加</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {selectedSession.participant_ids.map((id) => {
                      const customer = allCustomers.find(c => c.id === id)
                      return (
                        <div key={id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[#f7f8fa] group">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] text-[#2b2f36]">{customer?.nickname || customer?.name || id}</span>
                            <span className="text-[11px] text-[#8f959e]">{customer?.member_type || "新人"}</span>
                          </div>
                          <button
                            className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-opacity"
                            onClick={() => handleRemoveParticipant(id)}
                          >
                            <X className="h-3 w-3 text-[#8f959e]" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
          )}
        </div>
      </div>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingSession ? "编辑记录" : "新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">案主</span>
              <CustomerSearchInput
                customers={allCustomers}
                value={formOwnerName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) { setFormOwnerId(""); setFormOwnerName("") }
                }}
                onSelectItem={(c) => { setFormOwnerId(c.id); setFormOwnerName(c.nickname) }}
                placeholder="搜索客户昵称"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成就君</span>
              <CustomerSearchInput
                customers={allCustomers}
                value={formAchieverName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) { setFormAchieverId(""); setFormAchieverName("") }
                }}
                onSelectItem={(c) => { setFormAchieverId(c.id); setFormAchieverName(c.nickname || c.name) }}
                placeholder="搜索成就君"
                positionFilter="成就君"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">主持人</span>
              <CustomerSearchInput
                customers={allCustomers}
                value={formHostName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) { setFormHostId(""); setFormHostName("") }
                }}
                onSelectItem={(c) => { setFormHostId(c.id); setFormHostName(c.nickname) }}
                placeholder="搜索客户昵称"
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

      {/* 资料弹窗 */}
      <Dialog open={materialsDialogOpen} onOpenChange={setMaterialsDialogOpen}>
        <DialogContent className="max-w-md w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">资料管理</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[#4e535a] truncate">{materialsRecord?.owner_name} - {materialsRecord?.date}</span>
              <div className="shrink-0">
                <input type="file" id="materials-upload-gcs" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("materials-upload-gcs")?.click()}>
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
                      <span className="text-[11px] text-[#8f959e] shrink-0">{(m.size / 1024).toFixed(1)}KB</span>
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
            <DialogTitle className="text-base">新增觉醒游戏次数</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5" {...enterToNext}>
            <p className="text-[12px] text-[#4e535a]">
              用户「{pendingOwner?.nickname}」剩余次数为 0，是否新增购买？
            </p>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">购买次数</span>
              <Input type="number" value={purchaseCount} onChange={(e) => setPurchaseCount(e.target.value)} placeholder="0" min="0" />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">付费金额</span>
              <Input type="number" value={purchaseAmount} onChange={(e) => setPurchaseAmount(e.target.value)} placeholder="0" min="0" step="0.01" />
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

      {/* 会员活动余额不足警告 */}
      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>提示</AlertDialogTitle>
            <AlertDialogDescription>{warningMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setWarningOpen(false)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
