import { useEffect, useState, useRef } from "react"
import { Plus, Trash2, Edit, Loader2, X, Calendar, GraduationCap, ChevronRight, ChevronDown, Users, FileUp, Download, File } from "lucide-react"
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
import { internalCourseSessionApi, customerApi, uploadApi, type InternalCourseSession, type InternalCourseSessionCustomerSearchResult, type Customer } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const today = new Date().toISOString().split("T")[0]

const COURSE_TYPES = [
  "疗愈师课程",
  "商业框架陪跑",
  "落地赋能班",
]

export default function InternalCourseSessionsPage() {
  const [sessions, setSessions] = useState<InternalCourseSession[]>([])
  const [allCustomers, setAllCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filterDate, setFilterDate] = useState("")
  const [selectedSession, setSelectedSession] = useState<InternalCourseSession | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<InternalCourseSession | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formDate, setFormDate] = useState(today)
  const [formCourseType, setFormCourseType] = useState("")
  const [formCourseName, setFormCourseName] = useState("")
  const [formDescription, setFormDescription] = useState("")
  const [formHostIds, setFormHostIds] = useState<string[]>([])
  const [formHostNames, setFormHostNames] = useState<string[]>([])

  // 资料弹窗
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false)
  const [materialsRecord, setMaterialsRecord] = useState<InternalCourseSession | null>(null)
  const [uploading, setUploading] = useState(false)

  // 弹窗搜索状态
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 右侧面板参与者搜索
  const [panelSearchKeyword, setPanelSearchKeyword] = useState("")
  const [panelSearchResults, setPanelSearchResults] = useState<InternalCourseSessionCustomerSearchResult[]>([])
  const [panelSearching, setPanelSearching] = useState(false)
  const [panelShowDropdown, setPanelShowDropdown] = useState(false)
  const panelSearchTimeoutRef = useRef<number | null>(null)
  const panelDropdownRef = useRef<HTMLDivElement>(null)

  const load = () => {
    internalCourseSessionApi.list()
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
      if (panelDropdownRef.current && !panelDropdownRef.current.contains(e.target as Node)) {
        setPanelShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const filteredSessions = filterDate
    ? sessions.filter(s => s.date === filterDate)
    : sessions

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredSessions)

  // 弹窗搜索课程老师
  const handleSearch = (keyword: string) => {
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        setSearchResults(results.filter(r => !formHostIds.includes(r.id)))
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectHost = (customer: InternalCourseSessionCustomerSearchResult) => {
    if (!formHostIds.includes(customer.id)) {
      setFormHostIds([...formHostIds, customer.id])
      setFormHostNames([...formHostNames, customer.nickname])
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
  }

  // 右侧面板参与者搜索
  const handlePanelSearch = (keyword: string) => {
    setPanelSearchKeyword(keyword)
    if (panelSearchTimeoutRef.current) clearTimeout(panelSearchTimeoutRef.current)
    if (!keyword.trim()) { setPanelSearchResults([]); setPanelShowDropdown(false); return }
    panelSearchTimeoutRef.current = window.setTimeout(async () => {
      setPanelSearching(true)
      try {
        const results = await internalCourseSessionApi.searchCustomers(keyword)
        const currentIds = selectedSession?.participant_ids || []
        setPanelSearchResults(results.filter(r => !currentIds.includes(r.id)))
        setPanelShowDropdown(true)
      } catch { setPanelSearchResults([]) }
      finally { setPanelSearching(false) }
    }, 300)
  }

  const handleAddParticipant = async (customer: InternalCourseSessionCustomerSearchResult) => {
    if (!selectedSession) return
    const newIds = [...selectedSession.participant_ids, customer.id]
    try {
      const updated = await internalCourseSessionApi.update(selectedSession.id, { participant_ids: newIds })
      setSelectedSession(updated)
      setPanelSearchKeyword(""); setPanelSearchResults([]); setPanelShowDropdown(false)
      load()
    } catch (error) {
      console.error("添加参与者失败:", error)
    }
  }

  const handleRemoveParticipant = async (customerId: string) => {
    if (!selectedSession) return
    const newIds = selectedSession.participant_ids.filter(id => id !== customerId)
    try {
      const updated = await internalCourseSessionApi.update(selectedSession.id, { participant_ids: newIds })
      setSelectedSession(updated)
      load()
    } catch (error) {
      console.error("移除参与者失败:", error)
    }
  }

  // 资料上传
  const handleOpenMaterials = (session: InternalCourseSession) => {
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
      await internalCourseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
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
      await internalCourseSessionApi.update(materialsRecord.id, { materials: newMaterials } as any)
      const updated = { ...materialsRecord, materials: newMaterials }
      setMaterialsRecord(updated)
      if (selectedSession?.id === materialsRecord.id) setSelectedSession(updated)
      load()
    } catch { }
  }

  const handleOpenCreate = () => {
    setEditingSession(null)
    setFormDate(today)
    setFormCourseType("")
    setFormCourseName("")
    setFormDescription("")
    setFormHostIds([])
    setFormHostNames([])
    setSearchKeyword("")
    setDialogOpen(true)
  }

  const handleOpenEdit = (session: InternalCourseSession) => {
    setEditingSession(session)
    setFormDate(session.date)
    setFormCourseType(session.course_type || "")
    setFormCourseName(session.course_name)
    setFormDescription(session.course_description || "")
    setFormHostIds(session.host_ids || [])
    setFormHostNames(session.host_names || [])
    setSearchKeyword("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCourseName) return
    setSaving(true)
    try {
      const data = {
        date: formDate,
        course_type: formCourseType,
        course_name: formCourseName,
        course_description: formDescription,
        host_ids: formHostIds,
        host_names: formHostNames,
      }
      if (editingSession) {
        await internalCourseSessionApi.update(editingSession.id, data)
      } else {
        await internalCourseSessionApi.create(data)
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
    await internalCourseSessionApi.delete(deleteId)
    if (selectedSession?.id === deleteId) setSelectedSession(null)
    setDeleteId(null)
    load()
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      {/* 页面头部 */}
      <div>
        <h1 className="text-lg font-semibold">内部课程</h1>
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
                <GraduationCap className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">{filterDate ? "该日期暂无记录" : "暂无内部课程记录"}</p>
                <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">日期</TableHead>
                    <TableHead>课程类型</TableHead>
                    <TableHead>课程名称</TableHead>
                    <TableHead>课程老师</TableHead>
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
                      <TableCell className="text-[#2b2f36]">{session.course_type || <span className="text-[12px] text-[#4e535a] font-light">-</span>}</TableCell>
                      <TableCell className="text-[#2b2f36] font-medium">{session.course_name}</TableCell>
                      <TableCell className="text-[#2b2f36]">
                        {session.host_names.length > 0
                          ? session.host_names.join("、")
                          : <span className="text-[12px] text-[#4e535a] font-light">-</span>}
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
                <span className="text-[13px] font-medium text-[#2b2f36]">{selectedSession.course_name}</span>
                {selectedSession.course_type && <span className="text-[11px] text-[#8f959e] ml-1.5">({selectedSession.course_type})</span>}
                <span className="text-[12px] text-[#8f959e] ml-2">{selectedSession.date}</span>
              </div>
              <button
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]"
                onClick={() => setSelectedSession(null)}
              >
                <X className="h-3.5 w-3.5 text-[#8f959e]" />
              </button>
            </div>

            {/* 课程老师信息 */}
            <div className="px-4 py-3 border-b border-[#eee]">
              <span className="text-[12px] text-[#4e535a] font-light">课程老师</span>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {selectedSession.host_names.length > 0 ? (
                  selectedSession.host_names.map((name, i) => (
                    <Badge key={i} variant="secondary" className="text-[11px] font-normal">{name}</Badge>
                  ))
                ) : (
                  <span className="text-[12px] text-[#8f959e]">未分配</span>
                )}
              </div>
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
                <div className="relative" ref={panelDropdownRef}>
                  <Input
                    value={panelSearchKeyword}
                    onChange={(e) => handlePanelSearch(e.target.value)}
                    placeholder="搜索用户添加..."
                    className="h-8 text-xs"
                    onFocus={() => panelSearchResults.length > 0 && setPanelShowDropdown(true)}
                  />
                  {panelSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  {panelShowDropdown && panelSearchResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-48 overflow-y-auto">
                      {panelSearchResults.map((customer) => (
                        <div
                          key={customer.id}
                          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                          onClick={() => handleAddParticipant(customer)}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{customer.nickname}</span>
                            {customer.name && customer.name !== customer.nickname && (
                              <span className="text-xs text-muted-foreground">({customer.name})</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{customer.member_type || "新人"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {panelShowDropdown && panelSearchResults.length === 0 && panelSearchKeyword && !panelSearching && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-sm text-muted-foreground text-center">
                      未找到匹配用户
                    </div>
                  )}
                </div>
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
          <div className="px-6 py-5 space-y-4">
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">日期</span>
              <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程名称</span>
              <Input
                value={formCourseName}
                onChange={(e) => setFormCourseName(e.target.value)}
                placeholder="输入课程名称"
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程类型</span>
              <div className="relative">
                <select
                  value={formCourseType}
                  onChange={(e) => setFormCourseType(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-transparent pl-2 pr-7 text-xs appearance-none focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">请选择</option>
                  {COURSE_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8f959e] pointer-events-none" />
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={dropdownRef}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程老师</span>
              <div className="relative">
                <Input
                  value={searchKeyword}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={formHostNames.length > 0 ? formHostNames.join("、") : "搜索课程老师..."}
                  className="h-8 text-xs pr-16"
                  onFocus={() => {
                    setSearchKeyword("")
                    if (searchResults.length > 0) setShowDropdown(true)
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      if (!searchKeyword) setSearchKeyword("")
                    }, 200)
                  }}
                />
                {formHostIds.length > 0 && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => { e.preventDefault(); setFormHostIds([]); setFormHostNames([]) }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {searching && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-48 overflow-y-auto">
                    {searchResults.map((customer) => (
                      <div
                        key={customer.id}
                        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted"
                        onClick={() => handleSelectHost(customer)}
                      >
                        <span className="text-sm font-medium">{customer.nickname}</span>
                        <span className="text-xs text-muted-foreground">{customer.member_type || "新人"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-sm text-muted-foreground text-center">
                    未找到匹配用户
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">课程介绍</span>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="输入课程介绍..."
                rows={4}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCourseName}>
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
              <span className="text-xs text-[#4e535a] truncate">{materialsRecord?.course_name}</span>
              <div className="shrink-0">
                <input type="file" id="materials-upload-ics" className="hidden" onChange={handleUploadMaterial} />
                <Button size="sm" className="h-7 text-xs" disabled={uploading} onClick={() => document.getElementById("materials-upload-ics")?.click()}>
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
    </div>
  )
}
