import { useEffect, useState, useRef, useCallback } from "react"
import { Banknote, Pencil, Trash2 } from "lucide-react"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
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
import { customerApi, projectRefundApi, type Customer, type ProjectRefund } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

const PROJECT_TYPE_OPTIONS = [
  { value: "membership-cards", label: "会员卡" },
  { value: "group-cases", label: "觉醒游戏" },
  { value: "emotional-releases", label: "情绪释放" },
  { value: "oh-card-readings", label: "OH卡梳理" },
  { value: "energy-knots", label: "能量结" },
  { value: "other-projects", label: "其他项目" },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡梳理",
  "energy-knots": "能量结",
  "other-projects": "其他项目",
}

export function RefundTab() {
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])

  const cpRef = useRef(cp)
  cpRef.current = cp

  // 搜索
  const [searchNickname, setSearchNickname] = useState("")
  const appliedNicknameRef = useRef("")
  const [searchProjectType, setSearchProjectType] = useState("all")
  const appliedProjectTypeRef = useRef("")

  // 退费记录（分页）
  const fetchRefunds = useCallback(async (page: number, pageSize: number) => {
    const params: Record<string, string> = {}
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedProjectTypeRef.current) params.project_type = appliedProjectTypeRef.current
    return projectRefundApi.listPaginated(page, pageSize, Object.keys(params).length > 0 ? params : undefined)
  }, [])
  const {
    paginatedItems: refunds, currentPage, totalPages, totalItems,
    goToPage, startIndex, endIndex, loading: refundsLoading, refresh: refreshRefunds,
  } = useServerPagination<ProjectRefund>(fetchRefunds)

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [projectType, setProjectType] = useState("")
  const [availableItems, setAvailableItems] = useState<{ id: string; name: string; paid_amount: number; detail?: string; card_type?: string }[]>([])
  const [selectedItemId, setSelectedItemId] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<ProjectRefund | null>(null)
  const [editAmount, setEditAmount] = useState("")
  const [editing, setEditing] = useState(false)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<ProjectRefund | null>(null)
  const [deleting, setDeleting] = useState(false)

  const currentUserName = (() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}").owner || "" } catch { return "" }
  })()

  // 搜索
  const handleFilterChange = useCallback((value: string) => {
    setSearchNickname(value)
    appliedNicknameRef.current = value
    refreshRefunds()
  }, [refreshRefunds])

  const handleTypeChange = useCallback((value: string) => {
    setSearchProjectType(value)
    appliedProjectTypeRef.current = value === "all" ? "" : value
    refreshRefunds()
  }, [refreshRefunds])

  const handleClearSearch = useCallback(() => {
    setSearchNickname("")
    setSearchProjectType("all")
    appliedNicknameRef.current = ""
    appliedProjectTypeRef.current = ""
    refreshRefunds()
  }, [refreshRefunds])

  // 加载客户列表
  useEffect(() => {
    if (!permReady) return
    customerApi.list().then((data) => {
      let filtered = data
      const cu = JSON.parse(localStorage.getItem("currentUser") || "{}")
      if (cu.role !== "超级管理员") {
        if (cpRef.current.length > 0) {
          filtered = data.filter(c => c.member_type && cpRef.current.includes(c.member_type))
        } else {
          filtered = []
        }
      }
      setCustomers(filtered)
    }).catch(() => {})
  }, [permReady])

  // 选中用户后
  const handleSelectCustomer = useCallback((c: Customer) => {
    setCustomerId(c.id)
    setCustomerName(c.nickname)
    setProjectType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  const handleClearCustomer = useCallback(() => {
    setCustomerId("")
    setCustomerName("")
    setProjectType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  // 选择项目类型后加载可退费项目
  const handleProjectTypeChange = useCallback(async (type: string) => {
    setProjectType(type)
    setSelectedItemId("")
    setAvailableItems([])
    setRefundAmount("")
    if (!customerId || !type) return
    setLoadingItems(true)
    try {
      const items = await projectRefundApi.getAvailableItems(customerId, type)
      setAvailableItems(items)
    } catch {
      setAvailableItems([])
    }
    setLoadingItems(false)
  }, [customerId])

  const selectedItem = availableItems.find(i => i.id === selectedItemId)

  // 选中项目后自动填充全额
  const handleSelectItem = useCallback((id: string) => {
    setSelectedItemId(id)
    const item = availableItems.find(i => i.id === id)
    if (item) setRefundAmount(String(item.paid_amount))
  }, [availableItems])

  const handleRefund = async () => {
    if (!customerId || !selectedItemId || !projectType) return
    setSubmitting(true)
    try {
      await projectRefundApi.create({
        customer_id: customerId,
        project_type: projectType,
        project_id: selectedItemId,
        refund_amount: parseFloat(refundAmount) || 0,
        operator_name: currentUserName,
      })
      setDialogOpen(false)
      setCustomerId("")
      setCustomerName("")
      setProjectType("")
      setSelectedItemId("")
      setAvailableItems([])
      setRefundAmount("")
      refreshRefunds()
    } catch (error: any) {
      alert(error?.message || "退费失败")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget || editing) return
    setEditing(true)
    try {
      await projectRefundApi.update(editTarget.id, {
        refund_amount: parseFloat(editAmount) || 0,
        operator_name: currentUserName,
      })
      setEditTarget(null)
      refreshRefunds()
    } catch (error: any) {
      alert(error?.message || "修改失败")
    } finally {
      setEditing(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      await projectRefundApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      refreshRefunds()
    } catch (error: any) {
      alert(error?.message || "删除失败")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      {/* 搜索 + 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-44">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => handleFilterChange(typeof v === "string" ? v : "")}
              placeholder="搜索用户"
              filterSelected={false}
            />
          </div>
          <div className="w-36">
            <SelectDropdown
              value={searchProjectType}
              options={[
                { value: "all", label: "全部类型" },
                ...PROJECT_TYPE_OPTIONS,
              ]}
              onChange={handleTypeChange}
            />
          </div>
          <button onClick={handleClearSearch} className="h-8 px-4 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            清空
          </button>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
          <Banknote className="mr-1 h-3.5 w-3.5" /> 退费
        </Button>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          {totalItems > 0 && <span>共 {totalItems} 条记录</span>}
        </p>
      </div>

      {/* 退费记录表格 */}
      <div className="bg-white rounded-lg">
        {refundsLoading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Banknote className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无退费记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"退费"按钮操作</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">昵称</TableHead>
                <TableHead>项目类型</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>已付金额</TableHead>
                <TableHead>退费金额</TableHead>
                <TableHead>退费日期</TableHead>
                <TableHead>操作人</TableHead>
                <TableHead className="w-20">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{r.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {PROJECT_TYPE_LABELS[r.project_type] || r.project_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">{r.project_name}</TableCell>
                  <TableCell className="text-[#2b2f36]">¥{r.paid_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-[#c4506a]">¥{r.refund_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-[#2b2f36]">{r.refund_date}</TableCell>
                  <TableCell className="text-[#8f959e]">{r.operator_name || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <button className="p-1 hover:bg-[#f0f1f2] rounded" onClick={() => { setEditTarget(r); setEditAmount(String(r.refund_amount)) }}>
                        <Pencil className="h-3.5 w-3.5 text-[#8f959e]" />
                      </button>
                      <button className="p-1 hover:bg-[#fef0f0] rounded" onClick={() => setDeleteTarget(r)}>
                        <Trash2 className="h-3.5 w-3.5 text-[#c4506a]" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {totalItems > 0 && (
        <PaginationBar
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
        />
      )}

      {/* 退费弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setCustomerId(""); setCustomerName(""); setProjectType("")
          setSelectedItemId(""); setAvailableItems([]); setRefundAmount("")
        }
      }}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">项目退费</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
              <CustomerSearchInput
                customers={customers}
                value={customerName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) handleClearCustomer()
                }}
                onSelectItem={handleSelectCustomer}
              />
            </div>

            {/* 项目类型 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-[14px]">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">类型</span>
              {!customerId ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">请先选择用户</div>
              ) : (
                <SelectDropdown
                  value={projectType}
                  options={PROJECT_TYPE_OPTIONS}
                  placeholder="选择项目类型"
                  onChange={handleProjectTypeChange}
                />
              )}
            </div>

            {/* 选择项目 */}
            {projectType && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">项目</span>
                {loadingItems ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">加载中...</div>
                ) : availableItems.length === 0 ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户无可退费项目</div>
                ) : (
                  <SelectDropdown
                    value={selectedItemId}
                    options={availableItems.map((i) => ({
                      value: i.id,
                      label: `${i.name} - ¥${i.paid_amount}`,
                    }))}
                    placeholder="请选择项目"
                    onChange={handleSelectItem}
                  />
                )}
              </div>
            )}

            {/* 项目详情 */}
            {selectedItem && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">项目名称</span><span>{selectedItem.name}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">已付金额</span><span>¥{selectedItem.paid_amount.toLocaleString()}</span></div>
              </div>
            )}

            {/* 退费金额 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">金额</span>
              <Input
                type="text"
                inputMode="decimal"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-8 text-xs"
                placeholder="输入退费金额"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleRefund} disabled={submitting || !customerId || !selectedItemId || !refundAmount}>
                {submitting ? "退费中..." : "确认退费"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑弹窗 */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null) }}>
        <DialogContent className="max-w-xs p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-5 pt-4 pb-3 border-b">
            <DialogTitle className="text-[13px]">修改退费金额</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-3">
            <div className="text-[12px] text-[#8f959e]">
              {editTarget?.nickname} — {editTarget?.project_name}
            </div>
            <div className="grid grid-cols-[56px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">金额</span>
              <Input
                type="text"
                inputMode="decimal"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>取消</Button>
              <Button size="sm" onClick={handleEdit} disabled={editing || !editAmount}>
                {editing ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除 {deleteTarget?.nickname} 的「{deleteTarget?.project_name}」退费记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
