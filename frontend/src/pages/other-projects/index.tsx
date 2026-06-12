import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, Package, Search, X, CreditCard } from "lucide-react"
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
import { customerApi, otherProjectApi, type Customer, type OtherProject, type OtherProjectDeduction } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { useOrganizations } from "@/hooks/use-organizations"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

const DURATION_OPTIONS = [
  { type: "day", label: "天" },
  { type: "month", label: "月" },
]

const today = new Date().toLocaleDateString("sv-SE")

const TABS = [
  { key: "list", label: "其他项目" },
  { key: "deduction", label: "项目销卡" },
]

export function OtherProjectsContent({ embedded }: { embedded?: boolean } = {}) {
  const [activeTab, setActiveTab] = useState("list")

  const content = (
    <>
      {/* Tab 切换 */}
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 mb-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-2 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "list" && <OtherProjectList />}
      {activeTab === "deduction" && <DeductionTab />}
    </>
  )

  if (embedded) return content
  return <div className="px-6 pt-4 pb-6 space-y-3">{content}</div>
}

function OtherProjectList() {
  const enterToNext = useEnterToNext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<OtherProject | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formCustomerId, setFormCustomerId] = useState("")
  const [formNickname, setFormNickname] = useState("")
  const [formProjectName, setFormProjectName] = useState("")
  const [formFee, setFormFee] = useState("")
  const [formActivityMode, setFormActivityMode] = useState("线下")
  const [formEffectiveDate, setFormEffectiveDate] = useState(today)
  const [formDurationType, setFormDurationType] = useState<string | null>("day")
  const [formDurationValue, setFormDurationValue] = useState("")
  const [formRemainingCount, setFormRemainingCount] = useState("")
  const [formUnlimited, setFormUnlimited] = useState(false)
  const [formCloserId, setFormCloserId] = useState("")
  const [formCloserName, setFormCloserName] = useState("")
  const [formOrganizationId, setFormOrganizationId] = useState("")
  const { organizations, hasAnyOrganization } = useOrganizations()
  const navigate = useNavigate()
  const [noOrgDialogOpen, setNoOrgDialogOpen] = useState(false)
  const [noAssignmentDialogOpen, setNoAssignmentDialogOpen] = useState(false)

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
      return { items: [] as OtherProject[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }
    const params: any = {}
    if (!isSuperAdminRef.current) {
      const allowed = customersRef.current
      if (allowed.length === 0) {
        return { items: [] as OtherProject[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
      }
      params.customer_ids = allowed.map(c => c.id).join(",")
    }
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedCloserNameRef.current) params.closer_name = appliedCloserNameRef.current
    return otherProjectApi.listPaginated(page, pageSize, Object.keys(params).length > 0 ? params : undefined)
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
    if (!hasAnyOrganization) { setNoOrgDialogOpen(true); return }
    if (organizations.length === 0) { setNoAssignmentDialogOpen(true); return }
    setEditingItem(null)
    setFormCustomerId("")
    setFormNickname("")
    setFormProjectName("")
    setFormFee("")
    setFormActivityMode("线下")
    setFormEffectiveDate(today)
    setFormDurationType("day")
    setFormDurationValue("")
    setFormRemainingCount("")
    setFormUnlimited(false)
    setFormCloserId("")
    setFormCloserName("")
    setFormOrganizationId(organizations.length > 0 ? organizations[0].id : "")
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: OtherProject) => {
    setEditingItem(item)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormProjectName(item.project_name)
    setFormFee(String(item.fee))
    setFormActivityMode(item.activity_mode)
    setFormEffectiveDate(item.effective_date)
    setFormDurationType(item.duration_type)
    setFormDurationValue(item.duration_value ? String(item.duration_value) : "")
    setFormRemainingCount(item.remaining_count !== null && item.remaining_count !== undefined ? String(item.remaining_count) : "")
    setFormUnlimited(item.remaining_count === null)
    setFormCloserId(item.closer_id || "")
    setFormCloserName(item.closer_name || "")
    setFormOrganizationId(item.organization_id || "")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCustomerId || !formProjectName) return
    setSaving(true)
    try {
      const data = {
        customer_id: formCustomerId,
        nickname: formNickname,
        project_name: formProjectName,
        fee: parseFloat(formFee) || 0,
        activity_mode: formActivityMode,
        effective_date: formEffectiveDate,
        duration_type: formDurationType,
        duration_value: formDurationValue ? parseInt(formDurationValue) : null,
        remaining_count: formUnlimited ? null : (formRemainingCount ? parseInt(formRemainingCount) : null),
        closer_id: formCloserId || null,
        closer_name: formCloserName || null,
        organization_id: formOrganizationId || null,
      }
      if (editingItem) {
        await otherProjectApi.update(editingItem.id, data)
      } else {
        await otherProjectApi.create(data)
      }
      setDialogOpen(false)
      refresh()
    } catch (error) {
      console.error("保存失败:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    await otherProjectApi.delete(deleteId)
    setDeleteId(null)
    refresh()
  }

  return (
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
            <Package className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无其他项目记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">录入日期</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>费用</TableHead>
                <TableHead>活动方式</TableHead>
                <TableHead>生效日期</TableHead>
                <TableHead>到期日期</TableHead>
                <TableHead>剩余次数</TableHead>
                <TableHead>成交人</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{item.created_at.split("T")[0]}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {item.project_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">¥{item.fee.toLocaleString()}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.activity_mode}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.effective_date}</TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.expiry_date || <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.remaining_count === null ? "不限" : item.remaining_count !== undefined ? `${item.remaining_count} 次` : "-"}
                  </TableCell>
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
            <DialogTitle className="text-base">{editingItem ? "编辑项目" : "新增项目"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            {/* 项目名称 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">项目名称</span>
              <Input
                type="text"
                value={formProjectName}
                onChange={(e) => setFormProjectName(e.target.value)}
                placeholder="输入项目名称"
                className="h-8 text-xs"
              />
            </div>

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

            {/* 活动方式 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">活动方式</span>
              <div className="flex gap-1">
                {["线上", "线下"].map((mode) => (
                  <button
                    key={mode}
                    className={`px-3 h-8 rounded border text-[12px] transition-colors ${
                      formActivityMode === mode
                        ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]"
                        : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"
                    }`}
                    onClick={() => setFormActivityMode(mode)}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* 费用 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">费用</span>
              <Input
                type="number"
                value={formFee}
                onChange={(e) => setFormFee(e.target.value)}
                placeholder="0"
                className="h-8 text-xs"
                min="0"
                step="0.01"
              />
            </div>

            {/* 生效日期 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">生效日期</span>
              <Input type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} className="h-8 text-xs" />
            </div>

            {/* 时长 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时长</span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={formDurationValue}
                  onChange={(e) => setFormDurationValue(e.target.value)}
                  placeholder="输入时长"
                  className="h-8 text-xs flex-1"
                  min="1"
                />
                <div className="flex gap-1">
                  {DURATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.type}
                      className={`px-3 h-8 rounded border text-[12px] transition-colors ${
                        formDurationType === opt.type
                          ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]"
                          : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"
                      }`}
                      onClick={() => setFormDurationType(opt.type)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 次数 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">次数</span>
              <div className="flex gap-2">
                {!formUnlimited && (
                  <Input
                    type="number"
                    value={formRemainingCount}
                    onChange={(e) => setFormRemainingCount(e.target.value)}
                    placeholder="输入次数（可选）"
                    className="h-8 text-xs flex-1"
                    min="0"
                  />
                )}
                <button
                  className={`px-3 h-8 rounded border text-[12px] whitespace-nowrap transition-colors ${
                    formUnlimited
                      ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]"
                      : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"
                  }`}
                  onClick={() => {
                    setFormUnlimited(!formUnlimited)
                    if (!formUnlimited) setFormRemainingCount("")
                  }}
                >
                  不限
                </button>
              </div>
            </div>

            {/* 成交人搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">所属组织</span>
              <SelectDropdown
                value={formOrganizationId}
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                placeholder="选择组织"
                onChange={setFormOrganizationId}
              />
            </div>

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
              <Button size="sm" onClick={handleSave} disabled={saving || !formCustomerId || !formProjectName}>
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

      <AlertDialog open={noOrgDialogOpen} onOpenChange={setNoOrgDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>需要先配置组织</AlertDialogTitle>
            <AlertDialogDescription>系统中暂无组织信息，请先前往组织管理页面配置组织。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/organizations")}>前往配置</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={noAssignmentDialogOpen} onOpenChange={setNoAssignmentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未分配所属组织</AlertDialogTitle>
            <AlertDialogDescription>当前账号未被分配所属组织，请联系管理者分配。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setNoAssignmentDialogOpen(false)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}


/* ========== 项目销卡 Tab ========== */

function DeductionTab() {
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersReady, setCustomersReady] = useState(false)

  const cpRef = useRef(cp)
  cpRef.current = cp
  const isSuperAdminRef = useRef(false)

  // 扣次记录
  const [deductions, setDeductions] = useState<OtherProjectDeduction[]>([])
  const [deductionsLoading, setDeductionsLoading] = useState(true)

  // 弹窗
  const [deductDialogOpen, setDeductDialogOpen] = useState(false)
  const [deductCustomerId, setDeductCustomerId] = useState("")
  const [deductCustomerName, setDeductCustomerName] = useState("")
  const [availableProjects, setAvailableProjects] = useState<{ id: string; project_name: string; activity_mode: string; remaining_count: number | null; effective_date: string; expiry_date: string; created_at: string }[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState("")
  const [deductCount, setDeductCount] = useState("1")
  const [deducting, setDeducting] = useState(false)
  const [loadingProjects, setLoadingProjects] = useState(false)

  // 加载客户列表
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
      setCustomersReady(true)
    }).catch(() => setCustomersReady(true))
  }, [permReady])

  // 加载扣次记录
  const refreshDeductions = useCallback(async () => {
    setDeductionsLoading(true)
    try {
      const data = await otherProjectApi.listDeductions()
      setDeductions(data)
    } catch {
      setDeductions([])
    }
    setDeductionsLoading(false)
  }, [])

  useEffect(() => {
    refreshDeductions()
  }, [refreshDeductions])

  // 选中用户后加载可销卡项目
  const handleSelectCustomer = useCallback(async (c: Customer) => {
    setDeductCustomerId(c.id)
    setDeductCustomerName(c.nickname)
    setSelectedProjectId("")
    setLoadingProjects(true)
    try {
      const projects = await otherProjectApi.getAvailableProjects(c.id)
      setAvailableProjects(projects)
    } catch {
      setAvailableProjects([])
    }
    setLoadingProjects(false)
  }, [])

  const handleClearCustomer = useCallback(() => {
    setDeductCustomerId("")
    setDeductCustomerName("")
    setSelectedProjectId("")
    setAvailableProjects([])
  }, [])

  const handleDeduct = async () => {
    if (!deductCustomerId || !selectedProjectId) return
    setDeducting(true)
    try {
      await otherProjectApi.deduct({
        customer_id: deductCustomerId,
        other_project_id: selectedProjectId,
        count: parseInt(deductCount) || 1,
      })
      setDeductDialogOpen(false)
      setDeductCustomerId("")
      setDeductCustomerName("")
      setSelectedProjectId("")
      setAvailableProjects([])
      setDeductCount("1")
      refreshDeductions()
    } catch (error) {
      console.error("销卡失败:", error)
    } finally {
      setDeducting(false)
    }
  }

  const selectedProject = availableProjects.find(p => p.id === selectedProjectId)

  return (
    <>
      {/* 销卡按钮 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {deductions.length > 0 && <span>共 {deductions.length} 条记录</span>}
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={() => setDeductDialogOpen(true)}>
          <CreditCard className="mr-1 h-3.5 w-3.5" /> 销卡
        </Button>
      </div>

      {/* 扣次记录表格 */}
      <div className="bg-white rounded-lg">
        {deductionsLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : deductions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无销卡记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"销卡"按钮操作</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>录入日期</TableHead>
                <TableHead>活动方式</TableHead>
                <TableHead>销卡日期</TableHead>
                <TableHead>剩余次数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{d.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">{d.project_name}</Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">{d.project_created_at}</TableCell>
                  <TableCell className="text-[#2b2f36]">{d.activity_mode}</TableCell>
                  <TableCell className="text-[#2b2f36]">{d.deduction_date}</TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {d.remaining_after < 0 ? <span className="text-[#c4506a]">{d.remaining_after} 次</span> : `${d.remaining_after} 次`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 销卡弹窗 */}
      <Dialog open={deductDialogOpen} onOpenChange={(open) => { setDeductDialogOpen(open); if (!open) { setDeductCustomerId(""); setDeductCustomerName(""); setSelectedProjectId(""); setAvailableProjects([]); setDeductCount("1") } }}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">项目销卡</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">用户</span>
              <CustomerSearchInput
                customers={customers}
                value={deductCustomerName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) handleClearCustomer()
                }}
                onSelectItem={handleSelectCustomer}
                placeholder="搜索客户昵称"
              />
            </div>

            {/* 选择项目 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">项目</span>
              {!deductCustomerId ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">请先选择用户</div>
              ) : loadingProjects ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">加载中...</div>
              ) : availableProjects.length === 0 ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户无可销卡项目</div>
              ) : (
                <SelectDropdown
                  value={selectedProjectId}
                  options={availableProjects.map((p) => ({
                    value: p.id,
                    label: `${p.project_name} (${p.activity_mode}) - 剩余${p.remaining_count === null ? "不限" : `${p.remaining_count}次`}`,
                  }))}
                  placeholder="请选择项目"
                  onChange={setSelectedProjectId}
                />
              )}
            </div>

            {/* 项目详情 */}
            {selectedProject && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">活动方式</span><span>{selectedProject.activity_mode}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">剩余次数</span><span>{selectedProject.remaining_count === null ? "不限" : `${selectedProject.remaining_count} 次`}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">生效日期</span><span>{selectedProject.effective_date}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">到期日期</span><span>{selectedProject.expiry_date || "不限"}</span></div>
              </div>
            )}

            {/* 次数 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">次数</span>
              <Input
                type="number"
                value={deductCount}
                onChange={(e) => setDeductCount(e.target.value)}
                className="h-8 text-xs"
                min="1"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDeductDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleDeduct} disabled={deducting || !deductCustomerId || !selectedProjectId}>
                {deducting ? "销卡中..." : "确认销卡"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}


export default function OtherProjectsPage() {
  return <OtherProjectsContent />
}
