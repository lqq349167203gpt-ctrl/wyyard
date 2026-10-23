import { defaultOrganization } from "@/lib/default-organization"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { MEMBERSHIP_CARD_DEFAULTS as MEMBERSHIP_CARD_TYPES, OFFLINE_COURSE_TYPES, OH_READING_TYPES, offlineCourseDefaultMonths } from "@/lib/payment-types"
import { LEARNING_PAYMENT_TYPES as COURSE_TYPES, LEARNING_PAYMENT_OPTIONS } from "@/lib/learning-course-types"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, CreditCard, X, Wallet, Heart, Layers, Zap, GraduationCap, Package, Coffee, BookOpen } from "lucide-react"
import { loadExcel, sheetToRows } from "@/lib/excel"
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
  ohCardReadingApi, teaSeatFeeApi, onlineTeaApi, companionCampApi, offlineCourseApi, energyKnotApi, internalCourseApi, otherProjectApi, projectRefundApi, paymentExportApi,
  type CustomerLight, type MembershipCard, type GroupCase, type EmotionalRelease,
  type OhCardReading, type TeaSeatFee, type OfflineCourse, type EnergyKnot, type InternalCourse, type OtherProject,
} from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { CloserInput, type Closer } from "@/components/closer-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { POSITION_COURSE_TEACHER } from "@/lib/positions"
import { useOrganizations } from "@/hooks/use-organizations"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { useEditPermissions } from "@/hooks/use-edit-permissions"
import { CoarseDoorCardTab } from "@/pages/payment/coarse-door-card-tab"
import { NO_DEAL_COURSE_LABEL, PaymentCourseSelect, UNSET_DEAL_COURSE } from "@/components/payment-course-select"
import { PaymentScopeFilters, UNASSIGNED_COURSE } from "./payment-scope-filters"
import { useReadResource } from "@/hooks/use-read-resource"
import { LoadError } from "@/components/load-error"
import { getPaymentStatus } from "@/lib/payment-status"

/* ========== 常量 ========== */

const PROJECT_TYPES = {
  membership_card:   { label: "会员卡", color: "#3370ff", icon: CreditCard, api: membershipCardApi },
  group_case:        { label: "觉醒游戏", color: "#7b61ff", icon: Wallet, api: groupCaseApi },
  emotional_release: { label: "情绪释放", color: "#00b2a9", icon: Heart, api: emotionalReleaseApi },
  oh_card_reading:   { label: "OH卡诊断", color: "#f5a623", icon: Layers, api: ohCardReadingApi },
  energy_knot:       { label: "深度情绪释放", color: "#e02020", icon: Zap, api: energyKnotApi },
  internal_course:   { label: "沙龙技能学习", color: "#34c724", icon: GraduationCap, api: internalCourseApi },
  tea_seat_fee:      { label: "茶位费", color: "#c8a96e", icon: Coffee, api: teaSeatFeeApi },
  online_tea:        { label: "线上茶疗", color: "#646a73", icon: Coffee, api: onlineTeaApi },
  companion_camp:        { label: "陪伴营", color: "#646a73", icon: Heart, api: companionCampApi },
  offline_course:    { label: "线下落地课程", color: "#e8794a", icon: BookOpen, api: offlineCourseApi },
  other:             { label: "其他项目", color: "#8f959e", icon: Package, api: otherProjectApi },
} as const

type ProjectTypeKey = keyof typeof PROJECT_TYPES

const PROJECT_TYPE_TO_REFUND_KEY: Record<ProjectTypeKey, string> = {
  membership_card: "membership-cards",
  group_case: "group-cases",
  emotional_release: "emotional-releases",
  oh_card_reading: "oh-card-readings",
  energy_knot: "energy-knots",
  tea_seat_fee: "tea-seat-fees",
  online_tea: "online-tea",
  companion_camp: "companion-camps",
  offline_course: "offline-courses",
  internal_course: "internal-courses",
  other: "other-projects",
}

const DURATION_OPTIONS = [
  { type: "day", label: "天" },
  { type: "month", label: "月" },
]

const today = new Date().toLocaleDateString("sv-SE")

// 与后端按自然月计算的有效期保持一致，避免月末日期被 setMonth 推到下个月。
function learningCourseExpiry(effectiveDate: string, months: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) return null
  const [year, month, day] = effectiveDate.split("-").map(Number)
  const lastDay = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate()
  const expiry = new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay)))
  expiry.setUTCDate(expiry.getUTCDate() - 1)
  return expiry.toISOString().slice(0, 10)
}

const LEARNING_DEFAULT_MONTHS = 12

function learningValidityMonths(item: { validity_value?: number | null; effective_date?: string | null; expiry_date?: string | null }): string {
  if (item.validity_value && item.validity_value > 0) return String(item.validity_value)
  if (item.effective_date && item.expiry_date) {
    for (let months = 1; months <= 120; months += 1) {
      if (learningCourseExpiry(item.effective_date, months) === item.expiry_date) return String(months)
    }
  }
  return String(LEARNING_DEFAULT_MONTHS)
}

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
  agreement_status?: "unsigned" | "signed" | null
  card_type?: string
  total_count?: number | null
  effective_remaining?: number | null
  duration_type?: string | null
  duration_value?: number | null
  created_by?: string
  created_by_id?: string
  voided?: boolean
  // 沙龙技能学习专属
  course_type?: string
  // 其他项目专属
  category?: string
  project_name?: string
  // 觉醒/情绪/能量专属
  purchase_count?: number
  amount?: number
  // OH卡诊断专属
  diagnosis_duration?: number
  companion_teacher?: string
  companion_teacher_id?: string
  diagnosis_teacher?: string
  reading_type?: string
  // 线下课程专属
  validity_value?: number
  validity_unit?: string
  // 茶位费专属
  quantity?: number
  // 备注（所有类型共用）
  notes?: string
  deal_course_key?: string
  deal_course_name?: string
  deal_course_organization_name?: string
  // 原始数据（编辑时用）
  _raw?: any
}

function EmptyValue({ className }: { className?: string }) {
  return <span className={`inline-block align-middle h-[2px] w-[4px] rounded-full bg-[#e5e8eb] shrink-0 ${className ?? ""}`} />
}

function toUnified(item: any, type: ProjectTypeKey): UnifiedItem {
  const base: UnifiedItem = {
    id: item.id,
    customer_id: item.customer_id,
    nickname: item.nickname,
    type,
    deal_date: item.deal_date,
    deal_course_key: item.deal_course_key || "",
    deal_course_name: item.deal_course_name || "",
    deal_course_organization_name: item.deal_course_organization_name || "",
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
    created_by: item.created_by,
    created_by_id: item.created_by_id,
    _raw: item,
  }
  switch (type) {
    case "membership_card":
      return { ...base, agreement_status: item.agreement_status, detail: item.card_type, price: item.price, effective_date: item.effective_date, remaining_count: item.remaining_count, card_type: item.card_type, total_count: item.total_count, effective_remaining: item.effective_remaining, duration_type: item.duration_type, duration_value: item.duration_value, created_by: item.created_by, voided: item.voided, notes: item.notes }
    case "oh_card_reading": {
      const dd = item.diagnosis_duration || 1
      const totalHours = dd * 0.5
      const durText = totalHours + "小时"
      return { ...base, detail: item.reading_type || durText, reading_type: item.reading_type || "", price: item.amount, amount: item.amount, diagnosis_duration: dd, diagnosis_teacher: item.diagnosis_teacher || "", notes: item.notes, created_by: item.created_by }
    }
    case "group_case":
    case "emotional_release":
    case "energy_knot":
      return { ...base, detail: `${item.purchase_count} 次`, price: item.amount, purchase_count: item.purchase_count, amount: item.amount, effective_date: item.effective_date, expiry_date: item.expiry_date, effective_remaining: item.effective_remaining, notes: item.notes, created_by: item.created_by }
    case "internal_course":
      return { ...base, detail: item.course_type?.split("：")[0] || "", price: item.price, effective_date: item.effective_date, expiry_date: item.expiry_date, validity_value: item.validity_value, course_type: item.course_type, created_by: item.created_by, notes: item.notes }
    case "tea_seat_fee":
      return { ...base, detail: `${item.quantity || 1} 位`, price: item.amount, quantity: item.quantity, amount: item.amount, created_by: item.created_by, notes: item.notes }
    case "companion_camp":
    case "online_tea":
      return { ...base, created_by: item.created_by, companion_teacher: item.companion_teacher, companion_teacher_id: item.companion_teacher_id, detail: `${item.validity_value || 1} ${item.validity_unit === "day" ? "天" : "个月"}`, effective_date: item.effective_date, expiry_date: item.expiry_date, validity_value: item.validity_value, validity_unit: item.validity_unit || "month", notes: item.notes }
    case "offline_course": {
      let expiry_date: string | null = null
      if (item.effective_date && item.validity_value) {
        const eff = new Date(item.effective_date)
        eff.setMonth(eff.getMonth() + item.validity_value)
        eff.setDate(eff.getDate() - 1)
        expiry_date = eff.toLocaleDateString("sv-SE")
      }
      return { ...base, detail: [item.course_type, `${item.validity_value || 1} 个月`].filter(Boolean).join(" · "), course_type: item.course_type, price: item.amount, amount: item.amount, effective_date: item.effective_date, expiry_date, validity_value: item.validity_value, validity_unit: item.validity_unit, created_by: item.created_by, notes: item.notes }
    }
    case "other":
      return { ...base, detail: item.category || "", price: item.fee, effective_date: item.effective_date, remaining_count: item.remaining_count, total_count: item.total_count, category: item.category, project_name: item.project_name, duration_type: item.duration_type, duration_value: item.duration_value, effective_remaining: item.effective_remaining, created_by: item.created_by, notes: item.notes }
  }
}

function getApi(type: ProjectTypeKey) {
  return PROJECT_TYPES[type].api as any
}

interface UnifiedPaymentContentProps {
  embedded?: boolean
  filterTypes?: ProjectTypeKey[]
  formOnly?: boolean
  externalOpen?: boolean
  onExternalOpenChange?: (open: boolean) => void
  presetCustomer?: { id: string; nickname: string } | null
  onSaved?: () => void
  includeCoarseDoorOption?: boolean
}

/* ========== 组件 ========== */

