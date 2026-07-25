import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, CreditCard, X, Wallet, Heart, Layers, Zap, GraduationCap, Package, Download, Upload } from "lucide-react"
import ExcelJS from "exceljs"
import { sheetToRows } from "@/lib/excel"
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
import {
  customerApi, membershipCardApi, groupCaseApi, emotionalReleaseApi,
  ohCardReadingApi, energyKnotApi, internalCourseApi, otherProjectApi,
  type Customer, type MembershipCard, type GroupCase, type EmotionalRelease,
  type OhCardReading, type EnergyKnot, type InternalCourse, type OtherProject,
} from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { CloserInput, type Closer } from "@/components/closer-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { useOrganizations } from "@/hooks/use-organizations"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useCustomerPermissions } from "@/hooks/use-customer-permissions"

/* ========== 常量 ========== */

const PROJECT_TYPES = {
  membership_card:   { label: "会员卡", color: "#3370ff", icon: CreditCard, api: membershipCardApi },
  group_case:        { label: "觉醒游戏", color: "#7b61ff", icon: Wallet, api: groupCaseApi },
  emotional_release: { label: "情绪释放", color: "#00b2a9", icon: Heart, api: emotionalReleaseApi },
  oh_card_reading:   { label: "OH卡梳理", color: "#f5a623", icon: Layers, api: ohCardReadingApi },
  energy_knot:       { label: "能量结", color: "#e02020", icon: Zap, api: energyKnotApi },
  internal_course:   { label: "内部课程", color: "#34c724", icon: GraduationCap, api: internalCourseApi },
  other:             { label: "其他项目", color: "#8f959e", icon: Package, api: otherProjectApi },
} as const

type ProjectTypeKey = keyof typeof PROJECT_TYPES

const MEMBERSHIP_CARD_TYPES: Record<string, { price: number; defaultCount?: number; unlimited?: boolean; duration?: string }> = {
  "次卡": { price: 198, defaultCount: 1, duration: "1 个月" },
  "体验会员": { price: 398, defaultCount: 4, duration: "1 个月" },
  "月卡": { price: 1999, unlimited: true, duration: "1 个月" },
  "12次卡": { price: 1800, defaultCount: 12, duration: "1 年" },
  "3月卡": { price: 3999, unlimited: true, duration: "3 个月" },
  "30次卡": { price: 3999, defaultCount: 30, duration: "1 年" },
  "半年卡": { price: 7999, unlimited: true, duration: "6 个月" },
  "年卡": { price: 12800, unlimited: true, duration: "1 年" },
}

const COURSE_TYPES: Record<string, { price: number; duration: string; desc: string }> = {
  "疗愈师课程：自爱力构建": { price: 20000, duration: "1 年", desc: "线上课程 · 48节精品课" },
  "商业框架陪跑：自觉力提升": { price: 36800, duration: "3 个月", desc: "线下深度学习" },
  "落地赋能班：自洽力整合": { price: 58000, duration: "2 年", desc: "线下实战落地" },
}

const DURATION_OPTIONS = [
  { type: "day", label: "天" },
  { type: "month", label: "月" },
]

const today = new Date().toLocaleDateString("sv-SE")

/* ========== 统一数据结构 ========== */

interface UnifiedItem {
  id: string
  customer_id: string
  nickname: string
  type: ProjectTypeKey
  deal_date: string | null
  detail: string
  price: number
  effective_date: string | null
  expiry_date: string | null
  remaining_count: number | null
  closer_id: string | null
  closer_name: string | null
  closers: { id: string; name: string; amount: number }[]
  payment_method?: string
  organization_id: string | null
  // 会员卡专属
  card_type?: string
  total_count?: number | null
  effective_remaining?: number | null
  duration_type?: string | null
  duration_value?: number | null
  created_by?: string
  voided?: boolean
  // 内部课程专属
  course_type?: string
  // 其他项目专属
  category?: string
  project_name?: string
  // 觉醒/情绪/OH/能量专属
  purchase_count?: number
  amount?: number
  // 原始数据（编辑时用）
  _raw?: any
}

function toUnified(item: any, type: ProjectTypeKey): UnifiedItem {
  const base: UnifiedItem = {
    id: item.id,
    customer_id: item.customer_id,
    nickname: item.nickname,
    type,
    deal_date: item.deal_date,
    detail: "",
    price: 0,
    effective_date: null,
    expiry_date: item.expiry_date || null,
    remaining_count: null,
    closer_id: item.closer_id,
    closer_name: item.closer_name,
    closers: item.closers || [],
    payment_method: item.payment_method,
    organization_id: item.organization_id,
    _raw: item,
  }
  switch (type) {
    case "membership_card":
      return { ...base, detail: item.card_type, price: item.price, effective_date: item.effective_date, remaining_count: item.remaining_count, card_type: item.card_type, total_count: item.total_count, effective_remaining: item.effective_remaining, duration_type: item.duration_type, duration_value: item.duration_value, created_by: item.created_by, voided: item.voided }
    case "group_case":
    case "emotional_release":
    case "oh_card_reading":
    case "energy_knot":
      return { ...base, detail: `${item.purchase_count} 次`, price: item.amount, purchase_count: item.purchase_count, amount: item.amount, effective_remaining: item.effective_remaining, created_by: item.created_by }
    case "internal_course":
      return { ...base, detail: item.course_type?.split("：")[0] || "", price: item.price, effective_date: item.effective_date, course_type: item.course_type, created_by: item.created_by }
    case "other":
      return { ...base, detail: item.category || "", price: item.fee, effective_date: item.effective_date, remaining_count: item.remaining_count, total_count: item.total_count, category: item.category, project_name: item.project_name, duration_type: item.duration_type, duration_value: item.duration_value, effective_remaining: item.effective_remaining, created_by: item.created_by }
  }
}

function getApi(type: ProjectTypeKey) {
  return PROJECT_TYPES[type].api as any
}

/* ========== 组件 ========== */

