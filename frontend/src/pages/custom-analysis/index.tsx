import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, GripVertical, Plus, Save, Trash2, X } from "lucide-react"

import { PaginationBar } from "@/components/pagination-bar"
import { SelectDropdown } from "@/components/select-dropdown"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import DetailView from "@/pages/healing-records/components/detail-view"
import {
  customAnalysisApi,
  type AnalysisCondition,
  type AnalysisField,
  type AnalysisMetadata,
  type AnalysisMetric,
  type AnalysisOperator,
  type AnalysisPlan,
  type AnalysisResult,
  type AnalysisTemplate,
} from "@/lib/api"

const VALUELESS_OPERATORS = new Set<AnalysisOperator>(["is_empty", "is_not_empty"])
const NUMBER_FIELDS = new Set<AnalysisField>([
  "age", "invitation_count", "visit_count", "activity_count", "communication_count",
  "total_consumption", "invitation_count_period", "visit_count_period", "cancelled_count_period",
  "activity_count_period", "payment_count_period", "payment_amount_period",
])

const FALLBACK_FIELD_LABELS: Partial<Record<AnalysisField, string>> = {
  nickname: "昵称",
  member_type: "会员身份",
  follow_up_status: "跟进阶段",
  customer_tags: "客户标签",
  traffic_source: "流量来源",
  referrer: "引流人",
  referrer_handler: "承接人",
  service_teacher: "服务老师",
  created_by: "客户录入人",
  referral_date: "引流日期",
  created_at: "创建日期",
  invitation_dates: "邀约日期",
  inviter_names: "邀约人",
  invitation_count_period: "期间邀约次数",
  visit_count_period: "期间到场次数",
  activity_count_period: "期间参与活动",
  payment_projects: "具体付费产品",
  payment_closers: "成交人",
  payment_count_period: "期间成交单数",
  payment_amount_period: "期间成交金额",
  payment_dates: "成交日期",
  course_teachers: "课程老师",
}

function monthRange() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const lastDay = String(new Date(year, now.getMonth() + 1, 0).getDate()).padStart(2, "0")
  return { date_from: `${year}-${month}-01`, date_to: `${year}-${month}-${lastDay}` }
}

function weekRange() {
  const now = new Date()
  const mondayOffset = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset)
  const formatLocalDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
  return { date_from: formatLocalDate(monday), date_to: formatLocalDate(now) }
}

function todayRange() {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  return { date_from: today, date_to: today }
}

function selectedMonthRange(value: string) {
  const [year, month] = value.split("-").map(Number)
  if (!year || !month) return null
  const lastDay = new Date(year, month, 0).getDate()
  return {
    date_from: `${year}-${String(month).padStart(2, "0")}-01`,
    date_to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  }
}

function selectedPeriodValue(dateFrom: string, dateTo: string) {
  const selectedMonth = dateFrom && dateFrom.slice(0, 7) === dateTo.slice(0, 7)
    && selectedMonthRange(dateFrom.slice(0, 7))?.date_from === dateFrom
    && selectedMonthRange(dateFrom.slice(0, 7))?.date_to === dateTo
    ? dateFrom.slice(0, 7)
    : ""
  const selectedYear = dateFrom && dateTo
    && dateFrom === `${dateFrom.slice(0, 4)}-01-01`
    && dateTo === `${dateFrom.slice(0, 4)}-12-31`
    ? dateFrom.slice(0, 4)
    : ""
  return selectedYear ? `year-${selectedYear}` : selectedMonth ? `month-${selectedMonth}` : ""
}