export function UnifiedPaymentContent({
  embedded,
  filterTypes,
  formOnly = false,
  externalOpen = false,
  onExternalOpenChange,
  presetCustomer,
  onSaved,
  includeCoarseDoorOption = false,
}: UnifiedPaymentContentProps) {
  const enterToNext = useEnterToNext()
  const navigate = useNavigate()
  const editPermissions = useEditPermissions()
  const currentUser = useMemo(() => {
    try { return JSON.parse(localStorage.getItem("currentUser") || "{}") }
    catch { return {} }
  }, [])
  const currentActorName = String(currentUser.owner || currentUser.username || "")
  const currentActorId = String(currentUser.id || "")
  const canManagePayment = useCallback((item: UnifiedItem) => (
    currentUser.role === "超级管理员"
    || editPermissions.payments === "all"
    || (editPermissions.payments === "own" && (item.created_by_id
      ? Boolean(currentActorId && item.created_by_id === currentActorId)
      : Boolean(item.created_by && currentActorName && item.created_by === currentActorName)))
  ), [currentActorId, currentActorName, currentUser.role, editPermissions.payments])

  // 筛选
  const isMembershipOnly = filterTypes?.length === 1 && filterTypes[0] === "membership_card"
  const [activeType, setActiveType] = useState<ProjectTypeKey | "all">(() => {
    if (filterTypes && filterTypes.length === 1) return filterTypes[0]
    return "all"
  })
  const [subtypeFilter, setSubtypeFilter] = useState("all")
  const subtypeOptions = useMemo(() => {
    if (activeType === "membership_card") return Object.keys(MEMBERSHIP_CARD_TYPES).map(value => ({ value, label: value }))
    if (activeType === "internal_course") return LEARNING_PAYMENT_OPTIONS
    if (activeType === "offline_course") return OFFLINE_COURSE_TYPES.map(value => ({ value, label: value }))
    if (activeType === "oh_card_reading") return OH_READING_TYPES.map(value => ({ value, label: value }))
    return []
  }, [activeType])
  const subtypeLabel = activeType === "membership_card" ? "卡类型" : activeType === "oh_card_reading" ? "诊断类型" : "课程类型"

  // 弹窗
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<UnifiedItem | null>(null)
  const [formType, setFormType] = useState<ProjectTypeKey>("membership_card")
  const [coarseDoorSelected, setCoarseDoorSelected] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<UnifiedItem | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 通用表单
  const [formCustomerId, setFormCustomerId] = useState("")
  const [formNickname, setFormNickname] = useState("")
  const [formDealDate, setFormDealDate] = useState(today)
  const [formDealCourse, setFormDealCourse] = useState(UNSET_DEAL_COURSE)
  const [formDealCourseName, setFormDealCourseName] = useState("")
  const [formClosers, setFormClosers] = useState<Closer[]>([])
  const [formOrganizationId, setFormOrganizationId] = useState("")
  const [formPaymentMethod, setFormPaymentMethod] = useState("")
  const [closerError, setCloserError] = useState(false)

  // 会员卡表单
  const [formCardType, setFormCardType] = useState("")
  const [formAgreementStatus, setFormAgreementStatus] = useState("")
  const [agreementError, setAgreementError] = useState(false)
  const needsAgreement = formType === "membership_card" && !!formCardType && !["次卡", "体验会员", "粗门次卡"].includes(formCardType)
  const [formEffectiveDate, setFormEffectiveDate] = useState(today)
  const [formDurationType, setFormDurationType] = useState<string | null>("day")
  const [formDurationValue, setFormDurationValue] = useState("")
  const [formRemainingCount, setFormRemainingCount] = useState("")
  const [formTotalCount, setFormTotalCount] = useState("")
  const [formUnlimited, setFormUnlimited] = useState(false)
  const [formPrice, setFormPrice] = useState("")
  // 新业务规则：不再录入成交金额和支付方式；成交人保留为可选多选。
  const hidePaymentDetails = true

  // 觉醒/情绪/能量表单
  const [formPurchaseCount, setFormPurchaseCount] = useState("")
  const [formAmount, setFormAmount] = useState("")
  const [formProjectEffectiveDate, setFormProjectEffectiveDate] = useState(today)
  const [formProjectValidityValue, setFormProjectValidityValue] = useState("")
  const [formProjectValidityUnit, setFormProjectValidityUnit] = useState<string | null>("day")

  // OH卡诊断表单
  const [formDiagnosisDuration, setFormDiagnosisDuration] = useState(1)
  const [formOhAmount, setFormOhAmount] = useState("298")
  const [formDiagnosisTeacher, setFormDiagnosisTeacher] = useState("")

  // 茶位费表单
  const [formTeaQuantity, setFormTeaQuantity] = useState("1")
  const [formTeaAmount, setFormTeaAmount] = useState("68")

  const [formCompanionTeacher, setFormCompanionTeacher] = useState("")
  const [formCompanionTeacherId, setFormCompanionTeacherId] = useState("")

  // 线下课程表单
  const [formOfflineEffectiveDate, setFormOfflineEffectiveDate] = useState(today)
  const [formOfflineValidityValue, setFormOfflineValidityValue] = useState("1")
  const [formOnlineTeaValidityUnit, setFormOnlineTeaValidityUnit] = useState<"day" | "month">("month")
  const [formOfflineAmount, setFormOfflineAmount] = useState("")

  // 备注（所有类型共用）
  const [formNotes, setFormNotes] = useState("")

  // 沙龙技能学习表单
  const [formCourseType, setFormCourseType] = useState("")
  const [formReadingType, setFormReadingType] = useState("")
  const [formCourseAmount, setFormCourseAmount] = useState<number>(0)
  const [formLearningValidityValue, setFormLearningValidityValue] = useState(String(LEARNING_DEFAULT_MONTHS))

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
  const [organizationFilter, setOrganizationFilter] = useState("all")
  const [courseFilter, setCourseFilter] = useState("all")
  const [dealCourseOptions, setDealCourseOptions] = useState<{ key: string; name: string }[]>([])
  const [organizationOptions, setOrganizationOptions] = useState<{ id: string; name: string }[]>([])
  const [includeUnassignedCourse, setIncludeUnassignedCourse] = useState(false)
  const [scopeOptionsReady, setScopeOptionsReady] = useState(false)

  // 客户
  const directory = useReadResource<CustomerLight[]>(customerApi.light, [])
  const customers = directory.data
  const { organizations, hasAnyOrganization, loading: organizationsLoading } = useOrganizations()
  const [noOrgDialogOpen, setNoOrgDialogOpen] = useState(false)
  const [noAssignmentDialogOpen, setNoAssignmentDialogOpen] = useState(false)

  const [refundedKeys, setRefundedKeys] = useState(new Set<string>())
  const [refundStatusLoading, setRefundStatusLoading] = useState(false)
  const [refundStatusError, setRefundStatusError] = useState(false)

  const courseTeachers = useMemo(() =>
    customers.filter(c => c.positions?.includes(POSITION_COURSE_TEACHER))
      .sort((a, b) => (a.position_sort_orders?.[POSITION_COURSE_TEACHER] ?? 9999) - (b.position_sort_orders?.[POSITION_COURSE_TEACHER] ?? 9999)),
    [customers])

  // 分页数据获取
  const fetchFn = useCallback(async (page: number, pageSize: number) => {
    const params: any = { include_filter_options: "true" }
    if (searchNickname) params.nickname = searchNickname
    if (searchCloserName) params.closer_name = searchCloserName
    if (organizationFilter !== "all") params.organization_id = organizationFilter
    if (courseFilter !== "all") params.deal_course_key = courseFilter
    const hasParams = Object.keys(params).length > 0
    const p = hasParams ? params : undefined

    if (activeType !== "all") {
      const pp = { ...p }
      if (subtypeFilter !== "all" && subtypeOptions.length) pp.subtypes = JSON.stringify([subtypeFilter])
      const res = await getApi(activeType).listPaginated(page, pageSize, pp)
      if (!searchNickname && !searchCloserName) {
        const page = res as {
          deal_course_options?: { key: string; name: string }[]
          organization_options?: { id: string; name: string }[]
          unassigned_course?: boolean
        }
        if (page.deal_course_options) setDealCourseOptions(page.deal_course_options)
        if (page.organization_options) setOrganizationOptions(page.organization_options)
        if (typeof page.unassigned_course === "boolean") setIncludeUnassignedCourse(page.unassigned_course)
        setScopeOptionsReady(true)
      }
      return { ...res, items: res.items.map((i: any) => toUnified(i, activeType)) }
    }

    const result = await paymentExportApi.records(page, pageSize, searchNickname, searchCloserName)
    return { ...result, items: result.items.map(item => toUnified(item.record, item.type)) }
  }, [activeType, subtypeFilter, subtypeOptions, searchNickname, searchCloserName, organizationFilter, courseFilter])

  const { paginatedItems: rawItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex, loading, error, refresh } = useServerPagination(fetchFn, {
    enabled: !formOnly,
    queryKey: JSON.stringify([activeType, subtypeFilter, searchNickname, searchCloserName, organizationFilter, courseFilter]),
  })
  const paginatedItems = rawItems as unknown as UnifiedItem[]
  const scopeOrganizations = useMemo(() => organizationOptions.map(org => ({
    id: org.id,
    name: org.name || organizations.find(item => item.id === org.id)?.name || org.id,
  })), [organizationOptions, organizations])

  useEffect(() => {
    if (!scopeOptionsReady) return
    if (organizationFilter !== "all" && !scopeOrganizations.some(org => org.id === organizationFilter)) {
      setOrganizationFilter("all")
    }
    if (courseFilter === UNASSIGNED_COURSE && !includeUnassignedCourse) setCourseFilter("all")
    else if (courseFilter !== "all" && courseFilter !== UNASSIGNED_COURSE && !dealCourseOptions.some(course => course.key === courseFilter)) {
      setCourseFilter("all")
    }
  }, [scopeOptionsReady, organizationFilter, courseFilter, scopeOrganizations, dealCourseOptions, includeUnassignedCourse])

  useEffect(() => {
    let current = true
    const ids = paginatedItems.filter(item => item.type !== "membership_card").map(item => item.id)
    setRefundedKeys(new Set())
    setRefundStatusError(false)
    setRefundStatusLoading(ids.length > 0)
    if (ids.length) {
      projectRefundApi.statusKeys(ids).then(keys => {
        if (current) setRefundedKeys(new Set(keys))
      }).catch(() => {
        if (current) setRefundStatusError(true)
      }).finally(() => {
        if (current) setRefundStatusLoading(false)
      })
    }
    return () => { current = false }
  }, [paginatedItems])

  // 搜索
  const handleFilterChange = (field: "nickname" | "closer", value: string) => {
    if (field === "nickname") setSearchNickname(value)
    else setSearchCloserName(value)
  }

  const handleClearSearch = () => {
    setSearchNickname("")
    setSearchCloserName("")
    setSubtypeFilter("all")
    setOrganizationFilter("all")
    setCourseFilter("all")
  }

  // 会员卡类型选择
  const handleSelectCardType = (type: string) => {
    setFormCardType(type)
    const config = MEMBERSHIP_CARD_TYPES[type]
    if (type === "定制化") {
      setFormPrice("0"); setFormClosers([]); setFormPaymentMethod("")
      setFormRemainingCount(""); setFormTotalCount(""); setFormUnlimited(false)
      setFormDurationType("month"); setFormDurationValue("")
      return
    }
    setFormPrice(String(config.price))
    setFormClosers([])
    setFormPaymentMethod("")
    setCloserError(false)
    setFormDurationType(config.duration_type)
    setFormDurationValue(config.duration_value == null ? "" : String(config.duration_value))
    if (config.defaultCount) {
      setFormRemainingCount(String(config.defaultCount))
      setFormTotalCount(String(config.defaultCount))
      setFormUnlimited(false)
    } else if (config.unlimited) {
      setFormRemainingCount("")
      setFormUnlimited(true)
    } else {
      setFormRemainingCount("")
      setFormUnlimited(false)
    }
  }

  // 打开新增弹窗
  const handleOpenCreate = () => {
    if (!hasAnyOrganization) { setNoOrgDialogOpen(true); return }
    if (organizations.every(org => org.status === "archived")) { setNoAssignmentDialogOpen(true); return }
    setEditingItem(null)
    setCoarseDoorSelected(false)
    setFormType(activeType === "all" ? (filterTypes ? filterTypes[0] : "membership_card") : activeType)
    resetForm()
    if (presetCustomer) {
      setFormCustomerId(presetCustomer.id)
      setFormNickname(presetCustomer.nickname)
    }
    setDialogOpen(true)
  }

  // 弹窗标题
  const dialogTitle = useMemo(() => {
    if (coarseDoorSelected) return "新增 - 粗门次卡"
    const typeName = PROJECT_TYPES[formType]?.label || ""
    if (editingItem) return `编辑 - ${typeName}`
    return `新增 - ${typeName}`
  }, [coarseDoorSelected, formType, editingItem])

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
    setFormProjectEffectiveDate(today)
    setFormProjectValidityValue("")
    setFormProjectValidityUnit("day")
    // OH卡诊断
    setFormDiagnosisDuration(1)
    setFormOhAmount("298")
    setFormDiagnosisTeacher("")
    setFormReadingType("")
    // 茶位费
    setFormTeaQuantity("1")
    setFormTeaAmount("68")
    // 线下课程
    setFormOfflineEffectiveDate(today)
    setFormOfflineValidityValue("1")
    setFormOnlineTeaValidityUnit("month")
    setFormCompanionTeacher("")
    setFormCompanionTeacherId("")
    setFormOfflineAmount("")
    // 沙龙技能学习
    setFormCourseType("")
    setFormCourseAmount(0)
    setFormLearningValidityValue(String(LEARNING_DEFAULT_MONTHS))
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
    setFormAgreementStatus("")
    setAgreementError(false)
    setFormCustomerId("")
    setFormNickname("")
    setFormDealDate(today)
    setFormDealCourse(UNSET_DEAL_COURSE)
    setFormDealCourseName("")
    setFormClosers([])
    setFormOrganizationId(defaultOrganization(organizations)?.id || "")
    setFormPaymentMethod("")
    setFormNotes("")
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
    setFormProjectEffectiveDate(today)
    setFormProjectValidityValue("")
    setFormProjectValidityUnit("day")
    // OH卡诊断
    setFormDiagnosisDuration(1)
    setFormOhAmount("298")
    setFormDiagnosisTeacher("")
    // 茶位费
    setFormTeaQuantity("1")
    setFormTeaAmount("68")
    // 线下课程
    setFormOfflineEffectiveDate(today)
    setFormOfflineValidityValue("1")
    setFormOfflineAmount("")
    // 沙龙技能学习
    setFormCourseType("")
    setFormCourseAmount(0)
    setFormLearningValidityValue(String(LEARNING_DEFAULT_MONTHS))
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

  useEffect(() => {
    if (!formOnly || organizationsLoading) return
    if (externalOpen && !dialogOpen) handleOpenCreate()
    if (!externalOpen && dialogOpen && !confirmOpen) setDialogOpen(false)
    // 外部开关只在用户点击“新增”或关闭弹窗时变化，避免表单输入触发重置。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalOpen, formOnly, organizationsLoading])

  // 打开编辑弹窗
  const handleOpenEdit = (item: UnifiedItem) => {
    if (!canManagePayment(item)) return
    setEditingItem(item)
    setCoarseDoorSelected(false)
    setFormType(item.type)
    setFormCustomerId(item.customer_id)
    setFormNickname(item.nickname)
    setFormDealDate(item.deal_date || "")
    setFormDealCourse(item.deal_course_key || "")
    setFormDealCourseName(item.deal_course_name || "")
    setFormClosers(item.closers?.length ? item.closers.map((c: any) => ({ ...c, amount: Number(c.amount) || 0 })) : (item.closer_id ? [{ id: item.closer_id, name: item.closer_name || "", amount: 0 }] : []))
    setFormOrganizationId(item.organization_id || "")
    setFormPaymentMethod(item.payment_method || "")
    setFormNotes(item.notes || "")
    setCloserError(false)

    switch (item.type) {
      case "membership_card":
        setFormCardType(item.card_type || "")
        setFormAgreementStatus(item.agreement_status || "")
        setFormEffectiveDate(item.effective_date || "")
        setFormDurationType(item.duration_type || "day")
        setFormDurationValue(item.duration_value ? String(item.duration_value) : "")
        setFormRemainingCount(item.remaining_count !== null && item.remaining_count !== undefined ? String(item.remaining_count) : "")
        setFormTotalCount(item.total_count !== null && item.total_count !== undefined ? String(item.total_count) : "")
        setFormUnlimited(item.remaining_count === null || item.remaining_count === undefined)
        setFormPrice(String(item.price))
        setFormNotes(item.notes || "")
        break
      case "oh_card_reading":
        setFormReadingType(item.reading_type || "")
        setFormDiagnosisDuration(item.diagnosis_duration || 1)
        setFormOhAmount(String(item.amount || 298))
        setFormDiagnosisTeacher(item.diagnosis_teacher || "")
        break
      case "group_case":
      case "emotional_release":
      case "energy_knot":
        setFormPurchaseCount(String(item.purchase_count || 0))
        setFormAmount(String(item.amount || 0))
        setFormProjectEffectiveDate(item.effective_date || today)
        setFormProjectValidityValue("")
        setFormProjectValidityUnit("day")
        setFormNotes(item.notes || "")
        // 从 expiry_date 反推有效期（仅当两者都存在且是同一天时无法反推，简单设为空）
        if (item.effective_date && item.expiry_date) {
          const eff = new Date(item.effective_date)
          const exp = new Date(item.expiry_date)
          const diffDays = Math.round((exp.getTime() - eff.getTime()) / (1000 * 60 * 60 * 24))
          if (diffDays > 0 && diffDays % 30 === 0) {
            setFormProjectValidityValue(String(diffDays / 30))
            setFormProjectValidityUnit("month")
          } else if (diffDays > 0) {
            setFormProjectValidityValue(String(diffDays))
            setFormProjectValidityUnit("day")
          }
        }
        break
      case "internal_course":
        setFormCourseType(item.course_type || "")
        setFormCourseAmount(item.price)
        setFormEffectiveDate(item.effective_date || "")
        setFormLearningValidityValue(learningValidityMonths(item))
        setFormNotes(item.notes || "")
        break
      case "tea_seat_fee":
        setFormTeaQuantity(String(item.quantity || 1))
        setFormTeaAmount(String(item.amount || 68))
        setFormNotes(item.notes || "")
        break
      case "companion_camp":
      case "online_tea":
      case "offline_course":
        setFormCourseType(item.course_type || "")
        setFormOfflineEffectiveDate(item.effective_date || today)
        setFormOfflineValidityValue(String(item.validity_value || 1))
        setFormCompanionTeacher(item.companion_teacher || "")
        setFormCompanionTeacherId(item.companion_teacher_id || "")
        setFormOnlineTeaValidityUnit(item.validity_unit === "day" ? "day" : "month")
        setFormOfflineAmount(String(item.amount || ""))
        setFormNotes(item.notes || "")
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
        setFormNotes(item.notes || "")
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
      case "energy_knot": return parseFloat(formAmount) || 0
      case "oh_card_reading": return parseFloat(formOhAmount) || 0
      case "internal_course": return formCourseAmount || 0
      case "tea_seat_fee": return parseFloat(formTeaAmount) || 0
      case "companion_camp":
      case "online_tea": return 0
      case "offline_course": return parseFloat(formOfflineAmount) || 0
      case "other": return parseFloat(formFee) || 0
    }
  }

  // 保存
  const handleSave = () => {
    if (!formCustomerId) return
    if (!editingItem && !defaultOrganization(organizations)) { window.alert("未找到可用的无忧茶院，请联系管理员检查组织配置"); return }
    setCloserError(false)
    if (!formClosers.some(closer => closer.name?.trim())) { setCloserError(true); return }
    if (!hidePaymentDetails) {
      const amt = getFormAmount()
      if (Math.abs(formClosers.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) - amt) > 0.01) return
    }
    if (formType === "membership_card" && !formCardType) return
    if (formType === "membership_card" && formCardType === "定制化" && !editingItem && (!Number.isInteger(Number(formDurationValue)) || Number(formDurationValue) <= 0 || (!formUnlimited && (!Number.isInteger(Number(formRemainingCount)) || Number(formRemainingCount) <= 0)))) { window.alert("请填写定制化会员卡的次数和有效期，或明确选择不限次数"); return }
    if (needsAgreement && !formAgreementStatus) { setAgreementError(true); return }
    if (formType === "internal_course" && !formCourseType) return
    if (formDealCourse === UNSET_DEAL_COURSE) { window.alert("请选择成交课程"); return }
    if (formType === "oh_card_reading" && !formReadingType && !editingItem) { window.alert("请选择诊断类型"); return }
    if (formType === "oh_card_reading" && !formDiagnosisTeacher.trim()) { window.alert("请选择诊断老师"); return }
    if (formType === "offline_course" && !formCourseType && !editingItem) { window.alert("请选择课程类型"); return }
    if ((formType === "online_tea" || formType === "companion_camp") && (!formOrganizationId || !formOfflineEffectiveDate || !formDealDate || !Number.isInteger(Number(formOfflineValidityValue)) || Number(formOfflineValidityValue) < 1 || Number(formOfflineValidityValue) > 1200)) { window.alert("请填写日期和1至1200的天或月有效期"); return }
    if (formType === "companion_camp" && !formCompanionTeacher.trim()) { window.alert("请选择陪伴老师"); return }
    if (formType === "tea_seat_fee" && !parseInt(formTeaQuantity)) return
    if (formType === "other" && !formProjectName) return
    setConfirmOpen(true)
  }

  const buildPayload = () => {
    const closer_id = formClosers[0]?.id || null
    const closer_name = formClosers[0]?.name || null
    const closers = formClosers.map(closer => ({ ...closer, amount: 0 }))
    const organization_id = editingItem ? formOrganizationId || null : defaultOrganization(organizations)?.id || null
    const deal_date = formDealDate || null
    let createdBy = ""
    try { const u = JSON.parse(localStorage.getItem("currentUser") || "{}"); createdBy = u.owner || u.username || "" } catch {}

    switch (formType) {
      case "membership_card": {
        const config = MEMBERSHIP_CARD_TYPES[formCardType]
        const payload: Record<string, any> = {
          customer_id: formCustomerId, nickname: formNickname, card_type: formCardType,
          agreement_status: needsAgreement ? formAgreementStatus : null,
          price: 0,
          effective_date: formEffectiveDate, duration_type: formDurationType,
          duration_value: formDurationValue ? parseInt(formDurationValue) : null,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: hidePaymentDetails ? null : formPaymentMethod || null,
          created_by: createdBy,
          notes: formNotes || "",
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
      case "oh_card_reading":
        return {
          customer_id: formCustomerId, nickname: formNickname,
          diagnosis_teacher: formDiagnosisTeacher || "",
          reading_type: formReadingType,
          diagnosis_duration: formDiagnosisDuration || 1,
          ...(editingItem ? {} : { created_by: createdBy }),
          amount: 0,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          notes: formNotes || "",
        }
      case "group_case":
      case "emotional_release":
      case "energy_knot": {
        let expiry_date: string | null = null
        const val = parseInt(formProjectValidityValue)
        if (formProjectEffectiveDate && formProjectValidityValue && !isNaN(val) && val > 0) {
          const eff = new Date(formProjectEffectiveDate)
          if (formProjectValidityUnit === "month") {
            eff.setMonth(eff.getMonth() + val)
            eff.setDate(eff.getDate() - 1)
          } else {
            eff.setDate(eff.getDate() + val)
          }
          expiry_date = eff.toLocaleDateString("sv-SE")
        }
        return {
          customer_id: formCustomerId, nickname: formNickname,
          purchase_count: parseInt(formPurchaseCount) || 0,
          ...(editingItem ? {} : { created_by: createdBy }),
          amount: 0,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          effective_date: formProjectEffectiveDate || null,
          expiry_date,
          notes: formNotes || "",
        }
      }
      case "internal_course": {
        const months = parseInt(formLearningValidityValue) || LEARNING_DEFAULT_MONTHS
        const expiry_date = learningCourseExpiry(formEffectiveDate, months)
        return {
          customer_id: formCustomerId, nickname: formNickname,
          course_type: formCourseType, price: 0,
          effective_date: formEffectiveDate, validity_value: months, expiry_date,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          ...(!editingItem && { created_by: createdBy }),
          notes: formNotes || "",
        }
      }
      case "tea_seat_fee":
        return {
          customer_id: formCustomerId, nickname: formNickname,
          quantity: parseInt(formTeaQuantity) || 1,
          amount: 0,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          ...(editingItem ? {} : { created_by: createdBy }),
          notes: formNotes || "",
        }
      case "companion_camp":
      case "online_tea":
        return { customer_id: formCustomerId, nickname: formNickname, deal_date, organization_id,
          ...(formType === "companion_camp" ? { companion_teacher: formCompanionTeacher, companion_teacher_id: formCompanionTeacherId } : {}),
          effective_date: formOfflineEffectiveDate, validity_value: Number(formOfflineValidityValue), validity_unit: formOnlineTeaValidityUnit,
          closer_id, closer_name, closers, notes: formNotes || "" }
      case "offline_course": {
        let expiry_date: string | null = null
        const val = parseInt(formOfflineValidityValue)
        if (formOfflineEffectiveDate && !isNaN(val) && val > 0) {
          const eff = new Date(formOfflineEffectiveDate)
          eff.setMonth(eff.getMonth() + val)
          eff.setDate(eff.getDate() - 1)
          expiry_date = eff.toLocaleDateString("sv-SE")
        }
        return {
          customer_id: formCustomerId, nickname: formNickname,
          course_type: formCourseType,
          effective_date: formOfflineEffectiveDate || null,
          validity_value: val || offlineCourseDefaultMonths(formCourseType),
          validity_unit: "month",
          amount: 0,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          ...(editingItem ? {} : { created_by: createdBy }),
          notes: formNotes || "",
        }
      }
      case "other": {
        const payload: Record<string, any> = {
          customer_id: formCustomerId, nickname: formNickname,
          category: formCategory || null, project_name: formProjectName, fee: 0,
          effective_date: formOtherEffectiveDate,
          duration_type: formOtherDurationType,
          duration_value: formOtherDurationValue ? parseInt(formOtherDurationValue) : null,
          closer_id, closer_name, closers, organization_id, deal_date,
          payment_method: null,
          ...(!editingItem && { created_by: createdBy }),
          notes: formNotes || "",
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
      data.deal_course_key = formDealCourse === UNSET_DEAL_COURSE ? "" : formDealCourse
      if (editingItem) {
        // 隐藏的支付字段不代表清空：编辑旧记录时保留原始财务信息。
        for (const key of ["price", "amount", "fee", "payment_method"]) delete data[key]
        if (Array.isArray(data.closers)) {
          data.closers = data.closers.map((closer: { id: string; name: string; amount: number }) => ({
            ...closer,
            amount: (editingItem.closers || []).find((old: { id: string; name: string }) =>
              closer.id ? old.id === closer.id : old.name === closer.name)?.amount ?? 0,
          }))
        }
        await api.update(editingItem.id, data)
      } else {
        await api.create(data)
      }
      setConfirmOpen(false)
      setDialogOpen(false)
      onExternalOpenChange?.(false)
      refresh()
      onSaved?.()
    } catch (error: any) {
      console.error("保存失败:", error)
      alert(error?.message || error?.detail || "保存失败")
    } finally {
      setSaving(false)
    }
  }

  // 删除
  const handleDelete = async () => {
    if (!deleteTarget || !canManagePayment(deleteTarget)) return
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
      { header: "定制次数（不限填不限）", key: "custom_count", width: 20, example: "" },
      { header: "有效期单位", key: "duration_type", width: 10, example: "" },
      { header: "有效期时长", key: "duration_value", width: 12, example: "" },
      { header: "协议签订", key: "agreement_status", width: 12, example: "未签" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
    ],
    group_case: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买场次", key: "purchase_count", width: 10, example: "5" },
    ],
    emotional_release: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买场次", key: "purchase_count", width: 10, example: "3" },
    ],
    oh_card_reading: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "诊断类型", key: "reading_type", width: 20, example: "OH卡情感梳理" },
      { header: "诊断老师", key: "diagnosis_teacher", width: 12, example: "老师昵称" },
      { header: "诊断时长（半小时为单位）", key: "diagnosis_duration", width: 16, example: "2（=1小时）" },
      { header: "备注", key: "notes", width: 18, example: "" },
    ],
    energy_knot: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "购买部位", key: "purchase_count", width: 10, example: "3" },
    ],
    internal_course: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "课程类型", key: "course_type", width: 24, example: "疗愈师课程：自爱力构建" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "有效期（月）", key: "validity_value", width: 10, example: "12" },
    ],
    tea_seat_fee: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "数量", key: "quantity", width: 10, example: "1" },
    ],
    offline_course: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "课程类型", key: "course_type", width: 22, example: "主理人训练" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "有效期（月）", key: "validity_value", width: 10, example: "3" },
    ],
    online_tea: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-10-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-10-19" },
      { header: "有效期时长", key: "validity_value", width: 12, example: "1" },
      { header: "有效期单位", key: "validity_unit", width: 12, example: "月" },
      { header: "成交人", key: "closer_name", width: 12, example: "" },
      { header: "备注", key: "notes", width: 20, example: "" },
    ],
    companion_camp: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-10-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-10-19" },
      { header: "有效期时长", key: "validity_value", width: 12, example: "1" },
      { header: "有效期单位", key: "validity_unit", width: 12, example: "月" },
      { header: "成交人", key: "closer_name", width: 12, example: "" },
      { header: "陪伴老师", key: "companion_teacher", width: 12, example: "老师昵称" },
      { header: "备注", key: "notes", width: 20, example: "" },
    ],
    other: [
      { header: "成交日期", key: "deal_date", width: 12, example: "2026-06-19" },
      { header: "用户昵称", key: "nickname", width: 12, example: "张三" },
      { header: "项目名称", key: "project_name", width: 18, example: "定制服务" },
      { header: "生效日期", key: "effective_date", width: 12, example: "2026-06-19" },
      { header: "有效期单位", key: "duration_type", width: 10, example: "月" },
      { header: "有效期时长", key: "duration_value", width: 10, example: "6" },
      { header: "次数（不填则无限次数）", key: "remaining_count", width: 16, example: "" },
    ],
  }

  // 下载导入模板（全部类型，每个类型一个 sheet）
  const handleDownloadTemplate = async () => {
    const ExcelJS = await loadExcel().catch(() => { alert("导出组件加载失败，请重试"); return null })
    if (!ExcelJS) return
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
  const validateRow = (type: ProjectTypeKey, get: (col: string) => string, customerMap: Map<string, CustomerLight>, orgMap: Map<string, any>) => {
    const errors: string[] = []
    const dealDate = get("成交日期")
    const nickname = get("用户昵称")
    const amountStr = get("金额")
    const closerNickname = get("成交人昵称（多个成交人请去页面内录入）") || get("成交人昵称")
    const orgName = defaultOrganization([...orgMap.values()])?.name || ""
    const cardType = type === "membership_card" ? get("会员卡类型") : ""
    const omitPaymentDetails = true

    if (!dealDate) errors.push("成交日期为空")
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(dealDate)) errors.push("日期格式错误（需YYYY-MM-DD）")
    if (!nickname) errors.push("用户昵称为空")
    const customer = customerMap.get(nickname)
    if (nickname && !customer) errors.push(`用户"${nickname}"不存在`)
    const amount = omitPaymentDetails ? 0 : parseFloat(amountStr)
    if (!omitPaymentDetails) {
      if (!amountStr) errors.push("金额为空")
      else if (isNaN(amount) || amount < 0) errors.push("金额格式错误")
    }

    if (type === "membership_card") {
      if (cardType && !["次卡", "体验会员", "粗门次卡"].includes(cardType) && !["未签", "已签"].includes(get("协议签订"))) errors.push("协议签订须填写未签或已签")
      if (!cardType) errors.push("会员卡类型为空")
      else if (!MEMBERSHIP_CARD_TYPES[cardType]) errors.push(`会员卡类型"${cardType}"无效`)
      if (cardType === "定制化") {
        const count = get("定制次数（不限填不限）")
        if (count !== "不限" && (!/^\d+$/.test(count) || Number(count) < 1)) errors.push("请填写定制次数或不限")
        if (!["天", "月"].includes(get("有效期单位")) || !/^\d+$/.test(get("有效期时长")) || Number(get("有效期时长")) < 1) errors.push("请填写定制有效期单位和时长")
      }
    }
    if (type === "internal_course") {
      const courseType = get("课程类型")
      if (!courseType) errors.push("课程类型为空")
      else if (!COURSE_TYPES[courseType]) errors.push(`课程类型"${courseType}"无效`)
    }
    if (type === "companion_camp" && !get("陪伴老师").trim()) errors.push("请选择陪伴老师")
    if (type === "other" && !get("项目名称")) errors.push("项目名称为空")
    if ((type === "online_tea" || type === "companion_camp") && get("有效期单位") && !["天", "月"].includes(get("有效期单位"))) errors.push("有效期单位须填写天或月")
    if ((type === "online_tea" || type === "companion_camp") && get("有效期时长") && (!/^\d+$/.test(get("有效期时长")) || Number(get("有效期时长")) < 1 || Number(get("有效期时长")) > 1200)) errors.push("有效期时长须填写1至1200的整数")
    if (type === "oh_card_reading" && get("诊断类型") && !(OH_READING_TYPES as readonly string[]).includes(get("诊断类型"))) errors.push("请选择有效的诊断类型")
    if (type === "oh_card_reading" && !get("诊断老师").trim()) errors.push("请选择诊断老师")
    if (type === "offline_course" && !(OFFLINE_COURSE_TYPES as readonly string[]).includes(get("课程类型"))) errors.push("请选择有效的线下课程类型")
    if (!closerNickname) errors.push("成交人为空")

    let closerId: string | null = null
    let closerName: string | null = null
    if (closerNickname) {
      const closer = customerMap.get(closerNickname)
      if (!closer) errors.push(`成交人"${closerNickname}"不存在`)
      else { closerId = closer.id; closerName = closer.nickname }
    }

    if (!orgName) errors.push("未找到可用的无忧茶院")
    const orgId = defaultOrganization([...orgMap.values()])?.id || null

    if (errors.length > 0) return { errors }

    const base = {
      customer_id: customer!.id, nickname: customer!.nickname,
      closer_id: omitPaymentDetails ? null : closerId,
      closer_name: omitPaymentDetails ? null : closerName,
      closers: omitPaymentDetails ? [] : (closerId ? [{ id: closerId, name: closerName!, amount }] : []),
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
        const mcConfig = MEMBERSHIP_CARD_TYPES[cardType]
        const mcDurType = mcConfig?.duration_type ?? null
        const mcDurValue = mcConfig?.duration_value ?? null
        payload = { ...base, card_type: cardType, agreement_status: ["次卡", "体验会员", "粗门次卡"].includes(cardType) ? null : (get("协议签订") === "已签" ? "signed" : "unsigned"), price: amount, effective_date: get("生效日期") || today, duration_type: cardType === "定制化" ? durationType : mcDurType, duration_value: cardType === "定制化" ? durationValue : mcDurValue, remaining_count: cardType === "定制化" ? (get("定制次数（不限填不限）") === "不限" ? null : Number(get("定制次数（不限填不限）"))) : mcConfig?.unlimited ? null : (mcConfig?.defaultCount || null) }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${cardType}|${amount}`
        break
      }
      case "group_case":
        payload = { ...base, purchase_count: parseInt(get("购买场次")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "emotional_release":
        payload = { ...base, purchase_count: parseInt(get("购买场次")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "oh_card_reading": {
        const ddStr = get("诊断时长（半小时为单位）")
        const dd = ddStr ? parseInt(ddStr) || 1 : 1
        const notes = get("备注")
        payload = { ...base, reading_type: get("诊断类型"), diagnosis_teacher: get("诊断老师").trim(), diagnosis_duration: dd, amount, notes: notes || "" }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      }
      case "energy_knot":
        payload = { ...base, purchase_count: parseInt(get("购买部位") || get("购买场次")) || 0, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      case "tea_seat_fee": {
        const qty = parseInt(get("数量")) || 1
        payload = { ...base, quantity: qty, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${amount}`
        break
      }
      case "companion_camp":
      case "online_tea": {
        payload = { ...base, ...(type === "companion_camp" ? { companion_teacher: get("陪伴老师").trim(), companion_teacher_id: customerMap.get(get("陪伴老师").trim())?.id || "" } : {}), effective_date: get("生效日期") || dealDate,
          validity_value: parseInt(get("有效期时长") || get("有效期（月）")) || 1,
          validity_unit: get("有效期单位") === "天" ? "day" : "month", notes: get("备注") }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${payload.effective_date}`
        break
      }
      case "offline_course": {
        const vv = parseInt(get("有效期（月）")) || offlineCourseDefaultMonths(get("课程类型"))
        payload = { ...base, course_type: get("课程类型"), effective_date: get("生效日期") || today, validity_value: vv, amount }
        dupKey = `${base.customer_id}|${type}|${dealDate}|${get("课程类型")}|${amount}`
        break
      }
      case "internal_course": {
        const courseType = get("课程类型")
        const months = parseInt(get("有效期（月）")) || LEARNING_DEFAULT_MONTHS
        payload = { ...base, course_type: courseType, price: amount, effective_date: get("生效日期") || today, validity_value: months }
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
  const buildExistingKeys = async (types: ProjectTypeKey[]): Promise<Set<string>> => {
    const keys = new Set<string>()
    for (const type of types) {
      let page = 1
      let totalPages = 1
      do {
        // 查询任意一页失败即停止导入，不能把“未查到”当作“没有重复”。
        const res = await getApi(type).listPaginated(page, 100)
        totalPages = res.total_pages
        for (const item of res.items) {
          let key: string
          switch (type) {
            case "membership_card":
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.card_type || ""}|${item.price || 0}`
              break
            case "companion_camp":
            case "online_tea":
              key = `${item.customer_id}|${type}|${item.deal_date || ""}|${item.effective_date || ""}`
              break
            case "internal_course":
            case "offline_course":
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
        page += 1
      } while (page <= totalPages)
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
      const ExcelJS = await loadExcel()
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
      const existingKeys = await buildExistingKeys([...new Set(validRows.map(row => row.type))])
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
      setImportResult({ success: 0, failed: 0, errors: [`导入未完成：${err.message}`] })
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
    rows.push({ label: "成交课程", value: formDealCourse === UNSET_DEAL_COURSE ? "未填" : (formDealCourseName || NO_DEAL_COURSE_LABEL) })
    if (formType === "membership_card") {
      rows.push({ label: "生效日期", value: formEffectiveDate || "-" })
      rows.push({ label: "会员卡", value: formCardType || "-" })
      if (!hidePaymentDetails) {
        rows.push({ label: "费用金额", value: `¥${parseFloat(formPrice || "0").toLocaleString()}` })
      }
      const dv = parseInt(formDurationValue)
      const dt = formDurationType === "day" ? "day" : "month"
      if (!isNaN(dv) && dv > 0) {
        const unitName = dt === "month" ? "个月" : "天"
        rows.push({ label: "有效期", value: `${dv} ${unitName}` })
        if (formEffectiveDate) {
          const eff = new Date(formEffectiveDate)
          if (!isNaN(eff.getTime())) {
            if (dt === "month") {
              eff.setMonth(eff.getMonth() + dv)
              eff.setDate(eff.getDate() - 1)
            } else {
              eff.setDate(eff.getDate() + dv)
            }
            rows.push({ label: "结束日期", value: eff.toLocaleDateString("sv-SE") })
          }
        }
      }
    } else if (formType === "internal_course") {
      const months = parseInt(formLearningValidityValue) || LEARNING_DEFAULT_MONTHS
      rows.push({ label: "生效日期", value: formEffectiveDate || "-" })
      rows.push({ label: "课程类型", value: formCourseType || "-" })
      rows.push({ label: "有效期", value: `${months} 个月` })
      rows.push({ label: "结束日期", value: learningCourseExpiry(formEffectiveDate, months) || "-" })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${(formCourseAmount || 0).toLocaleString()}` })
    } else if (formType === "other") {
      rows.push({ label: "项目名称", value: [formCategory, formProjectName].filter(Boolean).join(" / ") || "-" })
      if (!hidePaymentDetails) rows.push({ label: "费用", value: `¥${parseFloat(formFee || "0").toLocaleString()}` })
      rows.push({ label: "生效日期", value: formOtherEffectiveDate || "-" })
      if (formOtherDurationValue || formOtherRemainingCount || formOtherUnlimited) {
        let v = ""
        if (formOtherDurationValue) v += `${formOtherDurationValue} ${formOtherDurationType === "month" ? "个月" : "天"}`
        if (formOtherDurationValue && (formOtherRemainingCount || formOtherUnlimited)) v += "，"
        v += formOtherUnlimited ? "次数不限" : formOtherRemainingCount ? `${formOtherRemainingCount} 次` : ""
        rows.push({ label: "有效期", value: v })
      }
    } else if (formType === "oh_card_reading") {
      rows.push({ label: "诊断类型", value: formReadingType || "-" })
      rows.push({ label: "诊断老师", value: formDiagnosisTeacher || "-" })
      rows.push({ label: "诊断时长", value: `${formDiagnosisDuration * 0.5}小时` })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${parseFloat(formOhAmount || "0").toLocaleString()}` })
    } else if (formType === "tea_seat_fee") {
      rows.push({ label: "数量", value: `${formTeaQuantity || "1"} 位` })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${parseFloat(formTeaAmount || "0").toLocaleString()}` })
    } else if ((formType === "online_tea" || formType === "companion_camp")) {
      if (formType === "companion_camp") rows.push({ label: "陪伴老师", value: formCompanionTeacher || "—" })
      rows.push({ label: "生效日期", value: formOfflineEffectiveDate || "—" }, { label: "有效期", value: `${formOfflineValidityValue || 1} ${formOnlineTeaValidityUnit === "day" ? "天" : "个月"}` })
    } else if (formType === "offline_course") {
      rows.push({ label: "课程类型", value: formCourseType || "-" })
      rows.push({ label: "生效日期", value: formOfflineEffectiveDate || "-" })
      rows.push({ label: "有效期", value: `${formOfflineValidityValue || offlineCourseDefaultMonths(formCourseType)} 个月` })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${parseFloat(formOfflineAmount || "0").toLocaleString()}` })
    } else if (formType === "group_case" || formType === "emotional_release" || formType === "energy_knot") {
      const countLabel = formType === "energy_knot" ? "部位数" : "购买场次"
      const countUnit = formType === "energy_knot" ? "个" : "次"
      rows.push({ label: countLabel, value: `${formPurchaseCount || "0"} ${countUnit}` })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${parseFloat(formAmount || "0").toLocaleString()}` })
      rows.push({ label: "生效日期", value: formProjectEffectiveDate || "-" })
      if (formProjectValidityValue && formProjectValidityUnit) {
        const val = parseInt(formProjectValidityValue)
        if (!isNaN(val) && val > 0) {
          const unitName = formProjectValidityUnit === "month" ? "个月" : "天"
          rows.push({ label: "有效期", value: `${val} ${unitName}` })
          if (formProjectEffectiveDate) {
            const eff = new Date(formProjectEffectiveDate)
            if (!isNaN(eff.getTime())) {
              if (formProjectValidityUnit === "month") {
                eff.setMonth(eff.getMonth() + val)
                eff.setDate(eff.getDate() - 1)
              } else {
                eff.setDate(eff.getDate() + val)
              }
              rows.push({ label: "结束日期", value: eff.toLocaleDateString("sv-SE") })
            }
          }
        }
      }
    } else {
      rows.push({ label: formType === "energy_knot" ? "部位数" : "购买场次", value: `${formPurchaseCount || "0"} ${formType === "energy_knot" ? "个" : "次"}` })
      if (!hidePaymentDetails) rows.push({ label: "付费金额", value: `¥${parseFloat(formAmount || "0").toLocaleString()}` })
    }
    rows.push({ label: "成交人", value: formClosers.length > 0 ? formClosers.map(c => c.name).join("、") : "-" })
    if (needsAgreement) rows.push({ label: "协议签订", value: formAgreementStatus === "signed" ? "已签" : "未签" })
    if (!hidePaymentDetails) {
      rows.push({ label: "成交人合计", value: `¥${formClosers.reduce((sum, closer) => sum + (Number(closer.amount) || 0), 0).toLocaleString()}` })
      if (!["oh_card_reading", "tea_seat_fee", "offline_course", "online_tea", "companion_camp"].includes(formType)) {
        rows.push({ label: "支付方式", value: formPaymentMethod || "-" })
      }
    }
    rows.push({ label: "备注", value: formNotes || "-" })
    return rows
  }, [formCompanionTeacher, needsAgreement, formAgreementStatus, formType, formDealDate, formDealCourseName, formNickname, formEffectiveDate, formCardType, formPrice, formPurchaseCount, formAmount, formOhAmount, formDiagnosisTeacher, formReadingType, formDiagnosisDuration, formTeaQuantity, formTeaAmount, formOfflineEffectiveDate, formOfflineValidityValue, formOnlineTeaValidityUnit, formOfflineAmount, formCourseType, formCourseAmount, formLearningValidityValue, formProjectName, formFee, formOtherEffectiveDate, formOtherDurationType, formOtherDurationValue, formOtherRemainingCount, formOtherUnlimited, formOrganizationId, formClosers, organizations, mcShowDurationInfo, formTotalCount, formDurationValue, formDurationType, formUnlimited, formNotes, formPaymentMethod, formProjectEffectiveDate, formProjectValidityValue, formProjectValidityUnit, editingItem])

  return (
    <>
      <LoadError error={directory.error} onRetry={directory.refresh} />
      {/* 搜索栏 + 表格 卡片 */}
      {!formOnly && <div className="w-full min-w-0 max-w-full rounded-xl bg-white shadow-[0_2px_4px_rgba(33,38,49,.05)] overflow-hidden flex flex-col flex-1 min-h-0">
        {/* 搜索栏 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-[#f0f0f0]">
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchNickname}
              onChange={(v) => handleFilterChange("nickname", typeof v === "string" ? v : "")}
              placeholder="搜索用户"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          {isMembershipOnly && <div className="w-[138px]">
            <SelectDropdown
              className="w-[138px]"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
              value={subtypeFilter}
              options={[
                { value: "all", label: "全部卡类型" },
                ...subtypeOptions,
              ]}
              textColor={subtypeFilter !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
              onChange={setSubtypeFilter}
            />
          </div>}
          {!isMembershipOnly && !(filterTypes && filterTypes.length === 1) && <div className="w-[138px]">
            <SelectDropdown
              className="w-[138px]"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
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
              textColor={activeType && activeType !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
              onChange={(v) => { setActiveType(v as ProjectTypeKey | "all"); setSubtypeFilter("all") }}
            />
          </div>}
          {!isMembershipOnly && subtypeOptions.length > 0 && <div className="w-[172px]">
            <SelectDropdown
              className="w-[172px]"
              buttonClassName="border-[#e1e4e7] bg-white px-2.5"
              rounded="7px"
              value={subtypeFilter}
              options={[{ value: "all", label: `全部${subtypeLabel}` }, ...subtypeOptions]}
              textColor={subtypeFilter !== "all" ? "text-[#2b2f36]" : "text-[#a8b1bd]"}
              onChange={setSubtypeFilter}
              dropdownWidth={activeType === "internal_course" ? 310 : undefined}
            />
          </div>}
          <PaymentScopeFilters
            organizationId={organizationFilter}
            courseKey={courseFilter}
            organizations={scopeOrganizations}
            courses={dealCourseOptions}
            includeUnassignedCourse={includeUnassignedCourse}
            onOrganizationChange={setOrganizationFilter}
            onCourseChange={setCourseFilter}
          />
          <div className="w-[172px]">
            <CustomerSearchInput
              customers={customers}
              value={searchCloserName}
              onChange={(v) => handleFilterChange("closer", typeof v === "string" ? v : "")}
              placeholder="搜索成交人"
              filterSelected={false}
              className="border-[#e1e4e7] bg-white px-2.5 placeholder:text-[#a8b1bd]"
              rounded="7px"
            />
          </div>
          <button onClick={handleClearSearch} className="flex h-8 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-4 text-[12px] text-[#4e535a] hover:bg-[#f5f6f7]">
            <X className="h-3.5 w-3.5" /> 清空
          </button>
          <div className="flex-1" />
          <Button size="sm" className="h-8 bg-[#212631] text-[12px] text-white hover:bg-[#303641]" onClick={handleOpenCreate}>
            <Plus className="mr-1 h-3.5 w-3.5 text-[#a3c0ff]" /> 新增
          </Button>
        </div>

        {/* 表格 */}
        {error && <div role="alert" className="px-4 py-3 text-sm text-destructive">{error}<button type="button" className="ml-3 text-[#3370ff]" onClick={refresh}>重试</button></div>}
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : paginatedItems.length === 0 && !error ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无记录</div>
        ) : (
          <>
            <Table style={{ tableLayout: "fixed" }}>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4" style={{ width: "100px" }}>成交日期</TableHead>
                <TableHead style={{ width: "100px" }}>用户</TableHead>
                {activeType === "companion_camp" && <TableHead style={{ width: "100px" }}>陪伴老师</TableHead>}
                {activeType === "oh_card_reading" && <TableHead style={{ width: "120px" }}>诊断类型</TableHead>}
                {activeType === "oh_card_reading" && <TableHead style={{ width: "100px" }}>诊断老师</TableHead>}
                {(activeType === "all" || activeType === "membership_card" || activeType === "internal_course" || activeType === "offline_course" || activeType === "other") && <TableHead style={{ width: activeType === "offline_course" ? "120px" : "110px" }}>{activeType === "offline_course" ? "课程类型" : "项目名称"}</TableHead>}
                {activeType !== "offline_course" && (activeType !== "online_tea" && activeType !== "companion_camp") && <TableHead style={{ width: "70px" }}>{activeType === "oh_card_reading" ? "诊断时长" : activeType === "energy_knot" ? "购买部位" : activeType === "tea_seat_fee" ? "数量" : "购买场次"}</TableHead>}
                {activeType !== "oh_card_reading" && activeType !== "tea_seat_fee" && <TableHead style={{ width: "80px" }}>有效期</TableHead>}
                <TableHead style={{ width: "60px" }}>状态</TableHead>
                {activeType !== "oh_card_reading" && activeType !== "internal_course" && activeType !== "tea_seat_fee" && activeType !== "offline_course" && (activeType !== "online_tea" && activeType !== "companion_camp") && <TableHead style={{ width: "70px" }}>{activeType === "energy_knot" ? "剩余部位" : "剩余次数"}</TableHead>}
                <TableHead style={{ width: "90px" }}>成交人</TableHead>
                <TableHead style={{ width: "130px" }}>成交课程</TableHead>
                {activeType === "membership_card" && <TableHead style={{ width: "80px" }}>协议签订</TableHead>}
                <TableHead style={{ width: "100px" }}>备注</TableHead>
                <TableHead style={{ width: "50px" }}>创建人</TableHead>
                <TableHead className="text-right pr-4" style={{ width: "80px" }}>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`} className="group hover:bg-[#f7f8fa]">
                    <TableCell className="pl-4 text-[#2b2f36]">
                      <div className="truncate">{item.deal_date || <EmptyValue />}</div>

                    </TableCell>
                    <TableCell className="text-[#2b2f36] truncate" title={item.nickname}>{item.nickname}</TableCell>
                    {activeType === "companion_camp" && <TableCell className="truncate" title={item.companion_teacher}>{item.companion_teacher || <EmptyValue />}</TableCell>}
                    {activeType === "oh_card_reading" && <TableCell className="text-[#2b2f36] truncate" title={item.reading_type}>{item.reading_type || <EmptyValue />}</TableCell>}
                    {activeType === "oh_card_reading" && <TableCell className="text-[#2b2f36] truncate" title={item.diagnosis_teacher}>{item.diagnosis_teacher || <EmptyValue />}</TableCell>}
                    {(activeType === "all" || activeType === "membership_card" || activeType === "internal_course" || activeType === "offline_course" || activeType === "other") && (
                      <TableCell className="text-[#2b2f36] truncate" title={activeType === "offline_course" ? item.course_type || "" : item.type === "other" ? [item.category, item.project_name].filter(Boolean).join(" / ") : item.detail}>
                        {activeType === "offline_course" ? (item.course_type || <EmptyValue />) : item.type === "other"
                          ? [item.category, item.project_name].filter(Boolean).join(" / ") || <EmptyValue />
                          : (item.detail || <EmptyValue />)}
                      </TableCell>
                    )}
                    {activeType !== "offline_course" && (activeType !== "online_tea" && activeType !== "companion_camp") && (
                      <TableCell className="text-[#2b2f36] truncate">
                        {item.type === "oh_card_reading" && (
                          item.diagnosis_duration ? `${item.diagnosis_duration * 0.5}小时` : <EmptyValue />
                        )}
                        {(item.type === "group_case" || item.type === "emotional_release" || item.type === "energy_knot") && (
                          item.purchase_count ? `${item.purchase_count} ${item.type === "energy_knot" ? "个" : "次"}` : <EmptyValue />
                        )}
                        {item.type === "tea_seat_fee" && (
                          item.quantity ? `${item.quantity} 位` : <EmptyValue />
                        )}
                        {item.type === "membership_card" && (() => {
                          if (item.remaining_count === null || item.total_count == null) return "不限"
                          return `${item.total_count} 次`
                        })()}
                        {item.type === "other" && (
                          (item.total_count === null || item.total_count === undefined) && item.remaining_count === null ? "不限" : `${(item.total_count ?? item.remaining_count) ?? 0} 次`
                        )}
                      </TableCell>
                    )}
                    {activeType !== "oh_card_reading" && activeType !== "tea_seat_fee" && (
                      <TableCell className="text-[#2b2f36]">
                        <div className="truncate">{item.effective_date || <EmptyValue />}</div>
                        <div className="mt-1 truncate text-[12px] text-[#a8adb5]">{item.expiry_date || <EmptyValue />}</div>
                      </TableCell>
                    )}
                    <TableCell className="text-[12px] truncate">
                      {(() => {
                        const today = new Date().toLocaleDateString("sv-SE")
                        if (item.type !== "membership_card" && (item.type !== "online_tea" && item.type !== "companion_camp") && refundStatusLoading) return <span className="text-[#8f959e]">状态加载中…</span>
                        if (item.type !== "membership_card" && (item.type !== "online_tea" && item.type !== "companion_camp") && refundStatusError) return <button type="button" className="text-destructive" onClick={event => { event.stopPropagation(); refresh() }}>状态加载失败，重试</button>
                        const refunded = item.type === "membership_card"
                          ? item.voided
                          : refundedKeys.has(`${PROJECT_TYPE_TO_REFUND_KEY[item.type]}:${item.id}`)
                        if (refunded) return <span className="text-[#c4506a]">已退费</span>
                        const status = getPaymentStatus(item, today)
                        if (!status) return <EmptyValue />
                        return <span className={status === "已过期" ? "text-[#c4506a]" : status === "生效中" ? "text-[#3370ff]" : "text-[#8f959e]"}>{status}</span>
                      })()}
                    </TableCell>
                    {activeType !== "oh_card_reading" && activeType !== "internal_course" && activeType !== "tea_seat_fee" && activeType !== "offline_course" && (activeType !== "online_tea" && activeType !== "companion_camp") && <TableCell className="text-[#2b2f36] truncate">
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
                          ? `${item.effective_remaining} ${item.type === "energy_knot" ? "个" : "次"}`
                          : <EmptyValue />
                      )}
                    </TableCell>}
                    <TableCell className="text-[#2b2f36] truncate" title={item.closers?.length ? item.closers.map(c => c.name).join("、") : (item.closer_name || "")}>
                      {item.closers?.length
                        ? item.closers.map(c => c.name).join("、")
                        : (item.closer_name || <EmptyValue />)}
                    </TableCell>
                    <TableCell>
                      <div className="truncate" title={item.deal_course_name || undefined}>{item.deal_course_name || <span className="text-[#d0d3d6]">-</span>}</div>
                      <div className="mt-1 truncate text-[12px] text-[#a8adb5]" title={item.deal_course_organization_name || undefined}>{item.deal_course_organization_name || <EmptyValue />}</div>
                    </TableCell>
                    {activeType === "membership_card" && <TableCell className="text-[#2b2f36]">
                      {item.type === "membership_card" && item.card_type && !["次卡", "体验会员", "粗门次卡"].includes(item.card_type)
                        ? (item.agreement_status === "signed" ? "已签" : "未签") : <EmptyValue />}
                    </TableCell>}
                    <TableCell className="text-[#2b2f36] truncate" title={item.notes}>{item.notes || <EmptyValue />}</TableCell>
                    <TableCell className="text-[#8f959e] truncate">{item.created_by || <EmptyValue />}</TableCell>
                    <TableCell className="text-right pr-4">
                      {canManagePayment(item) && <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(item)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>}
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
      </div>}

      {/* ========== 新增/编辑弹窗 ========== */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setCoarseDoorSelected(false)
          onExternalOpenChange?.(false)
        }
      }}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{dialogTitle}</DialogTitle>
          </DialogHeader>
          {/* 项目类型固定在弹窗顶部，与管理端小程序的录入顺序一致 */}
          {!editingItem && !(filterTypes && filterTypes.length === 1) && (
            <div className="border-b border-[#ebedf0] px-6 py-4">
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-right text-[12px] font-light tracking-widest text-[#4e535a]">项目类型</span>
                <SelectDropdown
                  value={coarseDoorSelected ? "coarse_door_card" : formType}
                  options={(() => {
                    const options: { value: string; label: string }[] = (filterTypes || (Object.keys(PROJECT_TYPES) as ProjectTypeKey[])).map(key => ({
                      value: key,
                      label: PROJECT_TYPES[key].label,
                    }))
                    if (includeCoarseDoorOption) options.splice(1, 0, { value: "coarse_door_card", label: "粗门次卡" })
                    return options
                  })()}
                  placeholder="请选择项目类型"
                  onChange={(v) => {
                    if (v === "coarse_door_card") {
                      setCoarseDoorSelected(true)
                      return
                    }
                    setCoarseDoorSelected(false)
                    setFormType(v as ProjectTypeKey)
                    resetTypeFields()
                  }}
                />
              </div>
            </div>
          )}
          {coarseDoorSelected ? (
            <div className="max-h-[calc(65vh+120px)] overflow-y-auto">
              <CoarseDoorCardTab
                formOnly
                showHeader={false}
                presetCustomer={presetCustomer}
                onCancel={() => {
                  setDialogOpen(false)
                  setCoarseDoorSelected(false)
                  onExternalOpenChange?.(false)
                }}
                onSaved={() => {
                  setDialogOpen(false)
                  setCoarseDoorSelected(false)
                  onExternalOpenChange?.(false)
                  onSaved?.()
                }}
              />
            </div>
          ) : (
          <div className="px-6 py-5 space-y-4 max-h-[calc(65vh+120px)] overflow-y-auto" {...enterToNext}>
            {/* 成交日期、成交归属、成交课程 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">成交日期</span>
              <Input type="date" value={formDealDate} onChange={(e) => { setFormDealDate(e.target.value); setFormDealCourse(UNSET_DEAL_COURSE); setFormDealCourseName("") }} />
            </div>
            <div className="border-b border-[#ebedf0] ml-[19px] -mt-[2px]" style={{ borderBottomWidth: "0.5px" }} />

            {/* 会员卡类型 */}
            {formType === "membership_card" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">会员卡</span>
                <SelectDropdown
                  value={formCardType}
                  options={Object.keys(MEMBERSHIP_CARD_TYPES).map(type => ({ value: type, label: type }))}
                  placeholder="请选择会员卡"
                  onChange={(v) => handleSelectCardType(v)}
                />
              </div>
            )}

            {/* 课程类型（沙龙技能学习） */}
            {formType === "internal_course" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程类型</span>
                <SelectDropdown
                  value={formCourseType}
                  options={LEARNING_PAYMENT_OPTIONS}
                  placeholder="请选择课程"
                  onChange={(v) => { setFormCourseType(v); setFormCourseAmount(COURSE_TYPES[v]?.price || 0); setFormLearningValidityValue(String(LEARNING_DEFAULT_MONTHS)) }}
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
                    if (!name) { setFormNickname(""); setFormCustomerId(""); setFormDealCourse(UNSET_DEAL_COURSE); setFormDealCourseName("") }
                  }}
                  onSelectItem={(c) => { setFormNickname(c.nickname); setFormCustomerId(c.id); setFormDealCourse(UNSET_DEAL_COURSE); setFormDealCourseName("") }}
                  disabled={!!editingItem || !!presetCustomer}
                  showClear={!editingItem && !presetCustomer}
                  placeholder="搜索姓名或昵称"
                />
              </div>
            )}
            {formType !== "other" && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">成交课程</span>
                <PaymentCourseSelect date={formDealDate} customerId={formCustomerId} value={formDealCourse} name={formDealCourseName} onChange={(key, name) => { setFormDealCourse(key); setFormDealCourseName(name) }} />
              </div>
            )}

            {/* ===== 觉醒游戏/情绪释放/深度情绪释放专属字段 ===== */}
            {(formType === "group_case" || formType === "emotional_release" || formType === "energy_knot") && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formProjectEffectiveDate} onChange={(e) => setFormProjectEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">有效期</span>
                  <div className="flex gap-2">
                    <Input type="number" value={formProjectValidityValue} onChange={(e) => setFormProjectValidityValue(e.target.value)} placeholder="输入时长" className="h-8 text-xs flex-1" min="1" />
                    <div className="flex gap-1">
                      {DURATION_OPTIONS.map((opt) => (
                        <button key={opt.type} type="button" className={`px-3 h-8 rounded border text-[12px] transition-colors ${formProjectValidityUnit === opt.type ? "border-[#3370ff] bg-[#f0f5ff] text-[#3370ff]" : "border-[#e0e0e0] text-[#4e535a] hover:border-[#c0c0c0]"}`} onClick={() => setFormProjectValidityUnit(opt.type)}>{opt.label}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
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
            {formType === "membership_card" && formCardType && !hidePaymentDetails && (
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">费用金额</span>
                <Input type="text" inputMode="decimal" value={formPrice} onChange={(e) => setFormPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={MEMBERSHIP_CARD_TYPES[formCardType] ? `${MEMBERSHIP_CARD_TYPES[formCardType].price}` : ""} className="h-8 text-xs" />
              </div>
            )}
            {(formType === "group_case" || formType === "emotional_release" || formType === "energy_knot") && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">{formType === "energy_knot" ? "部位数" : "购买场次"}</span>
                  <Input type="number" value={formPurchaseCount} onChange={(e) => setFormPurchaseCount(e.target.value)} placeholder="0" min="0" className="h-8 text-xs" />
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0" min="0" step="0.01" className="h-8 text-xs" />
                </div>}
              </>
            )}

            {/* ===== OH卡诊断专属字段 ===== */}
            {formType === "oh_card_reading" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">诊断类型</span>
                  <SelectDropdown value={formReadingType} options={OH_READING_TYPES.map(value => ({ value, label: value }))} onChange={(value) => {
                    setFormReadingType(value)
                    if (value === "余老师情感类" || value === "余老师商业梳理") {
                      const teacher = courseTeachers.find(item => item.nickname === "余墨")
                      if (teacher) setFormDiagnosisTeacher(teacher.nickname)
                    }
                  }} placeholder="选择诊断类型" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest"><span className="text-red-500">*</span>诊断老师</span>
                  <SelectDropdown
                    value={formDiagnosisTeacher}
                    options={courseTeachers.map(c => ({ value: c.nickname, label: c.nickname }))}
                    placeholder="选择诊断老师"
                    onChange={setFormDiagnosisTeacher}
                  />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">诊断时长</span>
                  <SelectDropdown
                    value={String(formDiagnosisDuration)}
                    options={[
                      { value: "1", label: "0.5小时" },
                      { value: "2", label: "1小时" },
                      { value: "3", label: "1.5小时" },
                      { value: "4", label: "2小时" },
                      { value: "5", label: "2.5小时" },
                      { value: "6", label: "3小时" },
                    ]}
                    onChange={(v) => setFormDiagnosisDuration(parseInt(v) || 1)}
                  />
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formOhAmount} onChange={(e) => setFormOhAmount(e.target.value)} placeholder="298" min="0" step="0.01" className="h-8 text-xs" />
                </div>}
              </>
            )}

            {/* ===== 茶位费专属字段 ===== */}
            {formType === "tea_seat_fee" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">数量</span>
                  <Input type="number" value={formTeaQuantity} onChange={(e) => setFormTeaQuantity(e.target.value)} placeholder="1" min="1" step="1" className="h-8 text-xs" />
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formTeaAmount} onChange={(e) => setFormTeaAmount(e.target.value)} placeholder="68" min="0" step="0.01" className="h-8 text-xs" />
                </div>}
              </>
            )}

            {/* ===== 线下课程专属字段 ===== */}
            {(formType === "offline_course" || (formType === "online_tea" || formType === "companion_camp")) && (
              <>
                {formType === "companion_camp" && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] text-right"><span className="text-red-500">*</span>陪伴老师</span>
                  <SelectDropdown value={formCompanionTeacherId || formCompanionTeacher}
                    options={[...courseTeachers.map(c => ({ value: c.id, label: c.nickname })),
                      ...(!courseTeachers.some(c => c.id === formCompanionTeacherId) && formCompanionTeacher ? [{ value: formCompanionTeacherId || formCompanionTeacher, label: formCompanionTeacher }] : [])]}
                    placeholder="选择陪伴老师" onChange={value => {
                      const teacher = courseTeachers.find(c => c.id === value)
                      if (teacher) { setFormCompanionTeacher(teacher.nickname); setFormCompanionTeacherId(teacher.id) }
                    }} />
                </div>}
                {formType === "offline_course" && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">课程类型</span>
                  <SelectDropdown value={formCourseType} options={OFFLINE_COURSE_TYPES.map(type => ({ value: type, label: type }))} onChange={value => { setFormCourseType(value); setFormOfflineValidityValue(String(offlineCourseDefaultMonths(value))) }} placeholder="选择课程类型" />
                </div>}
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formOfflineEffectiveDate} onChange={(e) => setFormOfflineEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">有效期</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formOfflineValidityValue} onChange={(e) => setFormOfflineValidityValue(e.target.value)} placeholder="1" min="1" step="1" className="h-8 text-xs w-20" />
                    {(formType === "online_tea" || formType === "companion_camp") ? <SelectDropdown value={formOnlineTeaValidityUnit} options={[{ value: "day", label: "天" }, { value: "month", label: "月" }]} onChange={value => setFormOnlineTeaValidityUnit(value as "day" | "month")} className="w-20" /> : <span className="text-[12px] text-[#4e535a]">个月</span>}
                  </div>
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formOfflineAmount} onChange={(e) => setFormOfflineAmount(e.target.value)} placeholder="输入金额" min="0" step="0.01" className="h-8 text-xs" />
                </div>}
              </>
            )}

            {/* ===== 沙龙技能学习专属字段 ===== */}
            {formType === "internal_course" && (
              <>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">生效日期</span>
                  <Input type="date" value={formEffectiveDate} onChange={(e) => setFormEffectiveDate(e.target.value)} className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">有效期</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" value={formLearningValidityValue} onChange={(e) => setFormLearningValidityValue(e.target.value)} placeholder="12" min="1" step="1" className="h-8 text-xs w-20" />
                    <span className="text-[12px] text-[#4e535a]">个月</span>
                  </div>
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">付费金额</span>
                  <Input type="number" value={formCourseAmount || ""} onChange={(e) => setFormCourseAmount(Number(e.target.value) || 0)} placeholder="输入金额" className="h-8 text-xs" />
                </div>}
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
                      if (!name) { setFormNickname(""); setFormCustomerId(""); setFormDealCourse(UNSET_DEAL_COURSE); setFormDealCourseName("") }
                    }}
                    onSelectItem={(c) => { setFormNickname(c.nickname); setFormCustomerId(c.id); setFormDealCourse(UNSET_DEAL_COURSE); setFormDealCourseName("") }}
                    disabled={!!editingItem}
                    placeholder="搜索姓名或昵称"
                  />
                </div>
                <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">成交课程</span>
                  <PaymentCourseSelect date={formDealDate} customerId={formCustomerId} value={formDealCourse} name={formDealCourseName} onChange={(key, name) => { setFormDealCourse(key); setFormDealCourseName(name) }} />
                </div>
                {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">费用</span>
                  <Input type="number" value={formFee} onChange={(e) => setFormFee(e.target.value)} placeholder="0" className="h-8 text-xs" min="0" step="0.01" />
                </div>}
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
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest mt-2">成交人</span>
              <div>
                <CloserInput customers={customers} value={formClosers} onChange={(v) => { setFormClosers(v); if (v.length > 0) setCloserError(false) }} defaultAmount={getFormAmount()} showAmounts={!hidePaymentDetails} />
                {closerError && <span className="text-[11px] text-[#f54a45] mt-0.5 block">请选择成交人</span>}
                {!hidePaymentDetails && formClosers.length > 0 && Math.abs(formClosers.reduce((sum, c) => sum + (Number(c.amount) || 0), 0) - getFormAmount()) > 0.01 && (
                  <span className="text-[11px] text-[#f54a45] mt-0.5 block">成交人总金额与付费金额不一致</span>
                )}
              </div>
            </div>

            {/* ===== 公共字段：支付方式 ===== */}
            {needsAgreement && <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <span className="text-[12px] text-[#4e535a] text-right mt-2">协议签订</span>
              <div>
                <div role="radiogroup" aria-label="协议签订" className="flex gap-2">
                  {[["unsigned", "未签"], ["signed", "已签"]].map(([value, label]) => (
                    <button key={value} type="button" role="radio" aria-checked={formAgreementStatus === value}
                      onClick={() => { setFormAgreementStatus(value); setAgreementError(false) }}
                      className="inline-flex h-8 items-center gap-2 rounded px-2 text-xs text-[#4e535a] hover:bg-[#f7f8fa] focus-visible:outline-2 focus-visible:outline-[#3370ff]">
                      <span aria-hidden className={`flex size-3.5 items-center justify-center rounded-full border ${formAgreementStatus === value ? "border-[#3370ff]" : "border-[#c9cdd4]"}`}>{formAgreementStatus === value && <span className="size-1.5 rounded-full bg-[#3370ff]" />}</span>{label}</button>
                  ))}
                </div>
                {agreementError && <span className="text-xs text-red-500">请选择协议签订状态</span>}
              </div>
            </div>}
            {!hidePaymentDetails && <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">支付方式</span>
              <SelectDropdown
                value={formPaymentMethod}
                options={[
                  { value: "支付宝", label: "支付宝" },
                  { value: "微信", label: "微信" },
                  { value: "其他", label: "其他" },
                ]}
                placeholder="请选择"
                onChange={setFormPaymentMethod}
              />
            </div>}

            {/* ===== 公共字段：备注 ===== */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">备注</span>
              <Input type="text" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="额外信息（可选）" className="h-8 text-xs" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !formCustomerId}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 二次确认弹窗 */}
      <Dialog open={confirmOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-sm p-0 gap-0" showCloseButton={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingItem ? "确认编辑" : "确认新增"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            {!hidePaymentDetails && <p className="text-[12px] text-[#8f959e]">成交人金额合计需与费用金额一致</p>}
            {confirmContent.map((row, i) => (
              <div key={i} className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#8f959e] font-light text-right tracking-widest">{row.label}</span>
                <span className={`text-[12px] pl-2.5 ${row.value === "-" ? "text-[#c0c4cc]" : "text-[#2b2f36]"}`}>{row.value === "-" ? "-" : row.value}</span>
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
            <AlertDialogDescription>系统中暂无组织信息，请先前往组织信息页面配置组织。</AlertDialogDescription>
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
              有 <span className="text-[#f5a623] font-medium">{pendingImport?.duplicates.length}</span> 条记录与系统中已有数据重复（相同用户、类型和日期），
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
