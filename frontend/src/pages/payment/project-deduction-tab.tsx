import { useEffect, useState, useRef, useCallback } from "react"
import { CreditCard } from "lucide-react"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { customerApi, projectDeductionApi, type Customer, type ProjectDeduction } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

const PROJECT_TYPE_OPTIONS = [
  { value: "membership-cards", label: "会员活动" },
  { value: "group-cases", label: "觉醒游戏" },
  { value: "emotional-releases", label: "情绪释放" },
  { value: "oh-card-readings", label: "OH卡梳理" },
  { value: "energy-knots", label: "能量结" },
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  "membership-cards": "会员活动",
  "group-cases": "觉醒游戏",
  "emotional-releases": "情绪释放",
  "oh-card-readings": "OH卡梳理",
  "energy-knots": "能量结",
}

const CARD_TYPE_OPTIONS = [
  { value: "次卡", label: "次卡" },
  { value: "体验会员", label: "体验会员" },
  { value: "常规通卡", label: "常规通卡" },
  { value: "半年卡", label: "半年卡" },
  { value: "年卡", label: "年卡" },
]

export function ProjectDeductionTab() {
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])

  const cpRef = useRef(cp)
  cpRef.current = cp

  // 扣次记录
  const [deductions, setDeductions] = useState<ProjectDeduction[]>([])
  const [deductionsLoading, setDeductionsLoading] = useState(true)

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [customerId, setCustomerId] = useState("")
  const [customerName, setCustomerName] = useState("")
  const [projectType, setProjectType] = useState("")
  const [cardType, setCardType] = useState("")
  const [availableItems, setAvailableItems] = useState<{ id: string; name: string; remaining_count: number; detail?: string; card_type?: string; expiry_date?: string }[]>([])
  const [selectedItemId, setSelectedItemId] = useState("")
  const [deductCount, setDeductCount] = useState("1")
  const [deducting, setDeducting] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)

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

  // 加载扣次记录
  const refreshDeductions = useCallback(async () => {
    setDeductionsLoading(true)
    try {
      const data = await projectDeductionApi.list()
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
    setCustomerId(c.id)
    setCustomerName(c.nickname)
    setProjectType("")
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  const handleClearCustomer = useCallback(() => {
    setCustomerId("")
    setCustomerName("")
    setProjectType("")
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
  }, [])

  // 选择项目类型后加载可销卡项目
  const handleProjectTypeChange = useCallback(async (type: string) => {
    setProjectType(type)
    setCardType("")
    setSelectedItemId("")
    setAvailableItems([])
    if (!customerId || !type) return
    setLoadingItems(true)
    try {
      const items = await projectDeductionApi.getAvailableItems(customerId, type)
      setAvailableItems(items)
    } catch {
      setAvailableItems([])
    }
    setLoadingItems(false)
  }, [customerId])

  // 选择卡类型后筛选（不选卡类型时显示全部）
  const filteredItems = projectType === "membership-cards" && cardType
    ? availableItems.filter(i => i.card_type === cardType)
    : projectType === "membership-cards"
    ? availableItems
    : availableItems

  const selectedItem = availableItems.find(i => i.id === selectedItemId)

  const handleDeduct = async () => {
    if (!customerId || !selectedItemId || !projectType) return
    setDeducting(true)
    try {
      await projectDeductionApi.create({
        customer_id: customerId,
        project_type: projectType,
        project_id: selectedItemId,
        count: parseInt(deductCount) || 1,
      })
      setDialogOpen(false)
      setCustomerId("")
      setCustomerName("")
      setProjectType("")
      setCardType("")
      setSelectedItemId("")
      setAvailableItems([])
      setDeductCount("1")
      refreshDeductions()
    } catch (error: any) {
      alert(error?.message || "销卡失败")
    } finally {
      setDeducting(false)
    }
  }

  return (
    <>
      {/* 销卡按钮 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {deductions.length > 0 && <span>共 {deductions.length} 条记录</span>}
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)}>
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
                <TableHead>项目类型</TableHead>
                <TableHead>项目名称</TableHead>
                <TableHead>销卡次数</TableHead>
                <TableHead>销卡日期</TableHead>
                <TableHead>剩余次数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 text-[#2b2f36]">{d.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {PROJECT_TYPE_LABELS[d.project_type] || d.project_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">{d.project_name}</TableCell>
                  <TableCell className="text-[#2b2f36]">{d.count} 次</TableCell>
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
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setCustomerId(""); setCustomerName(""); setProjectType(""); setCardType("")
          setSelectedItemId(""); setAvailableItems([]); setDeductCount("1")
        }
      }}>
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
                value={customerName || ""}
                onChange={(v) => {
                  const name = typeof v === "string" ? v : v[0] || ""
                  if (!name) handleClearCustomer()
                }}
                onSelectItem={handleSelectCustomer}
                placeholder="搜索客户昵称"
              />
            </div>

            {/* 项目类型 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">类型</span>
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

            {/* 会员活动卡类型子选项 */}
            {projectType === "membership-cards" && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">卡类型</span>
                <SelectDropdown
                  value={cardType}
                  options={CARD_TYPE_OPTIONS}
                  placeholder="选择卡类型"
                  onChange={(v) => { setCardType(v); setSelectedItemId("") }}
                />
              </div>
            )}

            {/* 选择项目 */}
            {projectType && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">项目</span>
                {loadingItems ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">加载中...</div>
                ) : filteredItems.length === 0 ? (
                  <div className="h-8 flex items-center text-[12px] text-[#8f959e]">该用户无可销卡项目</div>
                ) : (
                  <SelectDropdown
                    value={selectedItemId}
                    options={filteredItems.map((i) => ({
                      value: i.id,
                      label: `${i.name} - ${i.detail || `剩余${i.remaining_count}次`}`,
                    }))}
                    placeholder="请选择项目"
                    onChange={setSelectedItemId}
                  />
                )}
              </div>
            )}

            {/* 项目详情 */}
            {selectedItem && (
              <div className="bg-[#f7f8fa] rounded-md p-3 text-[12px] space-y-1">
                <div className="flex justify-between"><span className="text-[#8f959e]">项目名称</span><span>{selectedItem.name}</span></div>
                <div className="flex justify-between"><span className="text-[#8f959e]">剩余次数</span><span>{selectedItem.remaining_count} 次</span></div>
                {selectedItem.expiry_date && (
                  <div className="flex justify-between"><span className="text-[#8f959e]">到期日期</span><span>{selectedItem.expiry_date}</span></div>
                )}
              </div>
            )}

            {/* 次数 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">次数</span>
              <Input
                type="text"
                inputMode="numeric"
                value={deductCount}
                onChange={(e) => setDeductCount(e.target.value.replace(/[^0-9]/g, ""))}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleDeduct} disabled={deducting || !customerId || !selectedItemId}>
                {deducting ? "销卡中..." : "确认销卡"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
