import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Banknote, Inbox, Pencil, Trash2, X } from "lucide-react"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
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
import { customerApi, projectRefundApi, type Customer, type ProjectRefund } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"

function EmptyValue({ className }: { className?: string }) {
  return <span className={`inline-block align-middle h-[2px] w-[4px] rounded-full bg-[#e5e8eb] shrink-0 ${className ?? ""}`} />
}

const PROJECT_TYPE_OPTIONS = [
  { value: "membership-cards", label: "会员卡" },
  { value: "group-cases", label: "觉醒游戏" },
  { value: "emotional-releases", label: "情绪释放" },
  { value: "oh-card-readings", label: "OH卡诊断" },
  { value: "energy-knots", label: "能量结" },
  { value: "tea-seat-fees", label: "茶位费" },
  { value: "internal-courses", label: "内部课程" },
  { value: "other-projects", label: "其他项目" },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "membership-cards": "会员卡",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡诊断",
  "energy-knots": "能量结",
  "tea-seat-fees": "茶位费",
  "internal-courses": "内部课程",
  "other-projects": "其他项目",
}

type RefundableItem = {
  id: string
  name: string
  paid_amount: number
  detail?: string
  card_type?: string
  project_type: string
  project_type_label: string
  selection_key: string
}

export function RefundTab() {
  const [customers, setCustomers] = useState<Customer[]>([])

  const nicknameToCustomer = useMemo(() => {
    const map: Record<string, Customer> = {}
    customers.forEach(c => { if (c.nickname) map[c.nickname] = c })
    return map
  }, [customers])

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
  const [availableItems, setAvailableItems] = useState<RefundableItem[]>([])
  const [selectedItemKey, setSelectedItemKey] = useState("")
  const [refundAmount, setRefundAmount] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const availableItemsRequestRef = useRef(0)

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
    customerApi.list().then((data) => {
      setCustomers(data)
    }).catch(() => {})
  }, [])

  // 选中用户后：并行查询全部类型，合并所有可退费项目
  const handleSelectCustomer = useCallback(async (c: Customer) => {
    const requestId = ++availableItemsRequestRef.current
    setCustomerId(c.id)
    setCustomerName(c.nickname)
    setSelectedItemKey("")
    setAvailableItems([])
    setLoadingItems(true)
    const groupedItems = await Promise.all(PROJECT_TYPE_OPTIONS.map(async (option) => {
      try {
        const items = await projectRefundApi.getAvailableItems(c.id, option.value)
        return items.map((item) => ({
          ...item,
          project_type: option.value,
          project_type_label: option.label,
          selection_key: `${option.value}:${item.id}`,
        }))
      } catch {
        return []
      }
    }))
    if (requestId !== availableItemsRequestRef.current) return
    setAvailableItems(groupedItems.flat())
    setLoadingItems(false)
  }, [])

  const handleClearCustomer = useCallback(() => {
    availableItemsRequestRef.current += 1
    setCustomerId("")
    setCustomerName("")
    setSelectedItemKey("")
    setAvailableItems([])
    setLoadingItems(false)
  }, [])

  const selectedItem = availableItems.find(i => i.selection_key === selectedItemKey)

  const handleRefund = async () => {
    if (!customerId || !selectedItem) return
    setSubmitting(true)
    try {
      await projectRefundApi.create({
        customer_id: customerId,
        project_type: selectedItem.project_type,
        project_id: selectedItem.id,
        refund_amount: parseFloat(refundAmount) || 0,
        created_by: currentUserName,
      })
      setDialogOpen(false)
      availableItemsRequestRef.current += 1
      setCustomerId("")
      setCustomerName("")
      setSelectedItemKey("")
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
        updated_by: currentUserName,
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
    <div className="dv-root bg-[#f4f5f6] h-full p-4 flex flex-col gap-3">
      <style>{`.dv-root { font-family: -apple-system, "PingFang SC", "Helvetica Neue", sans-serif; }`}</style>
      {/* 标题栏 */}
      <div className="flex items-center flex-wrap gap-2 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)] px-5 h-[52px]">
        <span className="text-[15px] font-bold text-[#212631] whitespace-nowrap">退费</span>
        <span className="text-[11.5px] text-[#a8b1bd] ml-2.5 whitespace-nowrap">管理与查看全部退费记录</span>
      </div>
      {/* 表格卡：筛选条 + 数据表 */}
      <div className="rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => handleFilterChange(typeof v === "string" ? v : "")}
              placeholder="搜索用户"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <SelectDropdown
            className="w-[138px]"
            buttonClassName="border-[#e1e4e7] bg-white px-2.5"
            rounded="7px"
            value={searchProjectType}
            options={[
              { value: "all", label: "全部类型" },
              ...PROJECT_TYPE_OPTIONS,
            ]}
            textColor={searchProjectType !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
            onChange={handleTypeChange}
          />
          <button
            onClick={handleClearSearch}
            className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]"
          >
            <X className="h-3.5 w-3.5" />
            清空
          </button>
          <div className="flex-1" />
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={() => setDialogOpen(true)}>
            <Banknote className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" /> 退费
          </Button>
        </div>
        {refundsLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">加载中...</span></div>
        ) : totalItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2"><Inbox className="h-8 w-8 text-[#d0d3d6]" /><span className="text-[12px] text-[#8f959e]">暂无数据</span></div>
        ) : (
          <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "140px" }}>昵称</TableHead>
                <TableHead style={{ width: "100px" }}>项目类型</TableHead>
                <TableHead style={{ width: "140px" }}>项目名称</TableHead>
                <TableHead style={{ width: "90px" }}>已付金额</TableHead>
                <TableHead style={{ width: "90px" }}>退费金额</TableHead>
                <TableHead style={{ width: "100px" }}>退费日期</TableHead>
                <TableHead style={{ width: "80px" }}>创建人</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "88px" }}>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {refunds.map((r) => (
                <TableRow key={r.id} className="group hover:bg-[#f7f8fa]">
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eef0f2] text-[12px] font-medium text-[#646a73]">
                        {(r.nickname || "客").charAt(0)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-[#212631]">{r.nickname || <EmptyValue />}</span>
                        {nicknameToCustomer[r.nickname] && (
                          <span className="mt-0.5 block truncate text-[12px] text-[#a8b1bd]">
                            {[nicknameToCustomer[r.nickname].name && nicknameToCustomer[r.nickname].name !== r.nickname ? nicknameToCustomer[r.nickname].name : "", nicknameToCustomer[r.nickname].gender].filter(Boolean).join(" · ") || <EmptyValue />}
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full border border-[#e1e4e7] bg-white px-2 py-0.5 text-[12px] text-[#4e535a]">
                      {PROJECT_TYPE_LABELS[r.project_type] || r.project_type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px] text-[#2b2f36] truncate block" title={r.project_name}>{r.project_name}</span>
                  </TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#2b2f36]">¥{r.paid_amount.toLocaleString()}</TableCell>
                  <TableCell className="tabular-nums text-[12px] text-[#c4506a]">¥{r.refund_amount.toLocaleString()}</TableCell>
                  <TableCell className="text-[12px] text-[#2b2f36] tabular-nums">{r.refund_date}</TableCell>
                  <TableCell className="text-[12px] text-[#a8b1bd]">{r.created_by || <EmptyValue />}</TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setEditTarget(r); setEditAmount(String(r.refund_amount)) }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(r)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
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

      {/* 退费弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          availableItemsRequestRef.current += 1
          setCustomerId(""); setCustomerName(""); setSelectedItemKey("")
          setAvailableItems([]); setLoadingItems(false); setRefundAmount("")
        }
      }}>
        <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[14px] font-normal">项目退费</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">用户</span>
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

            {/* 可退项目 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">可退项目</span>
              {!customerId ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">请先选择用户</div>
              ) : loadingItems ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">正在加载可退项目...</div>
              ) : availableItems.length === 0 ? (
                <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户暂无可退项目</div>
              ) : (
                <SelectDropdown
                  value={selectedItemKey}
                  options={availableItems.map((item) => ({
                    value: item.selection_key,
                    label: `${item.project_type_label} · ${item.name} · ¥${item.paid_amount}`,
                  }))}
                  placeholder="请选择可退项目"
                  onChange={(key) => {
                    setSelectedItemKey(key)
                    const item = availableItems.find(i => i.selection_key === key)
                    if (item) setRefundAmount(String(item.paid_amount))
                  }}
                />
              )}
            </div>

            {/* 项目详情 */}
            {selectedItem && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">项目类型</span><span>{selectedItem.project_type_label}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">项目名称</span><span>{selectedItem.name}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">已付金额</span><span>¥{selectedItem.paid_amount.toLocaleString()}</span></div>
              </div>
            )}

            {/* 退费金额 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] text-right tracking-widest">金额</span>
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
              <Button size="sm" onClick={handleRefund} disabled={submitting || !customerId || !selectedItem || !refundAmount}>
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
    </div>
  )
}
