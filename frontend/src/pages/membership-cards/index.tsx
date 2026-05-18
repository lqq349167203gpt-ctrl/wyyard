import { useEffect, useState, useRef } from "react"
import { Plus, Trash2, Edit, Loader2, CreditCard, X } from "lucide-react"
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
import { membershipCardApi, type MembershipCard, type CustomerSearchResult } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const CARD_TYPES: Record<string, { price: number; defaultCount?: number; unlimited?: boolean }> = {
  "体验会员": { price: 398, defaultCount: 4 },
  "常规通卡": { price: 3999 },
  "半年卡": { price: 7999 },
  "年卡": { price: 12800, unlimited: true },
}

const DURATION_OPTIONS = [
  { type: "day", label: "天" },
  { type: "month", label: "月" },
]

const today = new Date().toISOString().split("T")[0]

export function MembershipCardContent({ embedded }: { embedded?: boolean } = {}) {
  const [cards, setCards] = useState<MembershipCard[]>([])
  const [loading, setLoading] = useState(true)
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
  const [formCloserId, setFormCloserId] = useState("")
  const [formCloserName, setFormCloserName] = useState("")

  // 搜索
  const [searchTarget, setSearchTarget] = useState<"user" | "closer" | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(cards)

  const load = () => {
    membershipCardApi.list()
      .then(setCards)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
        setSearchTarget(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSearch = (keyword: string, target: "user" | "closer") => {
    setSearchTarget(target)
    setSearchKeyword(keyword)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setSearchResults([]); setShowDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await membershipCardApi.searchCustomers(keyword)
        setSearchResults(results)
        setShowDropdown(true)
      } catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    if (searchTarget === "closer") {
      setFormCloserId(customer.id)
      setFormCloserName(customer.nickname)
    } else {
      setFormCustomerId(customer.id)
      setFormNickname(customer.nickname)
    }
    setSearchKeyword("")
    setSearchResults([])
    setShowDropdown(false)
    setSearchTarget(null)
  }

  const handleSelectCardType = (type: string) => {
    setFormCardType(type)
    const config = CARD_TYPES[type]
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

  const handleOpenCreate = () => {
    setEditingCard(null)
    setFormCustomerId("")
    setFormNickname("")
    setFormCardType("")
    setFormEffectiveDate(today)
    setFormDurationType("day")
    setFormDurationValue("")
    setFormRemainingCount("")
    setFormUnlimited(false)
    setFormCloserId("")
    setFormCloserName("")
    setSearchKeyword("")
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
    setFormCloserId(item.closer_id || "")
    setFormCloserName(item.closer_name || "")
    setSearchKeyword("")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formCustomerId || !formCardType) return
    setSaving(true)
    try {
      const config = CARD_TYPES[formCardType]
      const data = {
        customer_id: formCustomerId,
        nickname: formNickname,
        card_type: formCardType,
        price: config.price,
        effective_date: formEffectiveDate,
        duration_type: formDurationType,
        duration_value: formDurationValue ? parseInt(formDurationValue) : null,
        remaining_count: (config.unlimited || formUnlimited) ? null : (formRemainingCount ? parseInt(formRemainingCount) : null),
        closer_id: formCloserId || null,
        closer_name: formCloserName || null,
      }
      if (editingCard) {
        await membershipCardApi.update(editingCard.id, data)
      } else {
        await membershipCardApi.create(data)
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
    await membershipCardApi.delete(deleteId)
    setDeleteId(null)
    load()
  }

  const totalAmount = cards.reduce((sum, c) => sum + c.price, 0)

  // 判断表单各区块是否显示
  const showDuration = formCardType && !CARD_TYPES[formCardType]?.unlimited && !CARD_TYPES[formCardType]?.defaultCount
  const showCount = formCardType && !CARD_TYPES[formCardType]?.unlimited

  const content = (
    <>
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          <span>会员活动次数，含沙龙活动（非公益）、觉醒游戏旁观位、情绪释放旁观位。</span>
          {cards.length > 0 && (
            <span>共 {cards.length} 条记录，¥{totalAmount.toLocaleString()}</span>
          )}
        </p>
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <CreditCard className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无会员活动记录</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">录入日期</TableHead>
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
                  <TableCell className="pl-4 text-[#2b2f36]">{item.created_at.split("T")[0]}</TableCell>
                  <TableCell className="text-[#2b2f36] font-medium">{item.nickname}</TableCell>
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
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingCard ? "编辑会员活动" : "新增会员活动"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {/* 用户搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={searchTarget === "user" ? dropdownRef : undefined}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">用户</span>
              <div className="relative">
                <Input
                  value={searchTarget === "user" ? searchKeyword : (formNickname || "")}
                  onChange={(e) => handleSearch(e.target.value, "user")}
                  placeholder="搜索用户..."
                  className="h-8 text-xs pr-16"
                  readOnly={!!editingCard}
                  onFocus={() => {
                    if (!editingCard) {
                      setSearchTarget("user")
                      if (formNickname) { setSearchKeyword(""); setFormNickname(""); setFormCustomerId("") }
                      if (searchResults.length > 0) setShowDropdown(true)
                    }
                  }}
                />
                {!editingCard && formNickname && searchTarget !== "user" && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => { e.preventDefault(); setFormNickname(""); setFormCustomerId("") }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {searching && searchTarget === "user" && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {searchTarget === "user" && showDropdown && searchResults.length > 0 && (
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
                {searchTarget === "user" && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">
                    未找到匹配用户
                  </div>
                )}
              </div>
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

            {/* 时长输入（常规通卡/半年卡） */}
            {showDuration && (
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
            )}

            {/* 次数输入 */}
            {showCount && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">次数</span>
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
            )}

            {/* 年卡提示 */}
            {formCardType === "年卡" && (
              <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">有效期</span>
                <Input value="1 年，次数不限" disabled className="h-8 text-xs" />
              </div>
            )}

            {/* 成交人搜索 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2" ref={searchTarget === "closer" ? dropdownRef : undefined}>
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest pt-2.5">成交人</span>
              <div className="relative">
                <Input
                  value={searchTarget === "closer" ? searchKeyword : (formCloserName || "")}
                  onChange={(e) => handleSearch(e.target.value, "closer")}
                  placeholder="搜索成交人..."
                  className="h-8 text-xs pr-16"
                  onFocus={() => {
                    setSearchTarget("closer")
                    if (formCloserName) { setSearchKeyword(""); setFormCloserId(""); setFormCloserName("") }
                    if (searchResults.length > 0) setShowDropdown(true)
                  }}
                />
                {formCloserName && searchTarget !== "closer" && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => { e.preventDefault(); setFormCloserName(""); setFormCloserId("") }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {searching && searchTarget === "closer" && <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {searchTarget === "closer" && showDropdown && searchResults.length > 0 && (
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
                {searchTarget === "closer" && showDropdown && searchResults.length === 0 && searchKeyword && !searching && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">
                    未找到匹配用户
                  </div>
                )}
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
    </>
  )

  if (embedded) return content
  return <div className="px-6 pt-12 pb-6 space-y-3"><h1 className="text-lg font-semibold">会员活动</h1>{content}</div>
}

export default function MembershipCardsPage() {
  return <MembershipCardContent />
}
