import { useEffect, useState, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, CreditCard, X } from "lucide-react"
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
import { customerApi, membershipCardApi, type Customer, type MembershipCard } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { CloserInput, type Closer } from "@/components/closer-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useOrganizations } from "@/hooks/use-organizations"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

const CARD_TYPES: Record<string, { price: number; defaultCount?: number; unlimited?: boolean; duration?: string }> = {
  "次卡": { price: 198, defaultCount: 1 },
  "体验会员": { price: 398, defaultCount: 4 },
  "月卡": { price: 1999, unlimited: true, duration: "1 个月" },
  "3月卡": { price: 3999, unlimited: true, duration: "3 个月" },
  "30次卡": { price: 3999, defaultCount: 30, duration: "1 年" },
  "半年卡": { price: 7999, unlimited: true, duration: "6 个月" },
  "年卡": { price: 12800, unlimited: true, duration: "1 年" },
}

const DURATION_OPTIONS = [
  { type: "day", label: "天" },
  { type: "month", label: "月" },
]

const today = new Date().toLocaleDateString("sv-SE")

export function MembershipCardContent({ embedded }: { embedded?: boolean } = {}) {
  const enterToNext = useEnterToNext()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCard, setEditingCard] = useState<MembershipCard | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // 表单
  const [formCustomerId, setFormCustomerId] = useState("")
  const [formNickname, setFormNickname] = useState("")
  const [formCardType, setFormCardType] = useState("")
  const [formEffectiveDate, setFormEffectiveDate] = useState(today)
  const [formDurationType, setFormDurationType] = useState<string | null>("day")
  const [formDurationValue, setFormDurationValue] = useState("")
  const [formRemainingCount, setFormRemainingCount] = useState("")
  const [formUnlimited, setFormUnlimited] = useState(false)
  const [formPrice, setFormPrice] = useState("")
  const [formClosers, setFormClosers] = useState<Closer[]>([])
  const [formOrganizationId, setFormOrganizationId] = useState("")
  const [formDealDate, setFormDealDate] = useState(today)
  const [closerError, setCloserError] = useState(false)
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
      return { items: [] as MembershipCard[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }
    const params: any = {}
    if (!isSuperAdminRef.current) {
      const allowed = customersRef.current
      if (allowed.length === 0) {
        return { items: [] as MembershipCard[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
      }
      params.customer_ids = allowed.map(c => c.id).join(",")
    }
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedCloserNameRef.current) params.closer_name = appliedCloserNameRef.current
    return membershipCardApi.listPaginated(page, pageSize, Object.keys(params).length > 0 ? params : undefined)
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

  const handleSelectCardType = (type: string) => {
    setFormCardType(type)
    const config = CARD_TYPES[type]
    setFormPrice(String(config.price))
    if (config.defaultCount) {
      setFormRemainingCount(String(config.defaultCount))
      setFormUnlimited(false)
      setFormDurationType("day")
      setFormDurationValue("")
    } else if (config.unlimited) {
      setFormRemainingCount("")
      setFormUnlimited(true)
      setFormDurationType("month")
      setFormDurationValue("12")
    } else {
      setFormRemainingCount("")
      setFormUnlimited(false)
      setFormDurationType("day")
      setFormDurationValue("")
    }
  }

  const handleFilterChange = (field: "nickname" | "closer", value: string) => {
    if (field === "nickname") { setSearchNickname(value); appliedNicknameRef.current = value }
    else { setSearchCloserName(value); appliedCloserNameRef.current = value }
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
    setEditingCard(null)
    setFormCustomerId("")
    setFormNickname("")
    setFormCardType("")
    setFormEffectiveDate(today)
    setFormDurationType("day")
    setFormDurationValue("")
    setFormRemainingCount("")
    setFormUnlimited(false)
    setFormPrice("")
    setFormClosers([])
    setFormOrganizationId(organizations.length > 0 ? organizations[0].id : "")
    setFormDealDate(today)
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: MembershipCard) => {
    setEditingCard(item)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormCardType(item.card_type)
    setFormEffectiveDate(item.effective_date)
    setFormDurationType(item.duration_type)
    setFormDurationValue(item.duration_value ? String(item.duration_value) : "")
    setFormRemainingCount(item.remaining_count !== null && item.remaining_count !== undefined ? String(item.remaining_count) : "")
    setFormUnlimited(item.remaining_count === null || item.remaining_count === undefined)
    setFormPrice(String(item.price))
    setFormClosers(item.closers?.length ? item.closers : (item.closer_id ? [{ id: item.closer_id, name: item.closer_name || "", amount: 0 }] : []))
    setFormOrganizationId(item.organization_id || "")
    setFormDealDate(item.deal_date || "")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCustomerId || !formCardType) return
    if (!editingCard && formClosers.length === 0) {
      setCloserError(true)
      return
    }
    setCloserError(false)
    setSaving(true)
    try {
      const config = CARD_TYPES[formCardType]
      const data = {
        customer_id: formCustomerId,
        nickname: formNickname,
        card_type: formCardType,
        price: formPrice ? parseFloat(formPrice) : config.price,
        effective_date: formEffectiveDate,
        duration_type: formDurationType,
        duration_value: formDurationValue ? parseInt(formDurationValue) : null,
        remaining_count: (config.unlimited || formUnlimited) ? null : (formRemainingCount ? parseInt(formRemainingCount) : null),
        closer_id: formClosers[0]?.id || null,
        closer_name: formClosers[0]?.name || null,
        closers: formClosers,
        organization_id: formOrganizationId || null,
        deal_date: formDealDate || null,
      }
      if (editingCard) {
        await membershipCardApi.update(editingCard.id, data)
      } else {
        await membershipCardApi.create(data)
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
    await membershipCardApi.delete(deleteId)
    setDeleteId(null)
    refresh()
  }

  // 判断表单各区块是否显示
  const showDuration = formCardType && !CARD_TYPES[formCardType]?.unlimited && !CARD_TYPES[formCardType]?.defaultCount && !CARD_TYPES[formCardType]?.duration
  const showCount = formCardType && !CARD_TYPES[formCardType]?.unlimited && !CARD_TYPES[formCardType]?.duration
  const showDurationInfo = formCardType && CARD_TYPES[formCardType]?.duration  // 显示有效期信息（月卡/3月卡/半年卡/年卡/30次卡）

  const content = (
    <>
      {/* 搜索栏 */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchNickname}
            onChange={(v) => handleFilterChange("nickname", typeof v === "string" ? v : "")}
            placeholder="搜索用户"
            filterSelected={false}
          />
        </div>
        <div className="w-44">
          <CustomerSearchInput
            customers={customers}
            value={searchCloserName}
            onChange={(v) => handleFilterChange("closer", typeof v === "string" ? v : "")}
            placeholder="搜索成交人"
            filterSelected={false}
          />
        </div>
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
          <span>会员活动次数，含沙龙活动（非公益）、觉醒游戏旁观位、情绪释放旁观位。</span>
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
            <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无会员活动记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">成交日期</TableHead>
                <TableHead>用户</TableHead>
                <TableHead>会员活动类型</TableHead>
                <TableHead>价格</TableHead>
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
                  <TableCell className="pl-4 text-[#2b2f36]">{item.deal_date || "-"}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.nickname}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[11px] font-normal">
                      {item.card_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">¥{item.price.toLocaleString()}</TableCell>
                  <TableCell className="text-[#2b2f36]">{item.effective_date}</TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.expiry_date || <span className="text-[12px] text-[#4e535a] font-light">-</span>}
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.remaining_count !== null && item.remaining_count !== undefined
                      ? `${item.remaining_count} 次`
                      : <span className="text-[12px] text-[#4e535a] font-light">不限</span>}
                  </TableCell>
                  <TableCell className="text-[#2b2f36]">
                    {item.closers?.length ? item.closers.map(c => c.name).join(", ") : (item.closer_name || <span className="text-[12px] text-[#4e535a] font-light">-</span>)}
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
            <DialogTitle className="text-base">{editingCard ? "编辑会员活动" : "新增会员活动"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4" {...enterToNext}>
            {/* 成交日期 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成交日期</span>
              <Input type="date" value={formDealDate} onChange={(e) => setFormDealDate(e.target.value)} />
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
               
                disabled={!!editingCard}
              />
            </div>

            {/* 生效日期 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">生效日期</span>
              <Input type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} className="h-8 text-xs" />
            </div>

            {/* 会员活动类型 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-1.5">会员活动</span>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CARD_TYPES).map(([type, config]) => (
                  <button
                    key={type}
                    className={`px-3 py-2 rounded border text-left transition-colors ${
                      formCardType === type
                        ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]"
                        : "border-[#e0e0e0] hover:border-[#c0c0c0] text-[#2b2f36]"
                    }`}
                    onClick={() => handleSelectCardType(type)}
                  >
                    <div className="text-[12px] font-medium">{type}</div>
                    <div className="text-[11px] text-[#8f959e] mt-0.5">¥{config.price.toLocaleString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 费用金额 */}
            {formCardType && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">费用金额</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={formPrice}
                  onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={CARD_TYPES[formCardType] ? `${CARD_TYPES[formCardType].price}` : ""}
                  className="h-8 text-xs"
                />
              </div>
            )}

            {/* 时长输入（月卡/三月卡/半年卡） */}
            {showDuration && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">时长</span>
                <div>
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
              </div>
            )}

            {/* 次数输入 */}
            {showCount && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">次数</span>
                <div>
                  <div className="flex gap-2">
                    {!formUnlimited && (
                      <Input
                        type="number"
                        value={formRemainingCount}
                        onChange={(e) => setFormRemainingCount(e.target.value)}
                        placeholder={CARD_TYPES[formCardType]?.defaultCount ? `${CARD_TYPES[formCardType].defaultCount} 次（默认）` : "输入次数（可选）"}
                        className="h-8 text-xs flex-1"
                        min="0"
                      />
                    )}
                    {!CARD_TYPES[formCardType]?.defaultCount && (
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
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 有效期信息（月卡/3月卡/半年卡/年卡/30次卡） */}
            {showDurationInfo && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">有效期</span>
                <Input
                  value={`${CARD_TYPES[formCardType]?.duration}，${CARD_TYPES[formCardType]?.unlimited ? "次数不限" : `${CARD_TYPES[formCardType]?.defaultCount} 次`}`}
                  disabled
                  className="h-8 text-xs"
                />
              </div>
            )}

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
              <div>
                <CloserInput customers={customers} value={formClosers} onChange={(v) => { setFormClosers(v); if (v.length > 0) setCloserError(false) }} defaultAmount={parseFloat(formPrice) || 0} />
                {closerError && <span className="text-[11px] text-[#f54a45] mt-0.5 block">请选择成交人</span>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCustomerId || !formCardType}>
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

  if (embedded) return content
  return <div className="px-6 pt-12 pb-6 space-y-3"><h1 className="text-lg font-semibold">会员活动</h1>{content}</div>
}

export default function MembershipCardsPage() {
  return <MembershipCardContent />
}