function AnalysisDatePicker({ value, onChange, ariaLabel }: { value: string; onChange: (value: string) => void; ariaLabel: string }) {
  const today = new Date()
  const todayValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  const [open, setOpen] = useState(false)
  const [viewMonth, setViewMonth] = useState(() => value.slice(0, 7) || todayValue.slice(0, 7))
  const [position, setPosition] = useState<React.CSSProperties>({})
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) setViewMonth(value.slice(0, 7) || todayValue.slice(0, 7))
  }, [open, todayValue, value])

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const width = 280
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      const spaceBelow = window.innerHeight - rect.bottom
      setPosition(spaceBelow >= 330
        ? { left, top: rect.bottom + 4, width }
        : { bottom: window.innerHeight - rect.top + 4, left, width })
    }
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const clickedDropdown = event.composedPath().some(node => node instanceof HTMLElement && node.hasAttribute("data-dropdown"))
      if (clickedDropdown) return
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    updatePosition()
    document.addEventListener("mousedown", closeOnOutsideClick)
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick)
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open])

  const [year, month] = viewMonth.split("-").map(Number)
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells = [...Array.from({ length: firstWeekday }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)]
  const yearOptions = useMemo(
    () => Array.from({ length: 26 }, (_, index) => today.getFullYear() + 1 - index).map(item => ({ value: String(item), label: `${item}年` })),
    [today],
  )
  const calendarMonthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ value: String(index + 1).padStart(2, "0"), label: `${index + 1}月` })),
    [],
  )
  const moveMonth = (offset: number) => {
    const next = new Date(year, month - 1 + offset, 1)
    setViewMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`)
  }
  const displayValue = value
    ? `${value.slice(0, 4)}年${Number(value.slice(5, 7))}月${Number(value.slice(8, 10))}日`
    : "选择日期"

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        onClick={() => setOpen(current => !current)}
        className={`flex h-7 w-[132px] shrink-0 items-center gap-1 rounded-[4px] border border-[#e1e4e7] bg-white px-2 text-left text-[11px] ${value ? "text-[#2b2f36]" : "text-[#8f959e]"}`}
      >
        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#8f959e]" />
        <span className="min-w-0 flex-1 truncate">{displayValue}</span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-[#8f959e] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div ref={panelRef} className="fixed z-[2147483646] rounded-[6px] border border-[#e1e4e7] bg-white p-3 shadow-[0_8px_24px_rgba(31,35,41,0.14)]" style={position}>
          <div className="mb-2.5 flex items-center gap-1.5">
            <button type="button" onClick={() => moveMonth(-1)} className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#646a73] hover:bg-[#f5f6f7]" aria-label="上个月"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <SelectDropdown value={String(year)} options={yearOptions} onChange={next => setViewMonth(`${next}-${String(month).padStart(2, "0")}`)} size="sm" className="w-[92px]" buttonClassName="!h-7 !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" dropdownWidth={104} menuMaxHeight={260} />
            <SelectDropdown value={String(month).padStart(2, "0")} options={calendarMonthOptions} onChange={next => setViewMonth(`${year}-${next}`)} size="sm" className="w-[72px]" buttonClassName="!h-7 !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" dropdownWidth={80} menuMaxHeight={260} />
            <button type="button" onClick={() => moveMonth(1)} className="ml-auto flex h-7 w-7 items-center justify-center rounded-[3px] text-[#646a73] hover:bg-[#f5f6f7]" aria-label="下个月"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 border-b border-[#f0f0f0] pb-1">
            {["日", "一", "二", "三", "四", "五", "六"].map(weekday => <div key={weekday} className="flex h-6 items-center justify-center text-[10px] text-[#8f959e]">{weekday}</div>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {cells.map((day, index) => {
              if (!day) return <span key={`empty-${index}`} className="h-7" />
              const dateValue = `${viewMonth}-${String(day).padStart(2, "0")}`
              const selected = dateValue === value
              const isToday = dateValue === todayValue
              return <button key={dateValue} type="button" onClick={() => { onChange(dateValue); setOpen(false) }} className={`flex h-7 items-center justify-center rounded-[3px] text-[11px] ${selected ? "bg-[#3370ff] text-white" : isToday ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#2b2f36] hover:bg-[#f5f6f7]"}`}>{day}</button>
            })}
          </div>
          <div className="mt-2 flex justify-end border-t border-[#f0f0f0] pt-2">
            <button type="button" onClick={() => { onChange(todayValue); setOpen(false) }} className="h-6 px-2 text-[11px] text-[#3370ff] hover:text-[#285dcc]">今天</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

function defaultPlan(): AnalysisPlan {
  return {
    title: "自助分析结果",
    total_card_title: "符合条件人数",
    conditions: [],
    condition_logic: "all",
    ...monthRange(),
    metrics: ["total_customers"],
    card_metric: "total_customers",
    card_dimension: "none",
    columns: [
      "nickname", "member_type", "follow_up_status", "referrer", "inviter_names",
      "invitation_count_period", "visit_count_period", "payment_projects", "payment_amount_period",
    ],
    sort_by: "referral_date",
    sort_order: "desc",
    analysis_mode: "single",
    comparison_groups: [],
  }
}

function comparisonGroupId() {
  return `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createComparisonGroup(name: string, source?: AnalysisPlan["comparison_groups"][number]): AnalysisPlan["comparison_groups"][number] {
  const range = source ? { date_from: source.date_from, date_to: source.date_to } : monthRange()
  return {
    id: comparisonGroupId(),
    name,
    conditions: source?.conditions.map(condition => ({
      ...condition,
      value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
    })) ?? [],
    condition_logic: source?.condition_logic ?? "all",
    ...range,
  }
}

const EmptyLine = () => <span className="inline-block h-[2px] w-[8px] rounded-full bg-[#e5e8eb] align-middle" />

function clonePlan(plan: AnalysisPlan): AnalysisPlan {
  const metrics = plan.metrics.filter(metric => metric !== "created_customers")
  return {
    ...plan,
    conditions: plan.conditions.map(condition => ({
      ...condition,
      value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
    })),
    analysis_mode: plan.analysis_mode ?? "single",
    comparison_groups: (plan.comparison_groups ?? []).map(group => ({
      ...group,
      id: group.id || comparisonGroupId(),
      conditions: group.conditions.map(condition => ({
        ...condition,
        value: Array.isArray(condition.value) ? [...condition.value] : condition.value,
      })),
    })),
    metrics: metrics.length ? metrics : ["total_customers"],
    card_metric: plan.card_metric === "created_customers" ? "total_customers" : plan.card_metric,
    columns: [...plan.columns],
  }
}

function conditionValueText(condition: AnalysisCondition): string {
  if (condition.inherit_period) return ""
  if (VALUELESS_OPERATORS.has(condition.operator)) return ""
  if (Array.isArray(condition.value)) return condition.value.join("，")
  return String(condition.value ?? "")
}

function renderValue(field: AnalysisField, value: unknown) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return <EmptyLine />
  if (field === "total_consumption" || field === "payment_amount_period") {
    return `¥${Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`
  }
  if (["invitation_count", "visit_count", "communication_count", "invitation_count_period", "visit_count_period", "cancelled_count_period"].includes(field)) return `${value}次`
  if (["activity_count", "activity_count_period"].includes(field)) return `${value}场`
  if (field === "payment_count_period") return `${value}单`
  return Array.isArray(value) ? value.join("、") : String(value)
}

function formatMetricValue(value: number, valueFormat: "number" | "currency", unit: string, signed = false) {
  const prefix = value < 0 ? "-" : signed && value > 0 ? "+" : ""
  const formatted = Math.abs(Number(value)).toLocaleString("zh-CN", { maximumFractionDigits: 2 })
  if (valueFormat === "currency") return `${prefix}¥${formatted}`
  return `${prefix}${formatted}${unit ? ` ${unit}` : ""}`
}

export default function CustomAnalysisPage() {
  const [metadata, setMetadata] = useState<AnalysisMetadata | null>(null)
  const [plan, setPlan] = useState<AnalysisPlan>(defaultPlan)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [templates, setTemplates] = useState<AnalysisTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState("")
  const [executing, setExecuting] = useState(false)
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [templateDescription, setTemplateDescription] = useState("")
  const [templateScope, setTemplateScope] = useState<"private" | "shared">("private")
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<AnalysisTemplate | null>(null)
  const [draggedColumnIndex, setDraggedColumnIndex] = useState<number | null>(null)

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}") as { id?: string; role?: string }
    } catch {
      return {}
    }
  }, [])

  const refreshTemplates = async () => {
    try {
      setTemplates(await customAnalysisApi.listTemplates())
    } catch {
      setTemplates([])
    }
  }

  useEffect(() => {
    Promise.all([customAnalysisApi.metadata(), customAnalysisApi.listTemplates()])
      .then(([nextMetadata, nextTemplates]) => {
        setMetadata(nextMetadata)
        setTemplates(nextTemplates)
      })
      .catch(requestError => setError(requestError instanceof Error ? requestError.message : "分析配置加载失败"))
      .finally(() => setMetadataLoading(false))
  }, [])

  const fieldLabels = useMemo(() => ({
    ...FALLBACK_FIELD_LABELS,
    ...(metadata ? Object.fromEntries(metadata.fields.map(item => [item.value, item.label])) : {}),
  }) as Record<AnalysisField, string>, [metadata])
  const operatorLabels = useMemo(() => Object.fromEntries((metadata?.operators ?? []).map(item => [item.value, item.label])) as Partial<Record<AnalysisOperator, string>>, [metadata])
  const fieldByName = useMemo(() => new Map((metadata?.fields ?? []).map(field => [field.value, field])), [metadata])
  const groupedFieldOptions = useMemo(() => {
    const groups = new Map<string, Array<{ value: string; label: string }>>()
    for (const field of metadata?.fields ?? []) {
      const items = groups.get(field.group) ?? []
      items.push({ value: field.value, label: field.label })
      groups.set(field.group, items)
    }
    return [...groups.entries()].map(([group, children]) => ({ value: `group-${group}`, label: group, children }))
  }, [metadata])
  const columnOptions = useMemo(() => (metadata?.fields ?? []).map(field => ({ value: field.value, label: field.label })), [metadata])
  const periodOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 10 }, (_, index) => currentYear + 1 - index).flatMap(year => [
      { value: `year-${year}`, label: `${year}年全年` },
      {
        value: `months-${year}`,
        label: `${year}年按月`,
        children: Array.from({ length: 12 }, (_, monthIndex) => {
        const month = String(monthIndex + 1).padStart(2, "0")
          return { value: `month-${year}-${month}`, label: `${year}年${monthIndex + 1}月` }
        }),
      },
    ])
  }, [])
  const selectedTemplate = templates.find(template => template.id === selectedTemplateId)
  const canManageSelectedTemplate = !!selectedTemplate && (selectedTemplate.created_by_id === currentUser.id || currentUser.role === "超级管理员")

  const validateComparisonGroups = (targetPlan: AnalysisPlan) => {
    if (targetPlan.analysis_mode !== "comparison" || targetPlan.comparison_groups.every(group => group.name.trim())) return true
    setError("请填写完整的对比组名称")
    return false
  }

  const setAnalysisMode = (mode: AnalysisPlan["analysis_mode"]) => {
    setResult(null)
    setPlan(current => {
      if (mode === "single") return { ...current, analysis_mode: mode }
      if (current.comparison_groups.length >= 2) return { ...current, analysis_mode: mode }
      const source = {
        id: "",
        name: "",
        conditions: current.conditions,
        condition_logic: current.condition_logic,
        date_from: current.date_from,
        date_to: current.date_to,
      }
      const first = createComparisonGroup("对比组 A", source)
      const second = createComparisonGroup("对比组 B", source)
      return { ...current, analysis_mode: mode, comparison_groups: [first, second] }
    })
  }

  const updateComparisonGroup = (groupIndex: number, patch: Partial<AnalysisPlan["comparison_groups"][number]>) => {
    setPlan(current => ({
      ...current,
      comparison_groups: current.comparison_groups.map((group, index) => index === groupIndex ? { ...group, ...patch } : group),
    }))
  }

  const updateComparisonCondition = (groupIndex: number, conditionIndex: number, patch: Partial<AnalysisCondition>) => {
    setPlan(current => ({
      ...current,
      comparison_groups: current.comparison_groups.map((group, index) => index === groupIndex ? {
        ...group,
        conditions: group.conditions.map((condition, innerIndex) => innerIndex === conditionIndex ? { ...condition, ...patch } : condition),
      } : group),
    }))
  }

  const addComparisonCondition = (groupIndex: number) => {
    const field = metadata?.fields[0]
    if (!field) return
    setPlan(current => ({
      ...current,
      comparison_groups: current.comparison_groups.map((group, index) => index === groupIndex ? {
        ...group,
        conditions: [...group.conditions, { field: field.value, operator: field.operators[0] ?? "eq", value: "", inherit_period: false }],
      } : group),
    }))
  }

  const copyComparisonGroup = (groupIndex: number) => {
    setPlan(current => {
      if (current.comparison_groups.length >= 4) return current
      const source = current.comparison_groups[groupIndex]
      const copy = createComparisonGroup(`对比组 ${String.fromCharCode(65 + current.comparison_groups.length)}`, source)
      return { ...current, comparison_groups: [...current.comparison_groups, copy] }
    })
  }

  const removeComparisonGroup = (groupIndex: number) => {
    setPlan(current => current.comparison_groups.length <= 2 ? current : {
      ...current,
      comparison_groups: current.comparison_groups.filter((_, index) => index !== groupIndex),
    })
  }

  const execute = async (nextPlan = plan, page = 1) => {
    if (!validateComparisonGroups(nextPlan)) return
    const conditionGroups = nextPlan.analysis_mode === "comparison"
      ? nextPlan.comparison_groups.map(group => ({ name: group.name, conditions: group.conditions }))
      : [{ name: "当前筛选", conditions: nextPlan.conditions }]
    const incompleteGroup = conditionGroups.find(group => group.conditions.some(condition => !condition.inherit_period && !VALUELESS_OPERATORS.has(condition.operator) && (
      condition.value === "" || condition.value === null || (Array.isArray(condition.value) && condition.value.some(item => !item))
    )))
    const incomplete = incompleteGroup?.conditions.find(condition => !condition.inherit_period && !VALUELESS_OPERATORS.has(condition.operator) && (
      condition.value === "" || condition.value === null || (Array.isArray(condition.value) && condition.value.some(item => !item))
    ))
    if (incomplete) {
      setError(`${incompleteGroup?.name}：请填写“${fieldLabels[incomplete.field]}”的筛选值`)
      return
    }
    setExecuting(true)
    setError("")
    try {
      const data = await customAnalysisApi.execute(nextPlan, page, 20)
      setResult(data)
      setPlan(clonePlan(data.plan))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "查询失败，请稍后重试")
    } finally {
      setExecuting(false)
    }
  }

  const sortResults = (field: AnalysisField) => {
    if (field === "nickname" || executing) return
    const nextPlan: AnalysisPlan = {
      ...plan,
      sort_by: field,
      sort_order: plan.sort_by === field && plan.sort_order === "asc" ? "desc" : "asc",
    }
    setPlan(nextPlan)
    void execute(nextPlan, 1)
  }

  const addCondition = () => {
    const field = metadata?.fields[0]
    if (!field) return
    setPlan(current => ({ ...current, conditions: [...current.conditions, { field: field.value, operator: field.operators[0] ?? "eq", value: "" }] }))
  }

  const updateCondition = (index: number, patch: Partial<AnalysisCondition>) => {
    setPlan(current => ({ ...current, conditions: current.conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition) }))
  }

  const updateConditionField = (index: number, field: AnalysisField) => {
    const definition = fieldByName.get(field)
    const operator = definition?.operators[0] ?? "eq"
    updateCondition(index, { field, operator, value: VALUELESS_OPERATORS.has(operator) ? null : "", inherit_period: false })
  }

  const removeCondition = (index: number) => setPlan(current => ({ ...current, conditions: current.conditions.filter((_, conditionIndex) => conditionIndex !== index) }))

  const toggleMetric = (metric: AnalysisMetric) => {
    setPlan(current => {
      const selected = current.metrics.includes(metric)
      if (selected && current.metrics.length === 1) return current
      return { ...current, metrics: selected ? current.metrics.filter(item => item !== metric) : [...current.metrics, metric] }
    })
  }

  const reorderColumn = (index: number, target: number) => {
    if (target < 0 || target >= plan.columns.length || index === target) return
    const next = [...plan.columns]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setPlan(current => ({ ...current, columns: next }))
  }

  const loadTemplate = async (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find(item => item.id === templateId)
    if (!template) return
    setPlan(clonePlan(template.plan))
    setResult(null)
    setError("")
    customAnalysisApi.markTemplateUsed(templateId).then(refreshTemplates).catch(() => {})
  }

  const createTemplate = async () => {
    if (!templateName.trim() || !validateComparisonGroups(plan)) return
    setSavingTemplate(true)
    setError("")
    try {
      const created = await customAnalysisApi.createTemplate({
        name: templateName.trim(),
        description: templateDescription.trim(),
        scope: templateScope,
        plan,
      })
      await refreshTemplates()
      setSelectedTemplateId(created.id)
      setSaveOpen(false)
      setTemplateName("")
      setTemplateDescription("")
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板保存失败")
    } finally {
      setSavingTemplate(false)
    }
  }

  const updateSelectedTemplate = async () => {
    if (!selectedTemplate || !canManageSelectedTemplate || !validateComparisonGroups(plan)) return
    setSavingTemplate(true)
    setError("")
    try {
      await customAnalysisApi.updateTemplate(selectedTemplate.id, { plan })
      await refreshTemplates()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板更新失败")
    } finally {
      setSavingTemplate(false)
    }
  }

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return
    try {
      await customAnalysisApi.deleteTemplate(templateToDelete.id)
      if (selectedTemplateId === templateToDelete.id) setSelectedTemplateId("")
      setTemplateToDelete(null)
      await refreshTemplates()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "模板删除失败")
    }
  }

  const setDatePreset = (preset: "today" | "week" | "month" | "year" | "all") => {
    const now = new Date()
    if (preset === "today") setPlan(current => ({ ...current, ...todayRange() }))
    if (preset === "week") setPlan(current => ({ ...current, ...weekRange() }))
    if (preset === "month") setPlan(current => ({ ...current, ...monthRange() }))
    if (preset === "year") setPlan(current => ({ ...current, date_from: `${now.getFullYear()}-01-01`, date_to: `${now.getFullYear()}-12-31` }))
    if (preset === "all") setPlan(current => ({ ...current, date_from: "", date_to: "" }))
  }

  const setSelectedMonth = (value: string) => {
    const range = selectedMonthRange(value)
    if (range) setPlan(current => ({ ...current, ...range }))
  }

  const setSelectedYear = (value: string) => {
    const year = Number(value)
    if (!year) return
    setPlan(current => ({ ...current, date_from: `${year}-01-01`, date_to: `${year}-12-31` }))
  }

  const setSelectedPeriod = (value: string) => {
    if (value.startsWith("year-")) {
      setSelectedYear(value.slice(5))
      return
    }
    if (value.startsWith("month-")) setSelectedMonth(value.slice(6))
  }

  const setComparisonPeriod = (groupIndex: number, value: string) => {
    if (value.startsWith("year-")) {
      const year = value.slice(5)
      updateComparisonGroup(groupIndex, { date_from: `${year}-01-01`, date_to: `${year}-12-31` })
      return
    }
    if (value.startsWith("month-")) {
      const range = selectedMonthRange(value.slice(6))
      if (range) updateComparisonGroup(groupIndex, range)
    }
  }

  const setComparisonPreset = (groupIndex: number, preset: "today" | "week" | "month" | "year" | "all") => {
    const now = new Date()
    if (preset === "today") updateComparisonGroup(groupIndex, todayRange())
    if (preset === "week") updateComparisonGroup(groupIndex, weekRange())
    if (preset === "month") updateComparisonGroup(groupIndex, monthRange())
    if (preset === "year") updateComparisonGroup(groupIndex, { date_from: `${now.getFullYear()}-01-01`, date_to: `${now.getFullYear()}-12-31` })
    if (preset === "all") updateComparisonGroup(groupIndex, { date_from: "", date_to: "" })
  }

  const renderConditionValue = (condition: AnalysisCondition, index: number, groupIndex?: number) => {
    const definition = fieldByName.get(condition.field)
    const owner = groupIndex === undefined ? plan : plan.comparison_groups[groupIndex]
    const updateValue = (patch: Partial<AnalysisCondition>) => groupIndex === undefined
      ? updateCondition(index, patch)
      : updateComparisonCondition(groupIndex, index, patch)
    const ownerDateSummary = owner.date_from && owner.date_to
      ? `${owner.date_from.replaceAll("-", ".")}–${owner.date_to.replaceAll("-", ".")}`
      : owner.date_from ? `${owner.date_from.replaceAll("-", ".")} 起`
        : owner.date_to ? `截至 ${owner.date_to.replaceAll("-", ".")}` : "全部时间"
    if (condition.inherit_period && definition?.value_type === "date") {
      return (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="flex h-7 min-w-0 flex-1 items-center rounded-[4px] border border-[#b9cdf8] bg-[#f7faff] px-2 text-[11px] text-[#3370ff]">
            <span className="truncate">跟随统计周期 · {ownerDateSummary}</span>
          </span>
          <button
            type="button"
            onClick={() => updateValue({ inherit_period: false, operator: "between", value: [owner.date_from, owner.date_to] })}
            className="h-7 shrink-0 px-1.5 text-[11px] text-[#646a73] hover:text-[#3370ff]"
          >
            单独设置
          </button>
        </div>
      )
    }
    if (VALUELESS_OPERATORS.has(condition.operator)) return null
    const values = Array.isArray(condition.value) ? condition.value.map(String) : []
    const inheritPeriodButton = definition?.value_type === "date" ? (
      <button
        type="button"
        onClick={() => updateValue({ inherit_period: true, operator: "between", value: null })}
        className="h-7 shrink-0 rounded-[3px] px-2 text-[11px] text-[#3370ff] hover:bg-[#f0f5ff]"
      >
        跟随统计周期
      </button>
    ) : null
    if (condition.operator === "between") {
      if (definition?.value_type === "date") {
        return (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <AnalysisDatePicker value={values[0] ?? ""} onChange={value => updateValue({ value: [value, values[1] ?? ""] })} ariaLabel={`${definition.label}开始日期`} />
            <span className="text-[11px] text-[#8f959e]">至</span>
            <AnalysisDatePicker value={values[1] ?? ""} onChange={value => updateValue({ value: [values[0] ?? "", value] })} ariaLabel={`${definition.label}结束日期`} />
            {inheritPeriodButton}
          </div>
        )
      }
      const inputType = definition?.value_type === "number" ? "number" : "text"
      return (
        <div className="flex h-7 min-w-0 flex-1 items-center rounded-[4px] border border-transparent bg-transparent hover:border-[#e1e4e7] focus-within:border-[#b9cdf8] focus-within:bg-white">
          <input type={inputType} value={values[0] ?? ""} onChange={event => updateValue({ value: [event.target.value, values[1] ?? ""] })} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" />
          <span className="text-[11px] text-[#8f959e]">至</span>
          <input type={inputType} value={values[1] ?? ""} onChange={event => updateValue({ value: [values[0] ?? "", event.target.value] })} className="h-full min-w-0 flex-1 border-0 bg-transparent px-2 text-[12px] text-[#2b2f36] outline-none" />
        </div>
      )
    }
    if (definition?.value_type === "date") {
      return <div className="flex min-w-0 flex-1 items-center gap-1.5"><AnalysisDatePicker value={conditionValueText(condition)} onChange={value => updateValue({ value })} ariaLabel={definition.label} />{inheritPeriodButton}</div>
    }
    if (definition?.options.length) {
      const options = definition.options.map(value => ({ value, label: value }))
      return condition.operator === "in" ? (
        <SelectDropdown value={values} options={options} onChange={value => updateValue({ value })} multi singleLineMulti size="sm" className="min-w-0 flex-1" buttonClassName="!h-7 !border-transparent !bg-transparent !px-2 !text-[12px] hover:!border-[#e1e4e7]" dropdownWidth={220} />
      ) : (
        <SelectDropdown value={conditionValueText(condition)} options={options} onChange={value => updateValue({ value })} size="sm" className="min-w-0 flex-1" buttonClassName="!h-7 !border-transparent !bg-transparent !px-2 !text-[12px] hover:!border-[#e1e4e7]" dropdownWidth={220} />
      )
    }
    return (
      <Input
        type={definition?.value_type === "number" ? "number" : "text"}
        value={conditionValueText(condition)}
        onChange={event => updateValue({ value: NUMBER_FIELDS.has(condition.field) && event.target.value !== "" ? Number(event.target.value) : event.target.value })}
        className="h-7 min-w-0 flex-1 rounded-[4px] border-transparent bg-transparent px-2 text-[12px] font-normal shadow-none hover:border-[#e1e4e7] focus-visible:border-[#b9cdf8] focus-visible:bg-white focus-visible:ring-0"
      />
    )
  }

  const columns = result?.plan.columns ?? plan.columns
  const currentPage = result?.page ?? 1
  const totalPages = result?.total_pages ?? 1
  const totalItems = result?.total ?? 0
  const startIndex = totalItems ? (currentPage - 1) * 20 + 1 : 0
  const endIndex = Math.min(currentPage * 20, totalItems)

  const datePreset = (() => {
    const currentDay = todayRange()
    const currentWeek = weekRange()
    const currentMonth = monthRange()
    const now = new Date()
    if (!plan.date_from && !plan.date_to) return "all"
    if (plan.date_from === currentDay.date_from && plan.date_to === currentDay.date_to) return "today"
    if (plan.date_from === currentWeek.date_from && plan.date_to === currentWeek.date_to) return "week"
    if (plan.date_from === currentMonth.date_from && plan.date_to === currentMonth.date_to) return "month"
    if (plan.date_from === `${now.getFullYear()}-01-01` && plan.date_to === `${now.getFullYear()}-12-31`) return "year"
    return "custom"
  })()
  const dateSummary = plan.date_from && plan.date_to ? `${plan.date_from.replaceAll("-", ".")}–${plan.date_to.replaceAll("-", ".")}` : "全部时间"
  const selectedPeriod = selectedPeriodValue(plan.date_from, plan.date_to)
  const querySummary = plan.analysis_mode === "comparison"
    ? `${plan.comparison_groups.length} 个对比组 · ${plan.metrics.length} 项共用指标`
    : `${dateSummary} · ${plan.conditions.length} 个条件 · ${plan.metrics.length} 项总数 · ${plan.columns.length} 列`
  const metricCards = result?.cards.filter(card => !card.key.startsWith("dimension-")) ?? []
  const dimensionCards = result?.cards.filter(card => card.key.startsWith("dimension-")) ?? []
  const dimensionLabel = metadata?.card_dimensions.find(item => item.value === result?.plan.card_dimension)?.label ?? "分组"
  const dimensionMetricLabel = metadata?.metrics.find(item => item.value === result?.plan.card_metric)?.label ?? "符合条件人数"
  const splitHint = plan.card_dimension === "purchased_projects"
    ? plan.card_metric === "payment_amount" || plan.card_metric === "payment_orders"
      ? "每笔成交只归入对应项目，各项目合计与总数一致"
      : "同一客户购买多个项目时会分别计入对应分组"
    : "每组单独出一张卡"

  if (metadataLoading) return <div className="py-16 text-center text-sm text-muted-foreground">正在加载可用筛选项...</div>

  return (
    <div className="min-h-full w-full bg-[#f7f8fa] px-2.5 pb-6 pt-2.5 text-[#2b2f36]">
      <section className="w-full overflow-hidden rounded-[4px] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-[0.5px] border-[#f0f0f0] px-[22px] py-4">
          <div>
            <h1 className="text-[16px] font-medium leading-6 text-[#1f2329]">自定义筛选</h1>
            <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">找出符合条件的客户，看他们的邀约、到店和成交情况</p>
          </div>
          <div className="flex min-h-8 flex-wrap items-center justify-end gap-2">
            <span className="text-[12px] text-[#8f959e]">模板</span>
            <SelectDropdown
              value={selectedTemplateId}
              options={templates.map(template => ({ value: template.id, label: template.name, rightLabel: `${template.created_by_name || "未知"} · ${template.scope === "shared" ? "共享" : "个人"} · 使用过 ${template.use_count} 次` }))}
              onChange={loadTemplate}
              placeholder={templates.length ? "选择已保存模板" : "还没有保存过"}
              className="w-[180px]"
              buttonClassName="!h-8 !rounded-[4px] !border !border-[#dee0e3] !bg-white !shadow-none"
              dropdownWidth={330}
              clearable
            />
            {canManageSelectedTemplate && <Button variant="outline" size="sm" onClick={updateSelectedTemplate} disabled={savingTemplate} className="h-8 rounded-[4px] border border-[#dee0e3] bg-white px-3 text-[12px] font-normal text-[#4e535a] shadow-none hover:bg-[#f5f6f7]">更新模板</Button>}
            <Button variant="outline" size="sm" onClick={() => {
              if (!validateComparisonGroups(plan)) return
              setTemplateName("")
              setTemplateDescription("")
              setTemplateScope("private")
              setSaveOpen(true)
            }} className="h-8 rounded-[4px] border border-[#dee0e3] bg-white px-3 text-[12px] font-normal text-[#4e535a] shadow-none hover:bg-[#f5f6f7]"><Save className="mr-1 h-3.5 w-3.5" />保存模板</Button>
            {canManageSelectedTemplate && <Button variant="ghost" size="sm" onClick={() => setTemplateToDelete(selectedTemplate ?? null)} className="h-8 w-8 rounded-[4px] p-0 shadow-none hover:bg-[#fff4f4]"><Trash2 className="h-3.5 w-3.5 text-[#d85b65]" /></Button>}
          </div>
        </div>

        {error && <div className="mx-[22px] mt-3 rounded-[4px] border border-[#f1d9dc] bg-[#fff8f8] px-3 py-2 text-[12px] text-[#b94a58]">{error}</div>}

        <div className="space-y-3 px-[22px] py-3">
          <div className="flex items-center gap-1 rounded-[4px] bg-[#f7f8fa] p-1">
            <button type="button" onClick={() => setAnalysisMode("single")} className={`h-7 rounded-[3px] px-3 text-[12px] ${plan.analysis_mode === "single" ? "bg-white text-[#1f2329] shadow-[0_1px_3px_rgba(31,35,41,0.08)]" : "text-[#646a73]"}`}>单组筛选</button>
            <button type="button" onClick={() => setAnalysisMode("comparison")} className={`h-7 rounded-[3px] px-3 text-[12px] ${plan.analysis_mode === "comparison" ? "bg-white text-[#3370ff] shadow-[0_1px_3px_rgba(31,35,41,0.08)]" : "text-[#646a73]"}`}>方案对比</button>
            <span className="ml-2 text-[11px] text-[#8f959e]">方案对比支持每组使用不同日期和不同筛选条件</span>
          </div>
          {plan.analysis_mode === "single" ? <div>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#3370ff]">① 筛选客户</span>
            </div>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-[4px] bg-[#f7f8fa] px-2.5 py-2">
              <div className="mr-1 min-w-[190px]">
                <div className="text-[12px] font-medium text-[#4e535a]">统计周期</div>
                <div className="mt-0.5 text-[10px] text-[#8f959e]">限定期间邀约、到场、活动和成交指标</div>
              </div>
              <SelectDropdown
                value={selectedPeriod}
                options={periodOptions}
                onChange={setSelectedPeriod}
                placeholder="选择年份或月份"
                size="sm"
                className="w-[156px]"
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none"
                dropdownWidth={176}
                menuMaxHeight={320}
              />
              <span className="text-[10px] text-[#b0b5bb]">或自定义</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <AnalysisDatePicker value={plan.date_from} onChange={value => setPlan(current => ({ ...current, date_from: value }))} ariaLabel="统计周期开始日期" />
                <span className="text-[11px] text-[#8f959e]">至</span>
                <AnalysisDatePicker value={plan.date_to} onChange={value => setPlan(current => ({ ...current, date_to: value }))} ariaLabel="统计周期结束日期" />
              </div>
              <button type="button" onClick={() => setDatePreset("today")} className={`h-6 rounded-[3px] px-2 text-[11px] ${datePreset === "today" ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}>当天</button>
              <button type="button" onClick={() => setDatePreset("week")} className={`h-6 rounded-[3px] px-2 text-[11px] ${datePreset === "week" ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}>本周</button>
              <button type="button" onClick={() => setDatePreset("month")} className={`h-6 rounded-[3px] px-2 text-[11px] ${datePreset === "month" ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}>本月</button>
              <button type="button" onClick={() => setDatePreset("year")} className={`h-6 rounded-[3px] px-2 text-[11px] ${datePreset === "year" ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}>本年</button>
              <button type="button" onClick={() => setDatePreset("all")} className={`h-6 rounded-[3px] px-2 text-[11px] ${datePreset === "all" ? "bg-[#1f2329] text-white" : "border border-[#e1e4e7] bg-white text-[#646a73]"}`}>全部</button>
            </div>

            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#4e535a]">客户筛选条件</span>
              <div className="flex items-center rounded-[4px] border border-[#e1e4e7] bg-white p-0.5">
                <button type="button" onClick={() => setPlan(current => ({ ...current, condition_logic: "all" }))} className={`h-6 rounded-[3px] px-2.5 text-[11px] ${plan.condition_logic === "all" ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}>全部符合</button>
                <button type="button" onClick={() => setPlan(current => ({ ...current, condition_logic: "any" }))} className={`h-6 rounded-[3px] px-2.5 text-[11px] ${plan.condition_logic === "any" ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}>任意一条</button>
              </div>
              <button type="button" onClick={addCondition} className="flex h-7 items-center rounded-[3px] px-1.5 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff] hover:text-[#285dcc]"><Plus className="mr-0.5 h-3.5 w-3.5" />加条件</button>
              <span className="text-[11px] text-[#8f959e]">付费条件会同步限定成交金额、单数和人数</span>
            </div>
            {plan.conditions.length === 0 ? <button type="button" onClick={addCondition} className="flex h-8 w-full items-center justify-center rounded-[4px] border border-dashed border-[#e1e4e7] bg-white text-[12px] text-[#8f959e] hover:border-[#b9cdf8] hover:text-[#3370ff]">当前查询全部客户，点击添加筛选条件</button> : (
              <div className="space-y-1">
                {plan.conditions.map((condition, index) => {
                  const definition = fieldByName.get(condition.field)
                  const operatorOptions = (definition?.operators ?? []).map(operator => ({ value: operator, label: operatorLabels[operator] ?? operator }))
                  return (
                    <div key={`${condition.field}-${index}`} className="flex min-w-0 items-center gap-2 rounded-[4px] border border-[#eceef0] bg-[#fbfcfd] px-2 py-1">
                      <SelectDropdown value={condition.field} options={groupedFieldOptions} onChange={value => updateConditionField(index, value as AnalysisField)} size="sm" className="w-[140px] shrink-0" buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[12px] !font-medium hover:!border-[#e1e4e7]" dropdownWidth={180} menuMaxHeight={300} />
                      <SelectDropdown value={condition.operator} options={operatorOptions} onChange={value => {
                        const operator = value as AnalysisOperator
                        const nextValue = VALUELESS_OPERATORS.has(operator) ? null : operator === "between" ? ["", ""] : operator === "in" ? [] : Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value
                        updateCondition(index, { operator, value: nextValue, inherit_period: false })
                      }} size="sm" className="w-[90px] shrink-0" buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[12px] !text-[#8f959e] hover:!border-[#e1e4e7]" />
                      {renderConditionValue(condition, index)}
                      <button type="button" onClick={() => removeCondition(index)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#f0f1f3] hover:text-[#4e535a]" aria-label="删除筛选条件"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  )
                })}
              </div>
            )}
          </div> : <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#3370ff]">① 设置对比组</span>
              <span className="text-[11px] text-[#8f959e]">每组独立设置统计周期和筛选条件，指标在下方统一选择</span>
              {plan.comparison_groups.length < 4 && <button type="button" onClick={() => copyComparisonGroup(plan.comparison_groups.length - 1)} className="ml-auto flex h-7 items-center rounded-[3px] px-2 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff]"><Plus className="mr-0.5 h-3.5 w-3.5" />增加对比组</button>}
            </div>
            <div className="grid gap-2 xl:grid-cols-2">
              {plan.comparison_groups.map((group, groupIndex) => (
                <div key={group.id || groupIndex} className="min-w-0 rounded-[5px] border border-[#e1e4e7] bg-white">
                  <div className="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f5ff] text-[11px] text-[#3370ff]">{String.fromCharCode(65 + groupIndex)}</span>
                    <input value={group.name} onChange={event => updateComparisonGroup(groupIndex, { name: event.target.value })} maxLength={24} className="h-7 min-w-0 flex-1 rounded-[3px] border border-transparent px-1.5 text-[13px] font-medium text-[#2b2f36] outline-none hover:border-[#e1e4e7] focus:border-[#b9cdf8]" aria-label={`对比组 ${groupIndex + 1} 名称`} />
                    <button type="button" onClick={() => copyComparisonGroup(groupIndex)} disabled={plan.comparison_groups.length >= 4} className="flex h-7 items-center rounded-[3px] px-1.5 text-[11px] text-[#646a73] hover:bg-[#f5f6f7] disabled:opacity-40" title="复制为新的对比组"><Copy className="mr-1 h-3.5 w-3.5" />复制</button>
                    <button type="button" onClick={() => removeComparisonGroup(groupIndex)} disabled={plan.comparison_groups.length <= 2} className="flex h-7 w-7 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#fff4f4] hover:text-[#d85b65] disabled:opacity-30" aria-label={`删除${group.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="space-y-2 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 rounded-[4px] bg-[#f7f8fa] p-2">
                      <span className="mr-1 text-[11px] font-medium text-[#4e535a]">统计周期</span>
                      <SelectDropdown value={selectedPeriodValue(group.date_from, group.date_to)} options={periodOptions} onChange={value => setComparisonPeriod(groupIndex, value)} placeholder="年份或月份" size="sm" className="w-[144px]" buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[11px] !shadow-none" dropdownWidth={176} menuMaxHeight={320} />
                      <AnalysisDatePicker value={group.date_from} onChange={value => updateComparisonGroup(groupIndex, { date_from: value })} ariaLabel={`${group.name}统计开始日期`} />
                      <span className="text-[11px] text-[#8f959e]">至</span>
                      <AnalysisDatePicker value={group.date_to} onChange={value => updateComparisonGroup(groupIndex, { date_to: value })} ariaLabel={`${group.name}统计结束日期`} />
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setComparisonPreset(groupIndex, "month")} className="h-6 rounded-[3px] border border-[#e1e4e7] bg-white px-1.5 text-[10px] text-[#646a73]">本月</button>
                        <button type="button" onClick={() => setComparisonPreset(groupIndex, "year")} className="h-6 rounded-[3px] border border-[#e1e4e7] bg-white px-1.5 text-[10px] text-[#646a73]">本年</button>
                        <button type="button" onClick={() => setComparisonPreset(groupIndex, "all")} className="h-6 rounded-[3px] border border-[#e1e4e7] bg-white px-1.5 text-[10px] text-[#646a73]">全部</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-medium text-[#4e535a]">组内条件</span>
                      <div className="flex items-center rounded-[4px] border border-[#e1e4e7] p-0.5">
                        <button type="button" onClick={() => updateComparisonGroup(groupIndex, { condition_logic: "all" })} className={`h-6 rounded-[3px] px-2 text-[10px] ${group.condition_logic === "all" ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}>全部符合</button>
                        <button type="button" onClick={() => updateComparisonGroup(groupIndex, { condition_logic: "any" })} className={`h-6 rounded-[3px] px-2 text-[10px] ${group.condition_logic === "any" ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}>任意一条</button>
                      </div>
                      <button type="button" onClick={() => addComparisonCondition(groupIndex)} className="flex h-6 items-center px-1.5 text-[11px] text-[#3370ff]"><Plus className="mr-0.5 h-3 w-3" />加条件</button>
                    </div>
                    {group.conditions.length === 0 ? <button type="button" onClick={() => addComparisonCondition(groupIndex)} className="flex h-8 w-full items-center justify-center rounded-[4px] border border-dashed border-[#e1e4e7] text-[11px] text-[#8f959e] hover:border-[#b9cdf8] hover:text-[#3370ff]">当前组不限制客户条件，点击添加</button> : (
                      <div className="space-y-1">
                        {group.conditions.map((condition, conditionIndex) => {
                          const definition = fieldByName.get(condition.field)
                          const operatorOptions = (definition?.operators ?? []).map(operator => ({ value: operator, label: operatorLabels[operator] ?? operator }))
                          return <div key={`${condition.field}-${conditionIndex}`} className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[4px] border border-[#eceef0] bg-[#fbfcfd] px-1.5 py-1">
                            <SelectDropdown value={condition.field} options={groupedFieldOptions} onChange={value => {
                              const field = value as AnalysisField
                              const nextDefinition = fieldByName.get(field)
                              const operator = nextDefinition?.operators[0] ?? "eq"
                              updateComparisonCondition(groupIndex, conditionIndex, { field, operator, value: VALUELESS_OPERATORS.has(operator) ? null : "", inherit_period: false })
                            }} size="sm" className="w-[130px] shrink-0" buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[11px] !font-medium hover:!border-[#e1e4e7]" dropdownWidth={180} menuMaxHeight={300} />
                            <SelectDropdown value={condition.operator} options={operatorOptions} onChange={value => {
                              const operator = value as AnalysisOperator
                              const nextValue = VALUELESS_OPERATORS.has(operator) ? null : operator === "between" ? ["", ""] : operator === "in" ? [] : Array.isArray(condition.value) ? condition.value[0] ?? "" : condition.value
                              updateComparisonCondition(groupIndex, conditionIndex, { operator, value: nextValue, inherit_period: false })
                            }} size="sm" className="w-[84px] shrink-0" buttonClassName="!h-7 !border-transparent !bg-transparent !px-1.5 !text-[11px] !text-[#8f959e] hover:!border-[#e1e4e7]" />
                            {renderConditionValue(condition, conditionIndex, groupIndex)}
                            <button type="button" onClick={() => updateComparisonGroup(groupIndex, { conditions: group.conditions.filter((_, index) => index !== conditionIndex) })} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#f0f1f3] hover:text-[#4e535a]" aria-label="删除筛选条件"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>}

          <div>
            <div className="mb-1.5 flex items-baseline gap-2"><span className="text-[12px] font-medium text-[#3370ff]">② 统计指标</span><span className="text-[11px] text-[#8f959e]">勾选后显示在结果上方</span></div>
            <div className="flex flex-wrap gap-1">
              {(metadata?.metrics ?? []).map(metric => {
                const selected = plan.metrics.includes(metric.value)
                return <button key={metric.value} type="button" onClick={() => toggleMetric(metric.value)} className={`flex h-7 items-center gap-1.5 rounded-[4px] border px-2.5 text-[12px] ${selected ? "border-[#b9cdf8] bg-[#f7faff] text-[#2b2f36]" : "border-[#e5e7ea] bg-white text-[#646a73] hover:bg-[#f7f8fa]"}`}><span className={`flex h-3 w-3 items-center justify-center rounded-[2px] border text-[9px] ${selected ? "border-[#3370ff] bg-[#3370ff] text-white" : "border-[#c9cdd4]"}`}>{selected ? "✓" : ""}</span>{metric.label}</button>
              })}
            </div>
            {plan.analysis_mode === "single" && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[#79838f]"><span>拆分指标</span><SelectDropdown value={plan.card_metric} options={metadata?.metrics ?? []} onChange={value => setPlan(current => ({ ...current, card_metric: value as AnalysisMetric }))} size="sm" className="w-[130px]" buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" /><span className="ml-1">拆分维度</span><SelectDropdown value={plan.card_dimension} options={metadata?.card_dimensions ?? []} onChange={value => setPlan(current => ({ ...current, card_dimension: value as AnalysisPlan["card_dimension"] }))} size="sm" className="w-[130px]" buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none" /><span className="text-[11px] text-[#b7bdc6]">{splitHint}</span></div>}
            {plan.analysis_mode === "comparison" && <div className="mt-2 text-[11px] text-[#8f959e]">所有对比组共用以上统计指标，便于横向比较。</div>}
          </div>

          {plan.analysis_mode === "single" && <div>
            <div className="mb-1.5 flex items-baseline gap-2"><span className="text-[12px] font-medium text-[#3370ff]">③ 显示列</span><span className="text-[11px] text-[#8f959e]">最多 10 列，拖动排序</span></div>
            <div className="flex min-h-7 flex-wrap gap-1.5">
              {plan.columns.map((field, index) => <div key={field} draggable onDragStart={() => setDraggedColumnIndex(index)} onDragEnd={() => setDraggedColumnIndex(null)} onDragOver={event => event.preventDefault()} onDrop={() => { if (draggedColumnIndex !== null) reorderColumn(draggedColumnIndex, index); setDraggedColumnIndex(null) }} className={`flex h-7 cursor-grab items-center rounded-[4px] border border-[#e5e7ea] bg-[#fafbfc] px-2 text-[11px] text-[#4e535a] active:cursor-grabbing ${draggedColumnIndex === index ? "opacity-50" : ""}`} title="拖动调整列表顺序"><GripVertical className="mr-1 h-3.5 w-3.5 text-[#a1a6ad]" /><span>{fieldLabels[field]}</span></div>)}
              <SelectDropdown value={plan.columns} options={columnOptions} onChange={value => {
                const selectedColumns = value.slice(0, 10) as AnalysisField[]
                const nextColumns: AnalysisField[] = selectedColumns.includes("nickname") ? selectedColumns : ["nickname", ...selectedColumns].slice(0, 10) as AnalysisField[]
                setPlan(current => ({ ...current, columns: nextColumns }))
              }} multi triggerLabel="+ 添加" hideChevron className="w-[64px]" buttonClassName="!h-7 !rounded-[4px] !border !border-dashed !border-[#b9cdf8] !bg-white !px-2 !text-[11px] !shadow-none" dropdownWidth={280} menuMaxHeight={300} />
            </div>
          </div>}
        </div>

        <div className="flex items-center gap-3 border-t border-[#f0f0f0] bg-[#fafbfc] px-[22px] py-2.5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-[#79838f]" title={querySummary}>当前：{querySummary}</span>
          <button type="button" onClick={() => { setPlan(defaultPlan()); setResult(null); setSelectedTemplateId(""); setError("") }} className="h-8 px-2 text-[12px] text-[#8f959e] hover:text-[#4e535a]">重置</button>
          <Button size="sm" onClick={() => execute(plan, 1)} disabled={executing} className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-5 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{executing ? "查询中" : result ? "更新结果" : "查询"}</Button>
        </div>

        {result?.comparison_groups?.length ? <div className="border-t-[0.5px] border-[#f0f0f0] px-[22px] py-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div><span className="text-[14px] font-medium text-[#2b2f36]">方案对比结果</span><span className="ml-2 text-[11px] text-[#8f959e]">各组独立筛选，统计指标保持一致</span></div>
            <span className="text-[11px] text-[#8f959e]">{executing ? "正在更新..." : `${result.comparison_groups.length} 个对比组`}</span>
          </div>
          <div className="mb-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {result.comparison_groups.map((group, index) => <div key={group.id} className="rounded-[4px] border border-[#e1e4e7] bg-[#fafbfc] px-3 py-2.5">
              <div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f0f5ff] text-[10px] text-[#3370ff]">{String.fromCharCode(65 + index)}</span><span className="truncate text-[12px] font-medium text-[#2b2f36]">{group.name}</span></div>
              <div className="mt-1.5 text-[11px] text-[#8f959e]">{group.date_from || "最早"} 至 {group.date_to || "至今"}</div>
              <div className="mt-1 text-[12px] text-[#4e535a]">符合条件 <span className="font-medium tabular-nums text-[#1f2329]">{group.total}</span> 人</div>
            </div>)}
          </div>
          <div className="overflow-x-auto rounded-[4px] border border-[#e1e4e7]">
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[160px] bg-[#f7f8fa] px-3 text-[12px] font-normal text-[#8f959e]">统计指标</TableHead>
                  {result.comparison_groups.map(group => <TableHead key={group.id} className="min-w-[140px] bg-[#f7f8fa] px-3 text-right text-[12px] font-normal text-[#8f959e]">{group.name}</TableHead>)}
                  {result.comparison_groups.length === 2 && <TableHead className="w-[120px] bg-[#f7f8fa] px-3 text-right text-[12px] font-normal text-[#8f959e]">B − A</TableHead>}
                  {result.comparison_groups.length === 2 && <TableHead className="w-[110px] bg-[#f7f8fa] px-3 text-right text-[12px] font-normal text-[#8f959e]">差异率</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(result.comparison_rows ?? []).map(row => <TableRow key={row.metric} className="h-11">
                  <TableCell className="px-3 text-[12px] font-medium text-[#4e535a]">{row.title}</TableCell>
                  {row.values.map((value, index) => <TableCell key={`${row.metric}-${index}`} className="px-3 text-right text-[13px] font-medium tabular-nums text-[#212631]">{formatMetricValue(value, row.format, row.unit)}</TableCell>)}
                  {result.comparison_groups?.length === 2 && <TableCell className={`px-3 text-right text-[12px] tabular-nums ${(row.difference ?? 0) > 0 ? "text-[#16875d]" : (row.difference ?? 0) < 0 ? "text-[#d85b65]" : "text-[#646a73]"}`}>{row.difference === null ? "—" : formatMetricValue(row.difference, row.format, row.unit, true)}</TableCell>}
                  {result.comparison_groups?.length === 2 && <TableCell className={`px-3 text-right text-[12px] tabular-nums ${(row.difference_rate ?? 0) > 0 ? "text-[#16875d]" : (row.difference_rate ?? 0) < 0 ? "text-[#d85b65]" : "text-[#646a73]"}`}>{row.difference_rate === null ? "基准为 0" : `${row.difference_rate > 0 ? "+" : ""}${row.difference_rate}%`}</TableCell>}
                </TableRow>)}
              </TableBody>
            </Table>
          </div>
          <div className="mt-2 text-[11px] text-[#8f959e]">人数类指标按组内客户去重；同一客户可能同时出现在多个对比组中，因此各组人数不直接相加。</div>
        </div> : result && <div className="border-t-[0.5px] border-[#f0f0f0]">
          <div className="px-[22px] pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {metricCards.map(card => <div key={card.key} className={`min-w-0 border-[0.5px] bg-white px-3 py-2.5 ${card.is_total ? "border-[#cfdcf5]" : "border-[#eceef0]"}`}><div className="truncate text-[12px] text-[#8f959e]" title={card.title}>{card.title}</div><div className="mt-1 text-[20px] font-medium leading-none text-[#212631] tabular-nums">{card.format === "currency" ? `¥${Number(card.count).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : Number(card.count).toLocaleString("zh-CN")}{card.format !== "currency" && <span className="ml-1 text-[12px] font-normal text-[#8f959e]">{card.unit}</span>}</div></div>)}
            </div>
            {dimensionCards.length > 0 && <div className="mt-4 border-t border-[#f0f0f0] pt-3">
              <div className="mb-2 text-[12px] font-medium text-[#4e535a]">{dimensionMetricLabel} · 按{dimensionLabel}拆分</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {dimensionCards.map(card => <div key={card.key} className={`min-w-0 border-[0.5px] px-3 py-2.5 ${card.title === "未配置" ? "border-[#e5e7ea] bg-[#fafbfc]" : "border-[#eceef0] bg-white"}`}><div className="truncate text-[12px] text-[#8f959e]" title={card.title}>{card.title}</div><div className="mt-1 text-[20px] font-medium leading-none text-[#212631] tabular-nums">{card.format === "currency" ? `¥${Number(card.count).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}` : Number(card.count).toLocaleString("zh-CN")}{card.format !== "currency" && <span className="ml-1 text-[12px] font-normal text-[#8f959e]">{card.unit}</span>}</div></div>)}
              </div>
            </div>}
          </div>
          <div className="mx-[22px] mb-4 mt-4 overflow-hidden border-[0.5px] border-[#eceef0] bg-white">
            <div className="flex items-baseline justify-between gap-3 border-b-[0.5px] border-[#f0f0f0] px-3.5 py-2.5"><div className="flex min-w-0 items-baseline gap-2"><div className="truncate text-[13px] font-medium text-[#2b2f36]">{result.plan.title === "自助分析结果" ? `${dateSummary} · 符合条件客户` : result.plan.title}</div><span className="shrink-0 text-[12px] text-[#8f959e]">共 {result.total} 人</span></div><span className="shrink-0 text-[12px] text-[#8f959e]">{executing ? "正在更新..." : "修改条件后点击“更新结果”"}</span></div>
            <div className="overflow-x-auto">
              {result.items.length === 0 ? <div className="py-16 text-center text-[12px] text-[#8f959e]">暂无符合条件的客户</div> : (
                <Table className="min-w-[900px] table-fixed">
                  <TableHeader className="[&_tr]:h-8">
                    <TableRow className="h-8 hover:bg-transparent">
                      {columns.map((field, index) => (
                        <TableHead key={field} className={`${index === 0 ? "pl-3.5" : ""} h-8 overflow-hidden bg-[#f7f8fa] px-3.5 text-[12px] font-normal text-[#8f959e]`}>
                          {field === "nickname" ? <span className="block truncate">{fieldLabels[field]}</span> : (
                            <button type="button" onClick={() => sortResults(field)} disabled={executing} className="inline-flex max-w-full items-center gap-1 text-left disabled:cursor-wait" title={`按${fieldLabels[field]}排序`}>
                              <span className="truncate">{fieldLabels[field]}</span>
                              <span className="inline-flex shrink-0 flex-col leading-none">
                                <span className={`text-[8px] leading-[8px] ${plan.sort_by === field && plan.sort_order === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
                                <span className={`-mt-px text-[8px] leading-[8px] ${plan.sort_by === field && plan.sort_order === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
                              </span>
                            </button>
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.items.map(item => (
                      <TableRow key={item.id} className="h-9">
                        {columns.map((field, index) => (
                          <TableCell key={field} className={`${index === 0 ? "pl-3.5" : ""} overflow-hidden px-3.5 py-2 text-[12px] text-[#4e535a]`}>
                            {field === "nickname" ? <button type="button" onClick={() => setSelectedCustomerId(item.id)} className="block max-w-full truncate text-left text-[12px] font-medium text-[#2b2f36] hover:underline" title={String(item.nickname || "")}>{item.nickname || <EmptyLine />}</button> : <span className="block truncate" title={Array.isArray(item[field]) ? item[field].join("、") : String(item[field] ?? "")}>{renderValue(field, item[field])}</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <PaginationBar currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} startIndex={startIndex} endIndex={endIndex} unit="人" onPageChange={page => execute(plan, page)} />
          </div>
        </div>}
      </section>

      <Dialog open={saveOpen} onOpenChange={open => {
        setSaveOpen(open)
        if (!open && !savingTemplate) {
          setTemplateName("")
          setTemplateDescription("")
        }
      }}>
        <DialogContent className="w-[400px] max-w-[90vw] gap-0 rounded-[4px] border-[0.5px] border-[#e8eaed] p-0" initialFocus={false}>
          <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-6 pb-2 pt-3">
            <DialogTitle className="text-[14px] font-normal">保存分析模板</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">模板名称</span>
              <Input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={30} className="h-8 flex-1 rounded-[4px] border-[0.5px] border-[#e1e4e7] text-[12px] shadow-none focus-visible:ring-0" placeholder="例如：耀凯本月引流转化" />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">模板简介</span>
              <Input value={templateDescription} onChange={event => setTemplateDescription(event.target.value)} maxLength={200} className="h-8 flex-1 rounded-[4px] border-[0.5px] border-[#e1e4e7] text-[12px] shadow-none focus-visible:ring-0" placeholder="简要说明模板用途（选填）" />
            </div>
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">可见范围</span>
              <SelectDropdown value={templateScope} options={[{ value: "private", label: "仅自己可见" }, { value: "shared", label: "团队共享" }]} onChange={value => setTemplateScope(value as "private" | "shared")} className="flex-1" buttonClassName="!h-8 !rounded-[4px] !border-[0.5px] !border-[#e1e4e7] !bg-white !shadow-none" />
            </div>
          </div>
          <DialogFooter className="border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" onClick={() => {
              setSaveOpen(false)
              setTemplateName("")
              setTemplateDescription("")
            }} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
            <Button size="sm" onClick={createTemplate} disabled={!templateName.trim() || savingTemplate} className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-4 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{savingTemplate ? "保存中" : "保存"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!templateToDelete} onOpenChange={open => { if (!open) setTemplateToDelete(null) }}><DialogContent className="w-[360px] max-w-[90vw] gap-0 rounded-[10px] border-[0.5px] border-[#e8eaed] p-0"><DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">删除模板</DialogTitle></DialogHeader><div className="px-5 py-5 text-[12px] text-[#4e535a]">确认删除“{templateToDelete?.name}”吗？删除后无法恢复。</div><DialogFooter className="border-t-[0.5px] border-[#f0f0f0] px-5 py-3"><Button variant="outline" size="sm" onClick={() => setTemplateToDelete(null)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button><Button variant="destructive" size="sm" onClick={confirmDeleteTemplate} className="h-8 rounded-[4px] border-[0.5px] border-[#efc9cc] bg-[#fff5f5] px-4 text-[12px] font-normal text-[#c94b55] shadow-none hover:bg-[#ffeded]">删除</Button></DialogFooter></DialogContent></Dialog>

      <Dialog open={!!selectedCustomerId} onOpenChange={open => { if (!open) setSelectedCustomerId(null) }}><DialogContent className="flex max-h-[90vh] max-w-[1180px] flex-col overflow-hidden p-0"><DetailView selectedCustomerId={selectedCustomerId} onClearSelection={() => setSelectedCustomerId(null)} hideSearch defaultTab="healing" /></DialogContent></Dialog>
    </div>
  )
}