export function UnifiedPaymentContent({ embedded, filterTypes }: { embedded?: boolean; filterTypes?: ProjectTypeKey[] } = {}) {
  const enterToNext = useEnterToNext()
  const navigate = useNavigate()

  // 筛选
  const isMembershipOnly = filterTypes?.length === 1 && filterTypes[0] === "membership_card"
  const [activeType, setActiveType] = useState<ProjectTypeKey | "all">(() => {
    if (filterTypes && filterTypes.length === 1) return filterTypes[0]
    return "all"
  })
  const [mcTypeFilter, setMcTypeFilter] = useState("all")
  const mcTypeFilterRef = useRef("all")
  useEffect(() => { mcTypeFilterRef.current = mcTypeFilter }, [mcTypeFilter])

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<UnifiedItem | null>(null)
  const [formType, setFormType] = useState<ProjectTypeKey>("membership_card")
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnifiedItem | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 通用表单
  const [formCustomerId, setFormCustomerId] = useState("")
  const [formNickname, setFormNickname] = useState("")
  const [formDealDate, setFormDealDate] = useState(today)
  const [formClosers, setFormClosers] = useState<Closer[]>([])
  const [formOrganizationId, setFormOrganizationId] = useState("")
  const [formPaymentMethod, setFormPaymentMethod] = useState("")
  const [closerError, setCloserError] = useState(false)

  // 会员卡表单
  const [formCardType, setFormCardType] = useState("")
  const [formEffectiveDate, setFormEffectiveDate] = useState(today)
  const [formDurationType, setFormDurationType] = useState<string | null>("day")
  const [formDurationValue, setFormDurationValue] = useState("")
  const [formRemainingCount, setFormRemainingCount] = useState("")
  const [formTotalCount, setFormTotalCount] = useState("")
  const [formUnlimited, setFormUnlimited] = useState(false)
  const [formPrice, setFormPrice] = useState("")

  // 觉醒/情绪/OH/能量表单
  const [formPurchaseCount, setFormPurchaseCount] = useState("")
  const [formAmount, setFormAmount] = useState("")

  // 内部课程表单
  const [formCourseType, setFormCourseType] = useState("")
  const [formCourseAmount, setFormCourseAmount] = useState<number>(0)

  // 其他项目表单
  const [formCategory, setFormCategory] = useState("")
  const [formProjectName, setFormProjectName] = useState("")
  const [formFee, setFormFee] = useState("")
  const [formOtherEffectiveDate, setFormOtherEffectiveDate] = useState(today)
  const [formOtherDurationType, setFormOtherDurationType] = useState<string | null>("day")
  const [formOtherDurationValue, setFormOtherDurationValue] = useState("")
  const [formOtherRemainingCount, setFormOtherRemainingCount] = useState("")
  const [formOtherUnlimited, setFormOtherUnlimited] = useState(false)

  // 导入
  const [importResult, setImportResult] = useState<{ success: number; failed: number; errors: string[] } | null>(null)
  const [pendingImport, setPendingImport] = useState<{ rows: { sheetName: string; type: ProjectTypeKey; payload: any }[]; duplicates: { sheetName: string; type: ProjectTypeKey; payload: any }[] } | null>(null)
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 搜索
  const [searchNickname, setSearchNickname] = useState("")
  const [searchCloserName, setSearchCloserName] = useState("")
  const appliedNicknameRef = useRef("")
  const appliedCloserNameRef = useRef("")

  // 权限 & 客户
  const { permissions: cp, ready: permReady } = useCustomerPermissions("payment")
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customersReady, setCustomersReady] = useState(false)
  const { organizations, hasAnyOrganization } = useOrganizations()
  const [noOrgDialogOpen, setNoOrgDialogOpen] = useState(false)
  const [noAssignmentDialogOpen, setNoAssignmentDialogOpen] = useState(false)

  const cpRef = useRef(cp)
  cpRef.current = cp
  const customersRef = useRef<Customer[]>([])
  const customersReadyRef = useRef(false)
  const isSuperAdminRef = useRef(false)

  // 分页数据获取
  const fetchFn = useCallback(async (page: number, pageSize: number) => {
    if (!customersReadyRef.current) {
      return { items: [] as UnifiedItem[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
    }
    const params: any = {}
    if (!isSuperAdminRef.current) {
      const allowed = customersRef.current
      if (allowed.length === 0) {
        return { items: [] as UnifiedItem[], total: 0, page: 1, page_size: pageSize, total_pages: 0 }
      }
      params.customer_ids = allowed.map(c => c.id).join(",")
    }
    if (appliedNicknameRef.current) params.nickname = appliedNicknameRef.current
    if (appliedCloserNameRef.current) params.closer_name = appliedCloserNameRef.current
    const hasParams = Object.keys(params).length > 0
    const p = hasParams ? params : undefined

    if (activeType !== "all") {
      const pp = { ...p }
      if (activeType === "membership_card" && mcTypeFilterRef.current !== "all") {
        pp.card_type = mcTypeFilterRef.current
      }
      const res = await getApi(activeType).listPaginated(page, pageSize, pp)
      return { ...res, items: res.items.map((i: any) => toUnified(i, activeType)) }
    }

    // "全部" 模式：并发请求所有类型（后端 page_size 上限 100）
    const types = Object.keys(PROJECT_TYPES) as ProjectTypeKey[]
    const results = await Promise.all(types.map(t => getApi(t).listPaginated(1, 100, p).catch(() => ({ items: [], total: 0 }))))
    let allItems: UnifiedItem[] = []
    results.forEach((res, idx) => {
      allItems = allItems.concat(res.items.map((i: any) => toUnified(i, types[idx])))
    })
    allItems.sort((a, b) => (b.deal_date || "").localeCompare(a.deal_date || ""))
    const total = allItems.length
    const start = (page - 1) * pageSize
    return { items: allItems.slice(start, start + pageSize), total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) }
  }, [activeType, mcTypeFilter])

  const { paginatedItems: rawItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex, loading, refresh } = useServerPagination(fetchFn)
  const paginatedItems = rawItems as unknown as UnifiedItem[]

  // 类型切换或会员卡类型筛选变化时回到第 1 页
  useEffect(() => { goToPage(1) }, [activeType, mcTypeFilter, goToPage])

  // 加载客户
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

  // 搜索
  const handleFilterChange = (field: "nickname" | "closer", value: string) => {
    if (field === "nickname") { setSearchNickname(value); appliedNicknameRef.current = value }
    else { setSearchCloserName(value); appliedCloserNameRef.current = value }
    refresh()
  }

  const handleClearSearch = () => {
    setSearchNickname("")
    setSearchCloserName("")
    setMcTypeFilter("all")
    appliedNicknameRef.current = ""
    appliedCloserNameRef.current = ""
    refresh()
  }

  // 会员卡类型选择
  const handleSelectCardType = (type: string) => {
    setFormCardType(type)
    const config = MEMBERSHIP_CARD_TYPES[type]
    setFormPrice(String(config.price))
    if (config.defaultCount) {
      setFormRemainingCount(String(config.defaultCount))
      setFormTotalCount(String(config.defaultCount))
      setFormUnlimited(false)
      let durType = "month"
      let durValue = "12"
      if (config.duration) {
        const m = config.duration.match(/(\d+)\s*(个月|月)/)
        if (m) { durValue = m[1] }
        else {
          const d = config.duration.match(/(\d+)\s*年/)
          if (d) { durValue = String(parseInt(d[1]) * 12) }
        }
      }
      setFormDurationType(durType)
      setFormDurationValue(durValue)
    } else if (config.unlimited) {
      setFormRemainingCount("")
      setFormUnlimited(true)
      let durType = "month"
      let durValue = "12"
      if (config.duration) {
        const m = config.duration.match(/(\d+)\s*(个月|月)/)
        if (m) { durValue = m[1] }
        else {
          const d = config.duration.match(/(\d+)\s*年/)
          if (d) { durValue = String(parseInt(d[1]) * 12) }
        }
      }
      setFormDurationType(durType)
      setFormDurationValue(durValue)
    } else {
      setFormRemainingCount("")
      setFormUnlimited(false)
      let durType = "month"
      let durValue = "12"
      if (config.duration) {
        const m = config.duration.match(/(\d+)\s*(个月|月)/)
        if (m) { durValue = m[1] }
        else {
          const d = config.duration.match(/(\d+)\s*年/)
          if (d) { durValue = String(parseInt(d[1]) * 12) }
        }
      }
      setFormDurationType(durType)
      setFormDurationValue(durValue)
    }
  }

  // 打开新增弹窗
  const handleOpenCreate = () => {
    if (!hasAnyOrganization) { setNoOrgDialogOpen(true); return }
    if (organizations.length === 0) { setNoAssignmentDialogOpen(true); return }
    setEditingItem(null)
    setFormType(activeType === "all" ? (filterTypes ? filterTypes[0] : "membership_card") : activeType)
    resetForm()
    setDialogOpen(true)
  }

  // 弹窗标题
  const dialogTitle = useMemo(() => {
    const typeName = PROJECT_TYPES[formType]?.label || ""
    if (editingItem) return `编辑 - ${typeName}`
    return `新增 - ${typeName}`
  }, [formType, editingItem])

  const resetTypeFields = () => {
    // 会员卡
    setFormCardType("")
    setFormEffectiveDate(today)
    setFormDurationType("day")
    setFormDurationValue("")
    setFormRemainingCount("")
    setFormTotalCount("")
    setFormUnlimited(false)
    setFormPrice("")
    // 觉醒等
    setFormPurchaseCount("")
    setFormAmount("")
    // 内部课程
    setFormCourseType("")
    setFormCourseAmount(0)
    // 其他项目
    setFormCategory("")
    setFormProjectName("")
    setFormFee("")
    setFormOtherEffectiveDate(today)
    setFormOtherDurationType("day")
    setFormOtherDurationValue("")
    setFormOtherRemainingCount("")
    setFormOtherUnlimited(false)
  }

  const resetForm = () => {
    setFormCustomerId("")
    setFormNickname("")
    setFormDealDate(today)
    setFormClosers([])
    setFormOrganizationId(organizations.length > 0 ? organizations[0].id : "")
    setFormPaymentMethod("")
    setCloserError(false)
    // 会员卡
    setFormCardType("")
    setFormEffectiveDate(today)
    setFormDurationType("day")
    setFormDurationValue("")
    setFormRemainingCount("")
    setFormTotalCount("")
    setFormUnlimited(false)
    setFormPrice("")
    // 觉醒等
    setFormPurchaseCount("")
    setFormAmount("")
    // 内部课程
    setFormCourseType("")
    setFormCourseAmount(0)
    // 其他项目
    setFormCategory("")
    setFormProjectName("")
    setFormFee("")
    setFormOtherEffectiveDate(today)
    setFormOtherDurationType("day")
    setFormOtherDurationValue("")
    setFormOtherRemainingCount("")
    setFormOtherUnlimited(false)
  }

  // 打开编辑弹窗
  const handleOpenEdit = (item: UnifiedItem) => {
    setEditingItem(item)
    setFormType(item.type)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormDealDate(item.deal_date || "")
    setFormClosers(item.closers?.length ? item.closers : (item.closer_id ? [{ id: item.closer_id, name: item.closer_name || "", amount: 0 }] : []))
    setFormOrganizationId(item.organization_id || "")
    setFormPaymentMethod(item.payment_method || "")
    setCloserError(false)

    switch (item.type) {
      case "membership_card":
        setFormCardType(item.card_type || "")
        setFormEffectiveDate(item.effective_date || "")
        setFormDurationType(item.duration_type || "day")
        setFormDurationValue(item.duration_value ? String(item.duration_value) : "")
        setFormRemainingCount(item.remaining_count !== null && item.remaining_count !== undefined ? String(item.remaining_count) : "")
        setFormTotalCount(item.total_count !== null && item.total_count !== undefined ? String(item.total_count) : "")
        setFormUnlimited(item.remaining_count === null || item.remaining_count === undefined)
        setFormPrice(String(item.price))
        break
      case "group_case":
      case "emotional_release":
      case "oh_card_reading":
      case "energy_knot":
        setFormPurchaseCount(String(item.purchase_count || 0))
        setFormAmount(String(item.amount || 0))
        break
      case "internal_course":
        setFormCourseType(item.course_type || "")
        setFormCourseAmount(item.price)
        setFormEffectiveDate(item.effective_date || "")
        break
      case "other":
        setFormCategory(item.category || "")
        setFormProjectName(item.project_name || "")
        setFormFee(String(item.price))
        setFormOtherEffectiveDate(item.effective_date || "")
        setFormOtherDurationType(item.duration_type || "day")
        setFormOtherDurationValue(item.duration_value ? String(item.duration_value) : "")
        setFormOtherRemainingCount(item.total_count !== null && item.total_count !== undefined ? String(item.total_count) : (item.remaining_count !== null && item.remaining_count !== undefined ? String(item.remaining_count) : ""))
        setFormOtherUnlimited(item.total_count === null && item.remaining_count === null)
        break
    }
    setDialogOpen(true)
  }

  // 获取当前表单的费用金额
  const getFormAmount = (): number => {
    switch (formType) {
      case "membership_card": return parseFloat(formPrice) || 0
      case "group_case":
      case "emotional_release":
      case "oh_card_reading":
      case "energy_knot": return parseFloat(formAmount) || 0
      case "internal_course": return formCourseAmount || 0
      case "other": return parseFloat(formFee) || 0
    }
  }

  // 保存
  const handleSave = () => {
    if (!formCustomerId) return
    if (!editingItem && formClosers.length === 0) { setCloserError(true); return }
    setCloserError(false)
    const amt = getFormAmount()
    if (formClosers.length > 0 && formClosers.reduce((sum, c) => sum + c.amount, 0) !== amt) return
    if (formType === "membership_card" && !formCardType) return
    if (formType === "internal_course" && !formCourseType) return
    if (formType === "other" && !formProjectName) return
    setConfirmOpen(true)
  }

  const buildPayload = () => {
    const closer_id = formClosers[0]?.id || null
    const closer_name = formClosers[0]?.name || null
    const closers = formClosers
    const organization_id = formOrganizationId || null
    const deal_date = formDealDate || null
    let createdBy = ""
    try { const u = JSON.parse(localStorage.getItem("currentUser") || "{}"); createdBy = u.owner || u.username || "" } catch {}

    switch (formType) {
      case "membership_card": {
        const config = MEMBERSHIP_CARD_TYPES[formCardType]
        const payload: Record<string, any> = {
          customer_id: formCustomerId, nickname: formNickname, card_type: formCardType,
          price: formPrice ? parseFloat(formPrice) : config.price,
          effective_date: formEffectiveDate, duration_type: formDurationType,
          duration_value: formDurationValue ? parseInt(formDurationValue) : null,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: formPaymentMethod || null,
          created_by: createdBy,
        }
        // 仅新建卡时才允许带 remaining_count；编辑卡时 PATCH 端点拒绝修改次数字段，
        // 因为 remaining_count 是流水派生缓存，不允许直接改写
        if (!editingItem) {
          if (config.unlimited || formUnlimited) {
            payload.remaining_count = null
          } else {
            // 次数留空时套用该卡类默认次数（与 Excel 导入行为一致）
            payload.remaining_count = formRemainingCount ? parseInt(formRemainingCount) : (config.defaultCount ?? null)
          }
        }
        // total_count 是原始购买次数，编辑时允许修正
        if (editingItem && formTotalCount) {
          payload.total_count = parseInt(formTotalCount)
        }
        return payload
      }
      case "group_case":
      case "emotional_release":
      case "oh_card_reading":
      case "energy_knot":
        return {
          customer_id: formCustomerId, nickname: formNickname,
          // purchase_count 允许编辑修正（后端校验非负整数，剩余次数实时派生）；created_by 仅新建时写入
          purchase_count: parseInt(formPurchaseCount) || 0,
          ...(editingItem ? {} : { created_by: createdBy }),
          amount: parseFloat(formAmount) || 0,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: formPaymentMethod || null,
        }
      case "internal_course":
        return {
          customer_id: formCustomerId, nickname: formNickname,
          course_type: formCourseType, price: formCourseAmount,
          effective_date: formEffectiveDate,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: formPaymentMethod || null,
          ...(!editingItem && { created_by: createdBy }),
        }
      case "other": {
        const payload: Record<string, any> = {
          customer_id: formCustomerId, nickname: formNickname,
          category: formCategory || null, project_name: formProjectName, fee: parseFloat(formFee) || 0,
          effective_date: formOtherEffectiveDate,
          duration_type: formOtherDurationType,
          duration_value: formOtherDurationValue ? parseInt(formOtherDurationValue) : null,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: formPaymentMethod || null,
          ...(!editingItem && { created_by: createdBy }),
        }
        payload.total_count = formOtherUnlimited ? null : (formOtherRemainingCount ? parseInt(formOtherRemainingCount) : null)
        return payload
      }
    }
  }

  const handleConfirmSave = async () => {
    setSaving(true)
    try {
      const api = getApi(formType)
      const data = buildPayload()
      if (editingItem) {
        await api.update(editingItem.id, data)
      } else {
        await api.create(data)
      }
      setConfirmOpen(false)
      setDialogOpen(false)
      refresh()
    } catch (error: any) {
      console.error("保存失败:", error)
      alert(error?.message || error?.detail || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await getApi(deleteTarget.type).delete(deleteTarget.id)
      setDeleteTarget(null)
      refresh()
    } catch (e: any) {
      setDeleteError(e?.message || "删除失败")
      setDeleteTarget(null)
    }
  }

  // 每种类型的模板列定义
  const TEMPLATE_COLUMNS: Record<ProjectTypeKey, { header: string; key: string; width: number; example: string }[]> = {
    membership_card: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "会员卡类型", key: "card_type", width: 12, example: "体验会员" },
      { header: "金额", key: "price", width: 10, example: "398" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    group_case: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买次数", key: "purchase_count", width: 10, example: "5" },
      { header: "金额", key: "amount", width: 10, example: "799" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    emotional_release: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买次数", key: "purchase_count", width: 10, example: "3" },
      { header: "金额", key: "amount", width: 10, example: "500" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    oh_card_reading: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买次数", key: "purchase_count", width: 10, example: "3" },
      { header: "金额", key: "amount", width: 10, example: "500" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    energy_knot: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买次数", key: "purchase_count", width: 10, example: "3" },
      { header: "金额", key: "amount", width: 10, example: "500" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    internal_course: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "课程类型", key: "course_type", width: 24, example: "疗愈师课程：自爱力构建" },
      { header: "金额", key: "price", width: 10, example: "20000" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
    ],
    other: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "项目名称", key: "project_name", width: 18, example: "定制服务" },
      { header: "金额", key: "fee", width: 10, example: "1000" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "有效期单位", key: "duration_type", width: 10, example: "月" },
      { header: "有效期时长", key: "duration_value", width: 10, example: "6" },
      { header: "次数（不填则无限次数）", key: "remaining_count", width: 16, example: "" },
      { header: "成交人昵称（多个成交人请去页面内录入）", key: "closer_name", width: 22, example: "李四" },
      { header: "所属组织", key: "organization", width: 12, example: "" },
    ],
  }

  // 下载导入模板（全部类型，每个类型一个 sheet）
  const handleDownloadTemplate = async () => {
    const wb = new ExcelJS.Workbook()

    const typesToExport = filterTypes || (Object.keys(PROJECT_TYPES) as ProjectTypeKey[])
    for (const type of typesToExport) {
      const cols = TEMPLATE_COLUMNS[type]
      const ws = wb.addWorksheet(PROJECT_TYPES[type].label)

      // 表头
      ws.addRow(cols.map(c => c.header))
      // 示例数据
      ws.addRow(cols.map(c => c.example))

      // 列宽
      cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })

      // 表头样式
      ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true }
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F1F2" } }
      })

      // 会员卡类型下拉
      if (type === "membership_card") {
        const cardTypeCol = cols.findIndex(c => c.key === "card_type") + 1
        if (cardTypeCol > 0) {
          const cardTypes = Object.keys(MEMBERSHIP_CARD_TYPES)
          for (let r = 2; r <= 500; r++) {
            ws.getCell(r, cardTypeCol).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`"${cardTypes.join(",")}"`],
            }
          }
        }
      }

      // 课程类型下拉
      if (type === "internal_course") {
        const courseTypeCol = cols.findIndex(c => c.key === "course_type") + 1
        if (courseTypeCol > 0) {
          const courseTypes = Object.keys(COURSE_TYPES)
          for (let r = 2; r <= 500; r++) {
            ws.getCell(r, courseTypeCol).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`"${courseTypes.join(",")}"`],
            }
          }
        }
      }

      // 所属组织下拉（仅其他项目）
      if (type === "other" && organizations.length > 0) {
        const orgCol = cols.findIndex(c => c.key === "organization") + 1
        if (orgCol > 0) {
          const orgNames = organizations.map(o => o.name)
          for (let r = 2; r <= 500; r++) {
            ws.getCell(r, orgCol).dataValidation = {
              type: "list",
              allowBlank: true,
              formulae: [`"${orgNames.join(",")}"`],
            }
          }
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "付费项目导入模板.xlsx"
    a.click()
    URL.revokeObjectURL(url)
  }

  // 校验单行数据
  const validateRow = (type: ProjectTypeKey, get: (col: string) => string, customerMap: Map<string, Customer>, orgMap: Map<string, any>) => {
    const errors: string[] = []
    const dealDate = get("成交日期")
    const nickname = get("用户昵称")
    const amountStr = get("金额")
    const closerNickname = get("成交人昵称（多个成交人请去页面内录入）") || get("成交人昵称")
    const orgName = get("所属组织")

    if (!dealDate) errors.push("成交日期为空")
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(dealDate)) errors.push("日期格式错误（需YYYY-MM-DD）")
    if (!nickname) errors.push("用户昵称为空")
    const customer = customerMap.get(nickname)
    if (nickname && !customer) errors.push(`用户"${nickname}"不存在`)
    const amount = parseFloat(amountStr)
    if (!amountStr) errors.push("金额为空")
    else if (isNaN(amount) || amount < 0) errors.push("金额格式错误")

    if (type === "membership_card") {
      const cardType = get("会员卡类型")
      if (!cardType) errors.push("会员卡类型为空")
      else if (!MEMBERSHIP_CARD_TYPES[cardType]) errors.push(`会员卡类型"${cardType}"无效`)
    }
    if (type === "internal_course") {
      const courseType = get("课程类型")
      if (!courseType) errors.push("课程类型为空")
      else if (!COURSE_TYPES[courseType]) errors.push(`课程类型"${courseType}"无效`)
    }
    if (type === "other" && !get("项目名称")) errors.push("项目名称为空")
    if (!closerNickname) errors.push("成交人为空")

    let closerId: string | null = null
    let closerName: string | null = null
    if (closerNickname) {
      const closer = customerMap.get(closerNickname)
      if (!closer) errors.push(`成交人"${closerNickname}"不存在`)
      else { closerId = closer.id; closerName = closer.nickname }
    }

    let orgId: string | null = null
    if (orgName) {
      const org = orgMap.get(orgName)
      if (!org) errors.push(`组织"${orgName}"不存在`)
      else orgId = org.id
    } else if (type !== "other") {
      // 非其他项目默认无忧茶苑
      const defaultOrg = orgMap.get("无忧茶苑")
      if (defaultOrg) orgId = defaultOrg.id
    }

    if (errors.length > 0) return { errors }

    const base = {
      customer_id: customer!.id, nickname: customer!.nickname,
      closer_id: closerId, closer_name: closerName, closers: closerId ? [{ id: closerId, name: closerName!, amount }] : [],
      organization_id: orgId, deal_date: dealDate,
    }
    const durUnit = get("有效期单位")
    const durValue = get("有效期时长")
    const durationType = durUnit === "月" ? "month" : durUnit === "天" ? "day" : null
    const durationValue = durValue ? parseInt(durValue) || null : null

    let payload: any
    let dupKey: string
    switch (type) {
      case "membership_card": {
        const cardType = get("会员卡类型")
        const mcConfig = MEMBERSHIP_CARD_TYPES[cardType]
        let mcDurType: string | null = null
        let mcDurValue: number | null = null
        if (mcConfig?.duration) {
          const m = mcConfig.duration.match(/(\d+)\s*(个月|月)/)
          if (m) { mcDurType = "month"; mcDurValue = parseInt(m[1]) }
          else {
            const d = mcConfig.duration.match(/(\d+)\s*年/)
            if (d) { mcDurType = "month"; mcDurValue = parseInt(d[1]) * 12 }
          }
        }
        payload = { ...base, card_type: cardType, price: amount, effective_date: get("生效日期") || today, duration_type: mcDurType, duration_value: mcDurValue, remaining_count: mcConfig?.unlimited ? null : (mcConfig?.defaultCount || null) }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${cardType}|${amount}`
        break
      }
      case "group_case":
        payload = { ...base, purchase_count: parseInt(get("购买次数")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "emotional_release":
        payload = { ...base, purchase_count: parseInt(get("购买次数")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "oh_card_reading":
        payload = { ...base, purchase_count: parseInt(get("购买次数")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "energy_knot":
        payload = { ...base, purchase_count: parseInt(get("购买次数")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "internal_course": {
        const courseType = get("课程类型")
        payload = { ...base, course_type: courseType, price: amount, effective_date: get("生效日期") || today }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${courseType}|${amount}`
        break
      }
      case "other": {
        const pn = get("项目名称")
        const rcStr = get("次数（不填则无限次数）")
        const rc = rcStr ? parseInt(rcStr) || null : null
        payload = { ...base, category: null, project_name: pn, fee: amount, effective_date: get("生效日期") || today, duration_type: durationType, duration_value: durationValue, remaining_count: rc }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${pn}|${amount}`
        break
      }
    }
    return { payload, dupKey }
  }

  // 构建已有数据的去重 key 集合
  const buildExistingKeys = async (): Promise<Set<string>> => {
    const keys = new Set<string>()
    const types = Object.keys(PROJECT_TYPES) as ProjectTypeKey[]
    for (const type of types) {
      try {
        const res = await getApi(type).listPaginated(1, 100)
        for (const item of res.items) {
          let key: string
          switch (type) {
            case "membership_card":
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.card_type || ""}|${item.price || 0}`
              break
            case "internal_course":
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.course_type || ""}|${item.price || 0}`
              break
            case "other":
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.project_name || ""}|${item.fee || 0}`
              break
            default:
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.amount || 0}`
              break
          }
          keys.add(key)
        }
      } catch { /* ignore */ }
    }
    return keys
  }

  // 执行导入
  const executeImport = async (rows: { sheetName: string; type: ProjectTypeKey; payload: any }[]) => {
    let success = 0
    let failed = 0
    const errors: string[] = []
    for (const { sheetName, type, payload } of rows) {
      try {
        await getApi(type).create(payload)
        success++
      } catch (err: any) {
        failed++
        errors.push(`[${sheetName}] ${payload.nickname} ${payload.deal_date}：保存失败 - ${err.message || "未知错误"}`)
      }
    }
    setImportResult({ success, failed, errors })
    if (success > 0) refresh()
  }

  // 导入 Excel（校验 → 查重 → 导入）
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ""

    const SHEET_TYPE_MAP: Record<string, ProjectTypeKey> = {}
    for (const key of Object.keys(PROJECT_TYPES) as ProjectTypeKey[]) {
      SHEET_TYPE_MAP[PROJECT_TYPES[key].label] = key
    }

    const customerMap = new Map(customers.map(c => [c.nickname, c]))
    const orgMap = new Map(organizations.map(o => [o.name, o]))

    try {
      const data = await file.arrayBuffer()
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(data)

      // 第一轮：校验所有行
      const validRows: { sheetName: string; type: ProjectTypeKey; payload: any; dupKey: string }[] = []
      const allErrors: string[] = []

      for (const ws of wb.worksheets) {
        const sheetName = ws.name
        const type = SHEET_TYPE_MAP[sheetName]
        if (!type) continue

        // 等价于原 XLSX.utils.sheet_to_json(ws, { header: 1 })
        const rows = sheetToRows(ws)
        if (rows.length < 2) continue

        const headers = rows[0] as string[]
        const dataRows = rows.slice(1).filter(r => r.some(cell => cell))

        for (let i = 0; i < dataRows.length; i++) {
          const row = dataRows[i]
          const rowNum = i + 2
          const get = (col: string) => {
            const idx = headers.indexOf(col)
            return idx >= 0 ? String(row[idx] ?? "").trim() : ""
          }
          const result = validateRow(type, get, customerMap, orgMap)
          if (result.errors) {
            allErrors.push(`[${sheetName}] 第${rowNum}行：${result.errors.join("；")}`)
          } else {
            validRows.push({ sheetName, type, payload: result.payload, dupKey: result.dupKey })
          }
        }
      }

      if (allErrors.length > 0 && validRows.length === 0) {
        setImportResult({ success: 0, failed: allErrors.length, errors: allErrors })
        return
      }

      // 第二轮：查重
      const existingKeys = await buildExistingKeys()
      const normalRows = validRows.filter(r => !existingKeys.has(r.dupKey))
      const duplicateRows = validRows.filter(r => existingKeys.has(r.dupKey))

      if (duplicateRows.length > 0) {
        // 有重复，弹窗询问
        setPendingImport({ rows: normalRows, duplicates: duplicateRows })
        setDuplicateDialogOpen(true)
        if (allErrors.length > 0) {
          // 先显示校验错误
          setImportResult({ success: 0, failed: allErrors.length, errors: allErrors })
        }
      } else {
        // 无重复，直接导入
        if (normalRows.length === 0) {
          setImportResult({ success: 0, failed: allErrors.length, errors: allErrors.length > 0 ? allErrors : ["无有效数据"] })
          return
        }
        await executeImport(normalRows)
      }
    } catch (err: any) {
      setImportResult({ success: 0, failed: 0, errors: [`文件解析失败：${err.message}`] })
    }
  }

  // 确认导入（含重复）
  const handleConfirmImportAll = async () => {
    if (!pendingImport) return
    setDuplicateDialogOpen(false)
    const allRows = [...pendingImport.rows, ...pendingImport.duplicates]
    setPendingImport(null)
    await executeImport(allRows)
  }

  // 跳过重复，只导正常数据
  const handleSkipDuplicates = async () => {
    if (!pendingImport) return
    setDuplicateDialogOpen(false)
    const rows = pendingImport.rows
    setPendingImport(null)
    if (rows.length > 0) {
      await executeImport(rows)
    } else {
      setImportResult({ success: 0, failed: 0, errors: ["已跳过所有重复数据"] })
    }
  }

  // 会员卡表单字段判断
  const mcShowDuration = formCardType && !MEMBERSHIP_CARD_TYPES[formCardType]?.unlimited && !MEMBERSHIP_CARD_TYPES[formCardType]?.defaultCount && !MEMBERSHIP_CARD_TYPES[formCardType]?.duration
  const mcShowCount = formCardType && !MEMBERSHIP_CARD_TYPES[formCardType]?.unlimited && !MEMBERSHIP_CARD_TYPES[formCardType]?.duration
  const mcShowDurationInfo = formCardType && MEMBERSHIP_CARD_TYPES[formCardType]?.duration

  // 确认弹窗内容
  const confirmContent = useMemo(() => {
    const rows: { label: string; value: string }[] = []
    rows.push({ label: "成交日期", value: formDealDate || "-" })
    rows.push({ label: "用户", value: formNickname || "-" })
    if (formType === "membership_card") {
      rows.push({ label: "生效日期", value: formEffectiveDate || "-" })
      rows.push({ label: "会员卡", value: formCardType || "-" })
      rows.push({ label: "费用金额", value: `¥${parseFloat(formPrice || "0").toLocaleString()}` })
      if (mcShowDurationInfo) rows.push({ label: "有效期", value: `${formDurationValue || MEMBERSHIP_CARD_TYPES[formCardType]?.duration} 个月，${MEMBERSHIP_CARD_TYPES[formCardType]?.unlimited ? "次数不限" : `${formTotalCount || MEMBERSHIP_CARD_TYPES[formCardType]?.defaultCount} 次`}` })
    } else if (formType === "internal_course") {
      rows.push({ label: "生效日期", value: formEffectiveDate || "-" })
      rows.push({ label: "课程类型", value: formCourseType || "-" })
      rows.push({ label: "付费金额", value: `¥${(formCourseAmount || 0).toLocaleString()}` })
    } else if (formType === "other") {
      rows.push({ label: "项目名称", value: [formCategory, formProjectName].filter(Boolean).join(" / ") || "-" })
      rows.push({ label: "费用", value: `¥${parseFloat(formFee || "0").toLocaleString()}` })
      rows.push({ label: "生效日期", value: formOtherEffectiveDate || "-" })
      if (formOtherDurationValue || formOtherRemainingCount || formOtherUnlimited) {
        let v = ""
        if (formOtherDurationValue) v += `${formOtherDurationValue} ${formOtherDurationType === "month" ? "个月" : "天"}`
        if (formOtherDurationValue && (formOtherRemainingCount || formOtherUnlimited)) v += "，"
        v += formOtherUnlimited ? "次数不限" : formOtherRemainingCount ? `${formOtherRemainingCount} 次` : ""
        rows.push({ label: "有效期", value: v })
      }
    } else {
      rows.push({ label: "购买次数", value: `${formPurchaseCount || "0"} 次` })
      rows.push({ label: "付费金额", value: `¥${parseFloat(formAmount || "0").toLocaleString()}` })
    }
    rows.push({ label: "所属组织", value: organizations.find(o => o.id === formOrganizationId)?.name || "-" })
    rows.push({ label: "成交人", value: formClosers.length > 0 ? formClosers.map(c => `${c.name} ¥${c.amount.toLocaleString()}`).join("、") : "-" })
    return rows
  }, [formType, formDealDate, formNickname, formEffectiveDate, formCardType, formPrice, formPurchaseCount, formAmount, formCourseType, formCourseAmount, formProjectName, formFee, formOtherEffectiveDate, formOtherDurationType, formOtherDurationValue, formOtherRemainingCount, formOtherUnlimited, formOrganizationId, formClosers, organizations, mcShowDurationInfo, formTotalCount, formDurationValue, formDurationType, formUnlimited])

  return (
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
        <div className="w-36">
          {isMembershipOnly ? (
            <SelectDropdown
              value={mcTypeFilter}
              options={[
                { value: "all", label: "全部卡类型" },
                ...Object.keys(MEMBERSHIP_CARD_TYPES).map(t => ({ value: t, label: t })),
              ]}
              onChange={setMcTypeFilter}
            />
          ) : (
            <SelectDropdown
              value={activeType}
              options={filterTypes
                ? filterTypes.map(key => ({ value: key, label: PROJECT_TYPES[key].label }))
                : [
                    { value: "all", label: "全部类型" },
                    ...(Object.keys(PROJECT_TYPES) as ProjectTypeKey[]).map(key => ({
                      value: key,
                      label: PROJECT_TYPES[key].label,
                    })),
                  ]}
              onChange={(v) => setActiveType(v as ProjectTypeKey | "all")}
            />
          )}
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
        <button onClick={handleDownloadTemplate} className="h-8 px-3 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1">
          <Download className="h-3.5 w-3.5" /> 下载模板
        </button>
        {/* 导入功能暂时隐藏
        <button onClick={() => fileInputRef.current?.click()} className="h-8 px-3 rounded-md border border-[#e0e0e0] text-[12px] text-[#4e535a] hover:bg-[#f5f6f7] flex items-center gap-1">
          <Upload className="h-3.5 w-3.5" /> 导入
        </button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
        */}
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增
        </Button>
      </div>

      {/* 统计 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground mt-[6px]">
          {totalItems > 0 && <span>共 {totalItems} 条记录</span>}
        </p>
      </div>

      {/* 表格 */}
      <div className="bg-white rounded-lg">
        {loading || !customersReady ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无记录</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">成交日期</TableHead>
                  <TableHead>用户</TableHead>
                  {(activeType === "all" || activeType === "membership_card" || activeType === "internal_course" || activeType === "other") && <TableHead>项目名称</TableHead>}
                  <TableHead>金额</TableHead>
                  <TableHead>购买次数</TableHead>
                  <TableHead>生效日期</TableHead>
                  <TableHead>到期日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>剩余次数</TableHead>
                  <TableHead>成交人</TableHead>
                  <TableHead>支付方式</TableHead>
                  <TableHead>创建人</TableHead>
                  <TableHead className="text-right pr-4">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`} className="group hover:bg-[#f7f8fa]">
                    <TableCell className="pl-4 text-[#2b2f36]">{item.deal_date || "-"}</TableCell>
                    <TableCell className="text-[#2b2f36]">{item.nickname}</TableCell>
                    {(activeType === "all" || activeType === "membership_card" || activeType === "internal_course" || activeType === "other") && (
                      <TableCell className="text-[#2b2f36]">
                        {item.type === "other"
                          ? [item.category, item.project_name].filter(Boolean).join(" / ") || "-"
                          : (item.detail || "-")}
                      </TableCell>
                    )}
                    <TableCell className="text-[#2b2f36]">¥{item.price.toLocaleString()}</TableCell>
                    <TableCell className="text-[#2b2f36]">
                      {(item.type === "group_case" || item.type === "emotional_release" || item.type === "oh_card_reading" || item.type === "energy_knot") && (
                        item.purchase_count ? `${item.purchase_count} 次` : "-"
                      )}
                      {item.type === "membership_card" && (() => {
                        if (item.remaining_count === null || item.total_count == null) return "不限"
                        return `${item.total_count} 次`
                      })()}
                      {item.type === "other" && (
                        (item.total_count === null || item.total_count === undefined) && item.remaining_count === null ? "不限" : `${(item.total_count ?? item.remaining_count) ?? 0} 次`
                      )}
                    </TableCell>
                    <TableCell className="text-[#2b2f36]">{item.effective_date || "-"}</TableCell>
                    <TableCell className="text-[#2b2f36]">{item.expiry_date || "-"}</TableCell>
                    <TableCell className="text-[12px]">
                      {(() => {
                        const today = new Date().toISOString().slice(0,10)
                        if (item.type === "membership_card" && item.voided) return <span className="text-[#c4506a]">已退费</span>
                        if (item.effective_date && item.effective_date > today) return <span className="text-[#8f959e]">未开始</span>
                        if (item.expiry_date && item.expiry_date < today) return <span className="text-[#c4506a]">已过期</span>
                        if (item.effective_date || item.expiry_date) return <span className="text-[#3370ff]">生效中</span>
                        return <span className="text-[#8f959e]">-</span>
                      })()}
                    </TableCell>
                    <TableCell className="text-[#2b2f36]">
                      {item.type === "membership_card" ? (
                        item.voided
                          ? <span className="text-[#c4506a]">已退费</span>
                          : item.effective_remaining === null || item.effective_remaining === undefined
                            ? "不限"
                            : `${item.effective_remaining} 次`
                      ) : item.type === "other" ? (
                        item.remaining_count === null ? "不限" : `${item.remaining_count} 次`
                      ) : (
                        item.effective_remaining !== null && item.effective_remaining !== undefined
                          ? `${item.effective_remaining} 次`
                          : "-"
                      )}
                    </TableCell>
                    <TableCell className="text-[#2b2f36]">
                      {item.closers?.length
                        ? item.closers.map(c => `${c.name} ¥${c.amount.toLocaleString()}`).join("、")
                        : (item.closer_name || "-")}
                    </TableCell>
                    <TableCell className="text-[#2b2f36]">{item.payment_method || "-"}</TableCell>
                    <TableCell className="text-[#8f959e]">{item.created_by || "-"}</TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(item)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              startIndex={startIndex}
              endIndex={endIndex}
              onPageChange={goToPage}
            />
          </>
        )}
      </div>

      {/* ========== 新增/编辑弹窗 ========== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4 max-h-[calc(65vh+120px)] overflow-y-auto" {...enterToNext}>
            {/* 成交日期 + 所属组织（顶部） */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">成交日期</span>
              <Input type="date" value={formDealDate} onChange={(e) => setFormDealDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">所属组织</span>
              <SelectDropdown
                value={formOrganizationId}
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                placeholder="选择组织"
                onChange={setFormOrganizationId}
              />
            </div>
            <div className="border-b border-[#ebedf0] ml-[19px] -mt-[2px]" style={{ borderBottomWidth: "0.5px" }} />

            {/* 项目类型选择（新增时，单一类型时不显示） */}
            {!editingItem && !(filterTypes && filterTypes.length === 1) && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2 -mt-[2px]">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">项目类型</span>
                <SelectDropdown
                  value={formType}
                  options={(filterTypes || (Object.keys(PROJECT_TYPES) as ProjectTypeKey[])).map(key => ({
                    value: key,
                    label: PROJECT_TYPES[key].label,
                  }))}
                  placeholder="请选择项目类型"
                  onChange={(v) => { setFormType(v as ProjectTypeKey); resetTypeFields() }}
                />
              </div>
            )}

            {/* 会员卡类型 */}
            {formType === "membership_card" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">会员卡</span>
                <SelectDropdown
                  value={formCardType}
                  options={Object.entries(MEMBERSHIP_CARD_TYPES).map(([type, config]) => ({ value: type, label: type, rightLabel: `¥${config.price.toLocaleString()}` }))}
                  placeholder="请选择会员卡"
                  onChange={(v) => handleSelectCardType(v)}
                />
              </div>
            )}

            {/* 课程类型（内部课程） */}
            {formType === "internal_course" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程类型</span>
                <SelectDropdown
                  value={formCourseType}
                  options={Object.entries(COURSE_TYPES).map(([type, config]) => ({
                    value: type,
                    label: `${type.split("：")[0]}（${config.duration}）`,
                    rightLabel: `¥${config.price.toLocaleString()}`,
                  }))}
                  placeholder="请选择课程"
                  onChange={(v) => { setFormCourseType(v); setFormCourseAmount(COURSE_TYPES[v]?.price || 0) }}
                />
              </div>
            )}

            {/* 用户（其他项目时显示在项目名称后面） */}
            {formType !== "other" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
                <CustomerSearchInput
                  customers={customers}
                  value={formNickname || ""}
                  onChange={(v) => {
                    const name = typeof v === "string" ? v : v[0] || ""
                    if (!name) { setFormNickname(""); setFormCustomerId("") }
                  }}
                  onSelectItem={(c) => { setFormNickname(c.nickname); setFormCustomerId(c.id) }}
                  disabled={!!editingItem}
                  showClear={!editingItem}
                  placeholder="搜索昵称"
                />
              </div>
            )}

            {/* ===== 会员卡专属字段 ===== */}
            {formType === "membership_card" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                {mcShowDuration && (
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                    <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">时长</span>
                    <div>
                      <div className="flex gap-2">
                        <Input type="number" value={formDurationValue} onChange={(e) => setFormDurationValue(e.target.value)} placeholder="输入时长" className="h-8 text-xs flex-1" min="1" />
                        <div className="flex gap-1">
                          {DURATION_OPTIONS.map((opt) => (
                            <button key={opt.type} className={`px-3 h-8 rounded border text-[12px] transition-colors ${formDurationType === opt.type ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"}`} onClick={() => setFormDurationType(opt.type)}>{opt.label}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {mcShowCount && (
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                    <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">次数</span>
                    <div>
                      <div className="flex gap-2">
                        {!formUnlimited && (
                          <Input type="number" value={editingItem ? formTotalCount : formRemainingCount} onChange={(e) => editingItem ? setFormTotalCount(e.target.value) : setFormRemainingCount(e.target.value)} placeholder={editingItem ? "" : (MEMBERSHIP_CARD_TYPES[formCardType]?.defaultCount ? `${MEMBERSHIP_CARD_TYPES[formCardType].defaultCount}` : "输入次数")} className="h-8 text-xs flex-1" min="0" />
                        )}
                        {!MEMBERSHIP_CARD_TYPES[formCardType]?.defaultCount && (
                          <button className={`px-3 h-8 rounded border text-[12px] whitespace-nowrap transition-colors ${formUnlimited ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"}`} onClick={() => { setFormUnlimited(!formUnlimited); if (!formUnlimited) { setFormRemainingCount(""); setFormTotalCount("") } }}>不限</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {mcShowDurationInfo && (
                  <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                    <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">有效期</span>
                    <div className="flex gap-2 items-center">
                      <Input type="number" value={formDurationValue} onChange={(e) => { setFormDurationValue(e.target.value); setFormDurationType("month") }} className="h-8 text-xs w-[50px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min="1" />
                      <span className="text-[12px] text-[#8f959e]">个月，</span>
                      {!MEMBERSHIP_CARD_TYPES[formCardType]?.unlimited ? (
                        <>
                          <Input type="number" value={editingItem ? formTotalCount : formRemainingCount} onChange={(e) => editingItem ? setFormTotalCount(e.target.value) : setFormRemainingCount(e.target.value)} placeholder={editingItem ? "" : (MEMBERSHIP_CARD_TYPES[formCardType]?.defaultCount ? `${MEMBERSHIP_CARD_TYPES[formCardType].defaultCount}` : "")} className="h-8 text-xs w-[50px] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" min="0" />
                          <span className="text-[12px] text-[#8f959e]">次</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-[#8f959e]">次数不限</span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* 会员卡费用金额（统一放在时长/次数之后） */}
            {formType === "membership_card" && formCardType && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">费用金额</span>
                <Input type="text" inputMode="decimal" value={formPrice} onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={MEMBERSHIP_CARD_TYPES[formCardType] ? `${MEMBERSHIP_CARD_TYPES[formCardType].price}` : ""} className="h-8 text-xs" />
              </div>
            )}
            {(formType === "group_case" || formType === "emotional_release" || formType === "oh_card_reading" || formType === "energy_knot") && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">购买次数</span>
                  <Input type="number" value={formPurchaseCount} onChange={(e) => setFormPurchaseCount(e.target.value)} placeholder="0" min="0" className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="h-8 text-xs" />
                </div>
              </>
            )}

            {/* ===== 内部课程专属字段 ===== */}
            {formType === "internal_course" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formCourseAmount || ""} onChange={(e) => setFormCourseAmount(Number(e.target.value) || 0)} placeholder="输入金额" className="h-8 text-xs" />
                </div>
              </>
            )}

            {/* ===== 其他项目专属字段 ===== */}
            {formType === "other" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">项目名称</span>
                  <Input type="text" value={formProjectName} onChange={(e) => setFormProjectName(e.target.value)} placeholder="输入项目名称" className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">用户</span>
                  <CustomerSearchInput
                    customers={customers}
                    value={formNickname || ""}
                    onChange={(v) => {
                      const name = typeof v === "string" ? v : v[0] || ""
                      if (!name) { setFormNickname(""); setFormCustomerId("") }
                    }}
                    onSelectItem={(c) => { setFormNickname(c.nickname); setFormCustomerId(c.id) }}
                    disabled={!!editingItem}
                    placeholder="搜索昵称"
                  />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">费用</span>
                  <Input type="number" value={formFee} onChange={(e) => setFormFee(e.target.value)} placeholder="0" className="h-8 text-xs" min="0" step="0.01" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formOtherEffectiveDate} onChange={(e) => setFormOtherEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">时长</span>
                  <div className="flex gap-2">
                    <Input type="number" value={formOtherDurationValue} onChange={(e) => setFormOtherDurationValue(e.target.value)} placeholder="输入时长" className="h-8 text-xs flex-1" min="1" />
                    <div className="flex gap-1">
                      {DURATION_OPTIONS.map((opt) => (
                        <button key={opt.type} className={`px-3 h-8 rounded border text-[12px] transition-colors ${formOtherDurationType === opt.type ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"}`} onClick={() => setFormOtherDurationType(opt.type)}>{opt.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">次数</span>
                  <div className="flex gap-2">
                    {!formOtherUnlimited && (
                      <Input type="number" value={formOtherRemainingCount} onChange={(e) => setFormOtherRemainingCount(e.target.value)} placeholder="输入次数（可选）" className="h-8 text-xs flex-1" min="0" />
                    )}
                    <button className={`px-3 h-8 rounded border text-[12px] whitespace-nowrap transition-colors ${formOtherUnlimited ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"}`} onClick={() => { setFormOtherUnlimited(!formOtherUnlimited); if (!formOtherUnlimited) setFormOtherRemainingCount("") }}>不限</button>
                  </div>
                </div>
              </>
            )}

            {/* ===== 公共字段：成交人 ===== */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">成交人</span>
              <div>
                <CloserInput customers={customers} value={formClosers} onChange={(v) => { setFormClosers(v); if (v.length > 0) setCloserError(false) }} defaultAmount={getFormAmount()} />
                {closerError && <span className="text-[11px] text-[#f54a45] mt-0.5 block">请选择成交人</span>}
                {formClosers.length > 0 && formClosers.reduce((sum, c) => sum + c.amount, 0) !== getFormAmount() && (
                  <span className="text-[11px] text-[#f54a45] mt-0.5 block">成交人总金额与付费金额不一致</span>
                )}
              </div>
            </div>

            {/* ===== 公共字段：支付方式 ===== */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">支付方式</span>
              <select
                className="h-7 border border-[#e8eaed] rounded-[2px] px-2 text-[12px] text-[#1f2329] bg-white outline-none focus:border-[#3370ff]"
                value={formPaymentMethod}
                onChange={(e) => setFormPaymentMethod(e.target.value)}
              >
                <option value="">请选择</option>
                <option value="支付宝">支付宝</option>
                <option value="微信">微信</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCustomerId}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 二次确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm p-0 gap-0" showCloseButton={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingItem ? "确认编辑" : "确认新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {confirmContent.map((row, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#8f959e] font-light text-right tracking-widest">{row.label}</span>
                <span className="text-[12px] text-[#2b2f36] pl-2.5">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>修改</Button>
              <Button size="sm" onClick={handleConfirmSave} disabled={saving}>
                {saving ? "保存中..." : "确认"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
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

      <AlertDialog open={!!deleteError} onOpenChange={(open) => !open && setDeleteError(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>无法删除</AlertDialogTitle>
            <AlertDialogDescription>{deleteError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDeleteError(null)}>知道了</AlertDialogAction>
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

      {/* 重复数据确认 */}
      <AlertDialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>发现重复数据</AlertDialogTitle>
            <AlertDialogDescription>
              有 <span className="text-[#f5a623] font-medium">{pendingImport?.duplicates.length}</span> 条记录与系统中已有数据重复（相同用户、类型、日期、金额），
              正常数据 <span className="text-[#34c724] font-medium">{pendingImport?.rows.length}</span> 条。是否仍然导入重复数据？
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingImport && pendingImport.duplicates.length > 0 && (
            <div className="max-h-36 overflow-y-auto text-[12px] text-[#8f959e] space-y-1 px-1">
              {pendingImport.duplicates.slice(0, 10).map((d, i) => (
                <p key={i}>{PROJECT_TYPES[d.type].label} - {d.payload.nickname} - {d.payload.deal_date} - ¥{d.payload.price || d.payload.amount || d.payload.fee}</p>
              ))}
              {pendingImport.duplicates.length > 10 && <p>...共 {pendingImport.duplicates.length} 条</p>}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipDuplicates}>跳过重复</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmImportAll}>全部导入</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 导入结果 */}
      <AlertDialog open={!!importResult} onOpenChange={(open) => !open && setImportResult(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入完成</AlertDialogTitle>
            <AlertDialogDescription>
              成功 <span className="text-[#34c724] font-medium">{importResult?.success}</span> 条，
              失败 <span className="text-[#f54a45] font-medium">{importResult?.failed}</span> 条
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importResult && importResult.errors.length > 0 && (
            <div className="max-h-48 overflow-y-auto text-[12px] text-[#f54a45] space-y-1 px-1">
              {importResult.errors.map((err, i) => (
                <p key={i}>{err}</p>
              ))}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setImportResult(null)}>知道了</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
