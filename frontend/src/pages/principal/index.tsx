import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { Download, GripVertical, Plus, Save, SlidersHorizontal, Trash2, X } from "lucide-react"
import { principalApi, customerDetailApi, type AnalysisCondition, type AnalysisOperator, type ConversionAction, type ConversionRule, type PrincipalBreakdown, type PrincipalBreakdownCustomer, type PrincipalMetadata, type PrincipalQuery, type PrincipalResult, type PrincipalRow, type PrincipalRuleFields, type SavedConversionRule } from "@/lib/api"
import { AnalysisConditionRow } from "@/components/analysis-condition-row"
import { AnalysisPeriodFilter } from "@/components/analysis-period-filter"
import DetailView from "@/pages/healing-records/components/detail-view"
import { monthRange } from "@/lib/date-ranges"
import { VALUELESS_OPERATORS, groupFieldOptions, makeCondition, type AnalysisFieldDefinition, type AnalysisFieldOption } from "@/lib/analysis-conditions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { SelectDropdown } from "@/components/select-dropdown"
import { EmptyValue } from "@/components/empty-value"
import { PaginationBar } from "@/components/pagination-bar"
import { useServerPagination } from "@/hooks/use-server-pagination"
import { TeacherFollowUpDialog, TeacherFollowUpList } from "./teacher-follow-up-list"

const INITIAL_RULE: ConversionRule = {
  name: "粗门初次到场 → 会员卡首购",
  description: "",
  scope: "private",
  source: { kind: "coarse_usage", product: "", subtype: "", occurrence: "first", conditions: [] },
  targets: [{ kind: "purchase", product: "membership", subtype: "", occurrence: "first", conditions: [] }],
  target_mode: "any", window_days: 30, same_organization: true,
  organization_id: "", date_from: "", date_to: "",
}
type InviteInitiatedRecord = NonNullable<NonNullable<PrincipalBreakdown["invite_inviters"]>[number]["records"]>[number]
const TABS = [{ key: "overview", label: "经营概况" }, { key: "conversion", label: "转化分析" }] as const
// 转化分析上次用过的条件：换页面/刷新后还能接着用
const CONVERSION_DRAFT_KEY = "principal:conversion-draft"
function loadConversionDraft(): { rule?: ConversionRule; rule_id?: string; organization_id?: string; date_from?: string | null; date_to?: string | null } | null {
  try {
    const raw = localStorage.getItem(CONVERSION_DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
/** 点下面的数字筛引流客户列表 */
type TrafficQuickFilter = { kind: "initiated" | "invite" | "cancel" | "no_show" | "arrive" | "deals" | "product" | "subtype"; value?: string; label: string }
const KIND_OPTIONS = [
  { value: "coarse_usage", label: "参加粗门活动" },
  { value: "attendance", label: "参加课程" },
  { value: "purchase", label: "购买" },
]
const TARGET_MODE_OPTIONS = [
  { value: "any", label: "任意一项" },
  { value: "all", label: "全部完成" },
]
const STATUS_FILTERS = [
  { value: "", label: "全部" },
  { value: "converted", label: "已转化" },
  { value: "unconverted", label: "未转化" },
  { value: "observing", label: "观察中" },
] as const
const ORDER_FILTER_OPTIONS = [
  { value: "", label: "全部购买类型" },
  { value: "first", label: "首购" },
  { value: "repeat", label: "同类复购" },
  { value: "cross", label: "跨品类首购" },
]
// 与课程记录页列宽对齐：课程名加宽截断，老师/案主/组织/部位数收窄
const COLUMN_WIDTH: Record<string, string> = {
  // 用百分比分配列宽：表格永远和卡片同宽，不会撑出横向滚动
  date: "w-[9%]",
  name: "w-[10.5%]",
  type: "w-[7.5%]",
  teachers: "w-[8%]",
  hours: "w-[7%]",
  owner: "w-[4.25%]",
  participants: "w-[8%]",
  new_names: "w-[13.5%]",
  old_names: "w-[13.5%]",
  same_day_deals: "w-[9.5%]",
  order_count: "w-[7.5%]",
  customer: "w-[14%]",
  label: "w-[20%]",
  classification: "w-[16%]",
  deal_count: "w-[10%]",
  closers: "w-[16%]",
  source: "w-[16%]",
  deadline: "w-[12%]",
  status_label: "w-[10%]",
  target_count: "w-[10%]",
  same_day: "w-[22%]",
}

/**
 * 参与者视图的列宽（px）：每个值都不小于该列表头所需的宽度，标题永远完整；
 * 表格窗口更宽时多出来的空间由浏览器按比例分配，窗口更窄时表格横向滚动而不是压标题。
 */
const PARTICIPANT_COLUMN_WIDTH: Record<string, number> = {
  date: 78,
  customer: 84,
  name: 170,
  type: 78,
  organization: 86,
  teachers: 80,
  hours: 66,
  org_participation_count: 94,
  org_participation_hours: 94,
}

const COLUMN_CELL: Record<string, string> = {
  date: "text-[#a1a6ad]",
  name: "max-w-[180px] truncate font-medium text-[#2b2f36]",
  teachers: "max-w-[90px] truncate",
  owner: "max-w-[70px] truncate",
  label: "max-w-[140px] truncate",
  source: "max-w-[140px] truncate",
  closers: "max-w-[110px] truncate",
}
const NUMBER_COLUMNS = new Set(["hours", "parts", "participants", "order_count", "target_count", "deal_count", "same_day_deals",
  "org_participation_count", "org_participation_hours"])
// 表头带问号的列：算最小宽度时要多留一个问号的位置
const HELP_TIP_COLUMNS = new Set(["classification", "org_participation_count", "org_participation_hours"])
/**
 * 表头最小宽度：标题字数 × 11px + 内边距 + 排序箭头（+ 问号）。
 * 表格用百分比分配宽度，窗口变窄时会被压到标题显示不全；把这个值作为每列下限，
 * 窗口太窄时整表横向滚动，标题始终完整。
 */
const headerMinWidth = (key: string, label: string) =>
  label.length * 11 + 46 + (HELP_TIP_COLUMNS.has(key) ? 17 : 0)
const PAGE_SIZE = 20
// 子级选项（卡种 / 具体课程）挂在它的上一级下面，选子级时上一级要一起留着
const PARENT_OF: Record<string, string> = { subtype: "deals", course: "type" }
// 这些维度是「附加条件」，可以和别的维度一起用：
// 成交量那边是购买类型，课程数那边是课程类型 / 具体课程 / 课程老师，引流人数那边是引流人 + 阶段 / 来源 / 标签
const COMBINABLE_PREFIXES = new Set(["buy", "type", "course", "teacher", "traffic", "identity", "stage", "source", "tag", "upsell", "inviter"])

// 引流客户列表的列：可在「列表设置」里勾选显示、上下调整顺序
type TrafficColumnDef = {
  key: string
  label: string
  width: string
  sortField: string
  align?: "left" | "right"
  /** 客户档案隐私字段：只有该 key 在权限里才出现在列表设置里 */
  permission?: string
  /** 新增的档案列默认不勾选，避免一上来把表撑宽 */
  defaultVisible?: boolean
}
const TRAFFIC_COLUMN_DEFS: TrafficColumnDef[] = [
  { key: "name", label: "昵称（引流日期）", width: "w-[96px]", sortField: "referral_date" },
  { key: "referrer", label: "引流人", width: "w-[76px]", sortField: "referrer" },
  { key: "referrer_handler", label: "承接人", width: "w-[76px]", sortField: "referrer_handler" },
  { key: "identity", label: "会员身份", width: "w-[84px]", sortField: "identity" },
  { key: "follow_up_status", label: "跟进阶段", width: "w-[84px]", sortField: "follow_up_status" },
  { key: "traffic_source", label: "流量来源", width: "w-[84px]", sortField: "traffic_source" },
  { key: "tags", label: "客户标签", width: "w-[110px]", sortField: "tags" },
  { key: "deals", label: "交易笔数", width: "w-[84px]", sortField: "deals", align: "right" as const },
  { key: "invite_count", label: "邀约次数", width: "w-[84px]", sortField: "invite_count", align: "right" as const },
  { key: "cancel_count", label: "取消次数", width: "w-[84px]", sortField: "cancel_count", align: "right" as const },
  { key: "arrive_count", label: "到店次数", width: "w-[84px]", sortField: "arrive_count", align: "right" as const },
  { key: "visit_interval", label: "平均到店间隔", width: "w-[104px]", sortField: "visit_interval", align: "right" as const },
  { key: "activity_count", label: "参与活动", width: "w-[84px]", sortField: "activity_count", align: "right" as const },
  // 客户档案里的内容：按角色权限自动出现，默认不勾选
  { key: "visit_purpose", label: "到访目的", width: "w-[120px]", sortField: "visit_purpose", permission: "visit_purpose", defaultVisible: false },
  { key: "trauma_history", label: "创伤经历", width: "w-[120px]", sortField: "trauma_history", permission: "trauma_history", defaultVisible: false },
  { key: "current_block", label: "当下卡点", width: "w-[120px]", sortField: "current_block", permission: "current_block", defaultVisible: false },
  { key: "work_info", label: "工作情况", width: "w-[110px]", sortField: "work_info", permission: "work_info", defaultVisible: false },
  { key: "other_info", label: "其他信息", width: "w-[120px]", sortField: "other_info", permission: "other_info", defaultVisible: false },
]
type TrafficColumnConfig = { key: string; label: string; visible: boolean }
const TRAFFIC_COLUMNS_STORAGE = "principal:traffic-columns"
/** 引流客户列表最多同时显示的列数 */
const MAX_TRAFFIC_COLUMNS = 10
/** 只保留前 N 个勾选的列，避免历史配置超过上限 */
const clampTrafficColumns = (config: TrafficColumnConfig[]): TrafficColumnConfig[] => {
  let visibleCount = 0
  return config.map(item => {
    if (!item.visible) return item
    visibleCount += 1
    return visibleCount <= MAX_TRAFFIC_COLUMNS ? item : { ...item, visible: false }
  })
}
const defaultTrafficColumns = (): TrafficColumnConfig[] => clampTrafficColumns(
  TRAFFIC_COLUMN_DEFS.map(def => ({ key: def.key, label: def.label, visible: def.defaultVisible !== false })),
)
// 隐私列要按当前角色的权限收敛：没权限的列既不出现在设置里，也不显示在表上
const permittedColumns = (config: TrafficColumnConfig[], allowed: string[] | null, definitions = TRAFFIC_COLUMN_DEFS): TrafficColumnConfig[] =>
  config.filter(item => {
    const def = definitions.find(entry => entry.key === item.key)
    return !def?.permission || (allowed ?? []).includes(def.permission)
  })

function loadTrafficColumns(): TrafficColumnConfig[] {
  const fallback = defaultTrafficColumns()
  try {
    const raw = JSON.parse(localStorage.getItem(TRAFFIC_COLUMNS_STORAGE) || "[]")
    if (!Array.isArray(raw) || !raw.length) return fallback
    const merged: TrafficColumnConfig[] = []
    for (const item of raw) {
      const def = TRAFFIC_COLUMN_DEFS.find(entry => entry.key === item?.key)
      if (def) merged.push({
        key: def.key,
        label: def.label,
        visible: typeof item.visible === "boolean" ? item.visible : def.defaultVisible !== false,
      })
    }
    // 之后新增的列默认补在最后
    for (const def of TRAFFIC_COLUMN_DEFS) {
      if (!merged.some(item => item.key === def.key)) merged.push({ key: def.key, label: def.label, visible: def.defaultVisible !== false })
    }
    return merged.length ? clampTrafficColumns(merged) : fallback
  } catch {
    return fallback
  }
}

// 邀约到店列表的列：与引流列表设置独立
const INVITE_COLUMN_DEFS: TrafficColumnDef[] = [
  { key: "arrive_date", label: "到店日期", width: "w-[100px]", sortField: "arrive_date" },
  { key: "name", label: "昵称", width: "w-[100px]", sortField: "name" },
  { key: "identity", label: "会员身份", width: "w-[90px]", sortField: "identity" },
  { key: "referrer", label: "引流人", width: "w-[76px]", sortField: "referrer", defaultVisible: false },
  { key: "referrer_handler", label: "承接人", width: "w-[76px]", sortField: "referrer_handler", defaultVisible: false },
  { key: "follow_up_status", label: "跟进阶段", width: "w-[84px]", sortField: "follow_up_status", defaultVisible: false },
  { key: "traffic_source", label: "流量来源", width: "w-[84px]", sortField: "traffic_source", defaultVisible: false },
  { key: "tags", label: "客户标签", width: "w-[110px]", sortField: "tags", defaultVisible: false },
  { key: "deals", label: "交易笔数", width: "w-[84px]", sortField: "deals", align: "right" as const, defaultVisible: false },
  { key: "invite_count", label: "邀约次数", width: "w-[70px]", sortField: "invite_count", align: "right" as const },
  { key: "cancel_count", label: "取消", width: "w-[60px]", sortField: "cancel_count", align: "right" as const },
  { key: "no_show_count", label: "未到场", width: "w-[60px]", sortField: "no_show_count", align: "right" as const },
  { key: "arrive_count", label: "已到场", width: "w-[60px]", sortField: "arrive_count", align: "right" as const },
  { key: "activity_count", label: "参与活动数", width: "w-[90px]", sortField: "activity_count", align: "right" as const },
  { key: "visit_interval", label: "平均到店间隔", width: "w-[104px]", sortField: "visit_interval", align: "right" as const, defaultVisible: false },
  { key: "same_day_deals", label: "当日成交", width: "w-[80px]", sortField: "same_day_deals", align: "right" as const },
  { key: "arrive_inviter", label: "邀约人", width: "w-[90px]", sortField: "arrive_inviter" },
  { key: "visit_purpose", label: "到访目的", width: "w-[120px]", sortField: "visit_purpose", permission: "visit_purpose", defaultVisible: false },
  { key: "trauma_history", label: "创伤经历", width: "w-[120px]", sortField: "trauma_history", permission: "trauma_history", defaultVisible: false },
  { key: "current_block", label: "当下卡点", width: "w-[120px]", sortField: "current_block", permission: "current_block", defaultVisible: false },
  { key: "work_info", label: "工作情况", width: "w-[110px]", sortField: "work_info", permission: "work_info", defaultVisible: false },
  { key: "other_info", label: "其他信息", width: "w-[120px]", sortField: "other_info", permission: "other_info", defaultVisible: false },
]
const INVITE_COLUMNS_STORAGE = "principal:invite-arrive-columns"
const defaultInviteColumns = (): TrafficColumnConfig[] =>
  clampTrafficColumns(INVITE_COLUMN_DEFS.map(def => ({ key: def.key, label: def.label, visible: def.defaultVisible !== false })))
function loadInviteColumns(): TrafficColumnConfig[] {
  const fallback = defaultInviteColumns()
  try {
    const raw = JSON.parse(localStorage.getItem(INVITE_COLUMNS_STORAGE) || "[]")
    if (!Array.isArray(raw) || !raw.length) return fallback
    const merged: TrafficColumnConfig[] = []
    for (const item of raw) {
      const def = INVITE_COLUMN_DEFS.find(entry => entry.key === item?.key)
      if (def) merged.push({ key: def.key, label: def.label, visible: typeof item.visible === "boolean" ? item.visible : true })
    }
    for (const def of INVITE_COLUMN_DEFS) {
      if (!merged.some(item => item.key === def.key)) merged.push({ key: def.key, label: def.label, visible: def.defaultVisible !== false })
    }
    return merged.length ? clampTrafficColumns(merged) : fallback
  } catch {
    return fallback
  }
}

// 发起邀约明细：日期和状态固定显示，中间字段与邀约到店共用同一套定义，但保存自己的列设置。
const INITIATED_COLUMN_DEFS = INVITE_COLUMN_DEFS.filter(def => def.key !== "arrive_date")
const INITIATED_COLUMNS_STORAGE = "principal:invite-initiated-columns"
const defaultInitiatedColumns = (): TrafficColumnConfig[] =>
  clampTrafficColumns(INITIATED_COLUMN_DEFS.map(def => ({ key: def.key, label: def.label, visible: def.defaultVisible !== false })))
function loadInitiatedColumns(): TrafficColumnConfig[] {
  const fallback = defaultInitiatedColumns()
  try {
    const raw = JSON.parse(localStorage.getItem(INITIATED_COLUMNS_STORAGE) || "[]")
    if (!Array.isArray(raw) || !raw.length) return fallback
    const merged = raw.flatMap((item: TrafficColumnConfig) => {
      const def = INITIATED_COLUMN_DEFS.find(entry => entry.key === item?.key)
      return def ? [{ key: def.key, label: def.label, visible: typeof item.visible === "boolean" ? item.visible : true }] : []
    })
    for (const def of INITIATED_COLUMN_DEFS) {
      if (!merged.some((item: TrafficColumnConfig) => item.key === def.key)) {
        merged.push({ key: def.key, label: def.label, visible: def.defaultVisible !== false })
      }
    }
    return clampTrafficColumns(merged)
  } catch {
    return fallback
  }
}

// 列表设置：勾选要显示哪些列，按住每一行拖动调整顺序（和自定义筛选的「显示列」一致）
function ColumnSettings({ config, onChange, onReset = defaultTrafficColumns, resetLabel = "恢复默认", maxColumns = MAX_TRAFFIC_COLUMNS }: {
  config: TrafficColumnConfig[]
  onChange: (next: TrafficColumnConfig[]) => void
  onReset?: () => TrafficColumnConfig[]
  resetLabel?: string
  maxColumns?: number
}) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const syncAnchor = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!rect || !panel) return
    panel.style.left = `${Math.min(rect.right, window.innerWidth - 256) - 248}px`
    panel.style.top = `${rect.bottom + 6}px`
  }
  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    window.addEventListener("scroll", syncAnchor, true)
    window.addEventListener("resize", syncAnchor)
    return () => {
      document.removeEventListener("mousedown", handler)
      window.removeEventListener("scroll", syncAnchor, true)
      window.removeEventListener("resize", syncAnchor)
    }
  }, [open])
  const reorder = (from: number, to: number) => {
    if (from === to || to < 0 || to >= config.length) return
    const next = [...config]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }
  const visibleCount = config.filter(item => item.visible).length
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={event => {
          const rect = event.currentTarget.getBoundingClientRect()
          setAnchor({ left: Math.min(rect.right, window.innerWidth - 256), top: rect.bottom + 6 })
          setOpen(current => !current)
        }}
        aria-expanded={open}
        className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />列表设置
      </button>
      {open && anchor && (
        <div
          ref={panelRef}
          className="fixed z-50 w-[248px] rounded-[6px] border border-[#e8eaed] bg-white p-2 shadow-[0_8px_24px_rgba(31,35,41,.12)]"
          style={{ left: anchor.left - 248, top: anchor.top }}
        >
          <div className="px-1.5 pb-1.5 text-[11px] text-[#8f959e]">
            勾选要显示的列，拖动调整顺序
            <span className={`ml-1 ${visibleCount >= maxColumns ? "text-[#c4506a]" : ""}`}>
              （最多 {maxColumns} 列，已选 {visibleCount}）
            </span>
          </div>
          <div className="max-h-[320px] overflow-y-auto overscroll-contain">
            {config.map((item, index) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDraggedIndex(index)}
                onDragEnd={() => { setDraggedIndex(null); setOverIndex(null) }}
                onDragOver={event => { event.preventDefault(); setOverIndex(index) }}
                onDrop={event => { event.preventDefault(); if (draggedIndex !== null) reorder(draggedIndex, index); setDraggedIndex(null); setOverIndex(null) }}
                title="拖动调整顺序"
                className={`flex cursor-grab items-center gap-1.5 rounded-[3px] px-1.5 py-1 hover:bg-[#f7f8fa] active:cursor-grabbing ${draggedIndex === index ? "opacity-50" : ""} ${overIndex === index && draggedIndex !== index ? "bg-[#f7faff] ring-1 ring-inset ring-[#b9cdf8]" : ""}`}
              >
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-[#a1a6ad]" />
                <input
                  type="checkbox"
                  checked={item.visible}
                  disabled={(item.visible && visibleCount <= 1) || (!item.visible && visibleCount >= maxColumns)}
                  onChange={event => onChange(
                    config.map((entry, i) => i === index ? { ...entry, visible: event.target.checked } : entry),
                  )}
                />
                <span className={`min-w-0 flex-1 truncate text-[12px] ${item.visible ? "text-[#2b2f36]" : "text-[#a8aeb6]"}`}>{item.label}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center justify-between border-t border-[#f0f1f3] px-1.5 pt-1.5">
            <button type="button" onClick={() => onChange(onReset())} className="text-[11px] text-[#8f959e] hover:text-[#4e535a]">{resetLabel}</button>
            <span className="text-[11px] text-[#b0b5bb]">显示 {visibleCount} / {config.length} 列</span>
          </div>
        </div>
      )}
    </div>
  )
}
// 这些列内容是名单或自由文本，点排序意义不大，表头不显示箭头（课程名可以按拼音排）
const UNSORTABLE_COLUMNS = new Set(["owner", "parts", "new_names", "old_names"])

// 统计卡片里的空值（后端为没有分母的比率返回「—」）统一显示成一条很浅的短横线
const isEmptyMetric = (value: unknown) => value === "" || value === "-" || value === "—" || value === "–"

// 表头/卡片旁边的小问号：悬停显示说明
function HelpTip({ children, width = 240, trigger = "hover" }: { children: ReactNode; width?: number; trigger?: "hover" | "click" }) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  // 提示渲染到 body 上：表格/面板都有 overflow-hidden，放在里面会被裁掉
  const show = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8)
    setPosition(window.innerHeight - rect.bottom >= 150
      ? { left, top: rect.bottom + 6 }
      : { left, bottom: window.innerHeight - rect.top + 6 })
  }
  const hide = () => setPosition(null)
  useEffect(() => {
    if (!position) return
    const onDocumentDown = (event: MouseEvent) => {
      if (triggerRef.current?.contains(event.target as Node)) return
      hide()
    }
    // 点击展开的问号：点到别处就收起来
    if (trigger === "click") document.addEventListener("mousedown", onDocumentDown)
    window.addEventListener("scroll", hide, true)
    window.addEventListener("resize", hide)
    return () => {
      if (trigger === "click") document.removeEventListener("mousedown", onDocumentDown)
      window.removeEventListener("scroll", hide, true)
      window.removeEventListener("resize", hide)
    }
  }, [position, trigger])
  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={trigger === "hover" ? show : undefined}
        onMouseLeave={trigger === "hover" ? hide : undefined}
        onClick={event => {
          event.stopPropagation()
          if (trigger !== "click") return
          if (position) hide()
          else show()
        }}
        className="inline-flex h-[13px] w-[13px] shrink-0 cursor-help items-center justify-center rounded-full border border-[#c9cdd4] text-[9px] leading-none text-[#8f959e]"
      >
        ?
      </span>
      {position && typeof document !== "undefined" && createPortal(
        <div
          style={{ width, left: position.left, top: position.top, bottom: position.bottom }}
          className="pointer-events-none fixed z-[2147483646] whitespace-normal break-words rounded-[4px] bg-[#1f2329] px-2.5 py-2 text-left text-[11px] font-normal leading-[1.7] text-white shadow-[0_6px_18px_rgba(0,0,0,.18)]"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

// 参与者列表里的累计口径：跟着当前筛选范围（组织/俱乐部、统计周期、课程类型等）走
const PARTICIPATION_COUNT_TIP = <>统计周期内，累计参与当前组织/俱乐部次数</>
const PARTICIPATION_HOURS_TIP = <>统计周期内，累计参与当前组织/俱乐部课时</>

const PURCHASE_TYPE_TIP = (
  <>
    <b className="font-medium text-white">首购</b>：这个客户第一次买这一类项目<br />
    <b className="font-medium text-white">同类复购</b>：非第一次购买同类里的同一个具体项目，会员卡按卡种算（换了卡种不算复购）<br />
    <b className="font-medium text-white">跨品类首购</b>：该类项目第一次购买，但之前买过别的类目<br />
    <b className="font-medium text-white">升单</b>：「升单配置」页面配置，同一人多次升单，仅记作一次
  </>
)

// 明细行都是「类型｜值｜值…」拼出来的，这里拆成「类型 + 内容」，同类型的相邻行合并成一条
function parseDetails(lines: string[]): { tag: string; values: string[] }[] {
  const merged: { tag: string; values: string[] }[] = []
  for (const line of lines) {
    const parts = line.split("｜").map(part => part.trim()).filter(Boolean)
    if (!parts.length) continue
    const [tag, ...values] = parts
    const last = merged[merged.length - 1]
    if (last && last.tag === tag) last.values.push(...values)
    else merged.push({ tag, values })
  }
  return merged
}

const DETAIL_TAG_STYLE: Record<string, string> = {
  成交: "bg-[#eef4ff] text-[#3370ff]",
  成交人: "bg-[#eef4ff] text-[#3370ff]",
  到场: "bg-[#eaf7ee] text-[#2f9e5f]",
  扣卡: "bg-[#fff4e8] text-[#b7791f]",
  课程日期: "bg-[#f2f3f5] text-[#646a73]",
}

const detailTagStyle = (tag: string) => DETAIL_TAG_STYLE[tag] ?? (tag.startsWith("后续交易") ? "bg-[#fff4e8] text-[#b7791f]" : "bg-[#f2f3f5] text-[#646a73]")

// 成交类明细：值按「客户｜日期｜项目｜组织」四段一笔，弹窗里按列对齐显示
const PER_DEAL_TAGS = ["后续交易", "关联成交", "当日成交"]
const isPerDealTag = (tag: string) => PER_DEAL_TAGS.some(prefix => tag.startsWith(prefix))

function detailDealRows(tag: string, values: string[]): string[][] | null {
  if (!isPerDealTag(tag) || values.length < 4 || values.length % 4 !== 0) return null
  return Array.from({ length: values.length / 4 }, (_, index) => values.slice(index * 4, index * 4 + 4))
}

function detailValueLines(tag: string, values: string[]): string[] {
  const rows = detailDealRows(tag, values)
  if (rows) return rows.map(row => row.join(" · "))
  return [values.join(tag === "到场" ? "、" : " · ")]
}

function describeAction(action: ConversionAction, metadata: PrincipalMetadata | null) {
  const prefix = action.occurrence === "first" ? "首次" : action.occurrence === "repeat" ? "再次" : ""
  if (action.kind === "coarse_usage") return `${prefix}参加粗门活动`
  const options = action.kind === "purchase" ? metadata?.products : metadata?.activity_types
  const name = action.subtype || options?.find(item => item.key === action.product)?.label || (action.kind === "purchase" ? "任意产品" : "课程")
  return `${prefix}${action.kind === "purchase" ? "购买" : "参加"}${name}`
}

function describeRule(rule: ConversionRule, metadata: PrincipalMetadata | null) {
  const withConditions = (action: ConversionAction) => {
    const count = action.conditions?.length ?? 0
    return count ? `（含 ${count} 个筛选条件）` : ""
  }
  const targets = rule.targets
    .map(action => `「${describeAction(action, metadata)}」${withConditions(action)}`)
    .join(rule.target_mode === "all" ? "且" : "或")
  return `从「${describeAction(rule.source, metadata)}」${withConditions(rule.source)}到${targets}，${rule.window_days === 0 ? "限当天" : `间隔不超过 ${rule.window_days} 天`}。`
}

// 「从」和每个「到」下面都可以挂多条条件，控件与自定义筛选同一套
function RuleConditions({ conditions, allowedFields, fieldOptions, fieldByName, operatorLabels, onChange }: {
  conditions: AnalysisCondition[]
  allowedFields: AnalysisFieldDefinition[]
  fieldOptions: AnalysisFieldOption[]
  fieldByName: Map<string, AnalysisFieldDefinition>
  operatorLabels: Partial<Record<AnalysisOperator, string>>
  onChange: (next: AnalysisCondition[]) => void
}) {
  return (
    <div className="space-y-1">
      {conditions.map((condition, index) => (
        <AnalysisConditionRow
          key={index}
          condition={condition}
          fieldByName={fieldByName}
          operatorLabels={operatorLabels}
          fieldOptions={fieldOptions}
          onChange={next => onChange(conditions.map((item, i) => i === index ? next : item))}
          onRemove={() => onChange(conditions.filter((_, i) => i !== index))}
        />
      ))}
      {allowedFields.length > 0 && conditions.length < 8 && (
        <button
          type="button"
          onClick={() => {
            const next = makeCondition(allowedFields)
            if (next) onChange([...conditions, next])
          }}
          className="flex h-7 items-center rounded-[3px] px-1.5 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff]"
        >
          <Plus className="mr-0.5 h-3.5 w-3.5" />{allowedFields.length === 1 ? allowedFields[0].label : "筛选条件"}
        </button>
      )}
    </div>
  )
}

function ActionEditor({ value, onChange, metadata }: { value: ConversionAction; onChange: (value: ConversionAction) => void; metadata: PrincipalMetadata }) {
  const options = value.kind === "purchase" ? metadata.products : value.kind === "attendance" ? metadata.activity_types : []
  const subtypes = options.find(item => item.key === value.product)?.subtypes || []
  // 与「自定义筛选」的条件行一致：控件默认无边框，悬停才显边框
  const trigger = "!h-7 !rounded-[4px] !border-transparent !bg-transparent !px-1.5 !text-[12px] !shadow-none hover:!border-[#e1e4e7]"
  return <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-[4px] border border-[#eceef0] bg-[#fbfcfd] px-2 py-1">
    <SelectDropdown
      size="sm"
      className="w-[168px] shrink-0"
      value={value.kind}
      options={KIND_OPTIONS}
      onChange={kind => onChange({ ...value, kind: kind as ConversionAction["kind"], product: "", subtype: "" })}
      buttonClassName={`${trigger} !font-medium`}
    />
    {options.length > 0 && <SelectDropdown
      size="sm"
      className="w-[140px] shrink-0"
      value={value.product}
      options={[{ value: "", label: "全部类型" }, ...options.map(item => ({ value: item.key, label: item.label }))]}
      onChange={product => onChange({ ...value, product, subtype: "" })}
      buttonClassName={trigger}
    />}
    {subtypes.length > 0 && <SelectDropdown
      size="sm"
      className="w-[176px] shrink-0"
      value={value.subtype}
      options={[{ value: "", label: value.kind === "purchase" ? "不限具体产品或卡种" : "不限具体课程" }, ...subtypes.map(name => ({ value: name, label: name }))]}
      onChange={subtype => onChange({ ...value, subtype })}
      buttonClassName={trigger}
    />}
    <SelectDropdown
      size="sm"
      className="w-[140px] shrink-0"
      value={value.occurrence}
      options={[
        { value: "first", label: "仅首次" },
        { value: "repeat", label: "复购（不含首次）" },
        { value: "any", label: "全部" },
      ]}
      onChange={occurrence => onChange({ ...value, occurrence: occurrence as ConversionAction["occurrence"] })}
      buttonClassName={`${trigger} !text-[#8f959e]`}
    />
  </div>
}

export default function PrincipalPage() {
  const [metadata, setMetadata] = useState<PrincipalMetadata | null>(null)
  const [rules, setRules] = useState<SavedConversionRule[]>([])
  // 转化分析的条件（规则 + 范围 + 周期）留在浏览器里：离开页面再回来不会被重置
  const conversionDraft = loadConversionDraft()
  const [ruleId, setRuleId] = useState(conversionDraft?.rule_id ?? "")
  const [query, setQuery] = useState<PrincipalQuery>(() => ({
    organization_id: conversionDraft?.organization_id ?? "",
    date_from: conversionDraft?.date_from ?? monthRange().date_from,
    date_to: conversionDraft?.date_to ?? monthRange().date_to,
    tab: "overview", product: "", activity_type: "", course_subtype: "", order_filter: "", status: "",
    rule: conversionDraft?.rule ?? INITIAL_RULE,
  }))
  const [result, setResult] = useState<PrincipalResult | null>(null)
  // 当前结果属于哪个 tab：转化分析没点「查询」前不显示旧数据
  const [resultTab, setResultTab] = useState<PrincipalQuery["tab"] | "">("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [detail, setDetail] = useState<PrincipalRow | null>(null)
  const [teacherFollowUpDetail, setTeacherFollowUpDetail] = useState<PrincipalRow | null>(null)
  // 点课程列表里的数字时，只看这一类明细（当日成交 / 关联成交），空串表示全部
  const [detailTag, setDetailTag] = useState("")
  const [saveOpen, setSaveOpen] = useState(false)
  const [ruleNameDraft, setRuleNameDraft] = useState("")
  const [ruleDescriptionDraft, setRuleDescriptionDraft] = useState("")
  const [ruleScopeDraft, setRuleScopeDraft] = useState<"private" | "shared">("private")
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [ruleFields, setRuleFields] = useState<PrincipalRuleFields | null>(null)
  const [ruleError, setRuleError] = useState("")
  const [detailCustomerId, setDetailCustomerId] = useState("")
  const [detailCourseId, setDetailCourseId] = useState("")
  // 引流客户列表里点数字：邀约 / 取消邀约 / 到店 / 参与活动的明细
  const [trafficRecordDetail, setTrafficRecordDetail] = useState<{ customerId: string; name: string; type: "invited" | "cancelled" | "arrived" | "activity" } | null>(null)
  const [trafficRecordRows, setTrafficRecordRows] = useState<Array<Record<string, unknown>>>([])
  const [trafficRecordLoading, setTrafficRecordLoading] = useState(false)
  const [trafficRecordExpanded, setTrafficRecordExpanded] = useState(false)
  // 点「成交笔数」打开的弹窗：这个客户在当前范围内的每一笔成交
  const [dealDetail, setDealDetail] = useState<{ customer: string; rows: PrincipalRow[]; loading: boolean } | null>(null)
  // 交易列表口径：每笔交易一行 / 同一人只显示一行
  const [listView, setListView] = useState<"order" | "customer">("order")
  const [inviteArriveView, setInviteArriveView] = useState<"customer" | "date">("customer")
  const [inviteArrivePage, setInviteArrivePage] = useState(1)
  // 经营概况：三张卡一次展开一组；二级项目勾选后筛选下面的列表
  // 默认选中第一张卡（成交量），点它可以收起
  const [overviewGroup, setOverviewGroup] = useState<"deals" | "courses" | "traffic" | "invite" | "">("traffic")
  const [breakdownPicks, setBreakdownPicks] = useState<string[]>([])
  const [trafficPage, setTrafficPage] = useState(1)
  // 引流客户列表：除昵称外都支持点击表头排序（本地排序，不影响分页口径）
  const [trafficSortBy, setTrafficSortBy] = useState("")
  const [trafficSortOrder, setTrafficSortOrder] = useState<"asc" | "desc">("asc")
  // 点下面的数字筛列表：只作用于引流客户列表，可用「重置」清掉
  const [trafficQuickFilter, setTrafficQuickFilter] = useState<TrafficQuickFilter | null>(null)
  // 引流客户列表的列配置（勾选显示 + 顺序），存在浏览器里
  const [trafficColumns, setTrafficColumns] = useState<TrafficColumnConfig[]>(() => loadTrafficColumns())
  const [inviteColumns, setInviteColumns] = useState<TrafficColumnConfig[]>(() => loadInviteColumns())
  const [initiatedColumns, setInitiatedColumns] = useState<TrafficColumnConfig[]>(() => loadInitiatedColumns())
  const updateTrafficColumns = (next: TrafficColumnConfig[]) => {
    setTrafficColumns(next)
    try { localStorage.setItem(TRAFFIC_COLUMNS_STORAGE, JSON.stringify(next)) } catch { /* 存不上也无所谓 */ }
  }
  // 隐私列（到访目的 / 创伤经历 / 当下卡点 / 工作情况 / 其他信息）按当前角色的权限自动出现或隐藏
  const trafficProfileFields = result?.breakdown?.traffic_profile_fields ?? null
  const listTrafficColumns = useMemo(
    () => permittedColumns(trafficColumns, trafficProfileFields),
    [trafficColumns, trafficProfileFields],
  )
  const listInviteColumns = useMemo(
    () => permittedColumns(inviteColumns, trafficProfileFields, INVITE_COLUMN_DEFS),
    [inviteColumns, trafficProfileFields],
  )
  // 设置面板里只改「当前角色可见」的这几列，其余配置原样保留
  const changeTrafficColumns = (next: TrafficColumnConfig[]) => {
    const keys = new Set(next.map(item => item.key))
    updateTrafficColumns([...next, ...trafficColumns.filter(item => !keys.has(item.key))])
  }
  const changeInviteColumns = (next: TrafficColumnConfig[]) => {
    const keys = new Set(next.map(item => item.key))
    const merged = [...next, ...inviteColumns.filter(item => !keys.has(item.key))]
    setInviteColumns(merged)
    try { localStorage.setItem(INVITE_COLUMNS_STORAGE, JSON.stringify(merged)) } catch { /* 存不上也无所谓 */ }
  }
  const changeInitiatedColumns = (next: TrafficColumnConfig[]) => {
    const keys = new Set(next.map(item => item.key))
    const merged = [...next, ...initiatedColumns.filter(item => !keys.has(item.key))]
    setInitiatedColumns(merged)
    try { localStorage.setItem(INITIATED_COLUMNS_STORAGE, JSON.stringify(merged)) } catch { /* 存不上也不影响使用 */ }
  }
  const visibleInviteColumns = listInviteColumns
    .filter(item => item.visible)
    .map(item => ({ ...INVITE_COLUMN_DEFS.find(def => def.key === item.key)!, visible: true }))
  // 发起邀约日期与状态固定显示，中间字段与“邀约到店”使用同一套字段定义。
  const listInitiatedColumns = useMemo(
    () => permittedColumns(initiatedColumns, trafficProfileFields, INITIATED_COLUMN_DEFS),
    [initiatedColumns, trafficProfileFields],
  )
  const visibleInviteDetailColumns = listInitiatedColumns
    .filter(item => item.visible)
    .map(item => ({ ...INITIATED_COLUMN_DEFS.find(def => def.key === item.key)!, visible: true }))
  const visibleTrafficColumns = listTrafficColumns
    .filter(item => item.visible)
    .map(item => ({ ...TRAFFIC_COLUMN_DEFS.find(def => def.key === item.key)!, visible: true }))
  // 表格宽度按实际列宽计算（列数已限制在 10 列内），不再强制一个更大的最小宽度，
  // 避免列少时表格仍撑出屏幕。
  const trafficTableMinWidth = visibleTrafficColumns.reduce((total, column) => {
    const px = Number.parseInt(column.width.match(/(\d+)px/)?.[1] ?? "84", 10)
    return total + px + 12
  }, 0)
  const listCardRef = useRef<HTMLDivElement>(null)
  // 名单（新人/老人）默认单行缩略，展开后整列换行显示全部名字
  const [expandNames, setExpandNames] = useState(false)
  const [expandTeacherFollowUp, setExpandTeacherFollowUp] = useState(false)
  // 引流客户列表：默认单行截断，展开后整列换行显示全文
  const [expandTrafficCells, setExpandTrafficCells] = useState(false)
  // 发起邀约按邀约人汇总，明细用弹窗打开，避免行内展开撑满页面。
  const [inviteDetail, setInviteDetail] = useState<{ key: string; label: string; records: InviteInitiatedRecord[] } | null>(null)
  const [inviteDetailSort, setInviteDetailSort] = useState<{ field: string; order: "asc" | "desc" }>({ field: "date", order: "desc" })
  const [expandInviteDetail, setExpandInviteDetail] = useState(false)
  // 引流人数：会员身份默认只显示前 3 类，展开后铺成两列小表
  // 与「自定义筛选」表头一致：点击列头切换升/降序（当前页内排序）
  const [sortBy, setSortBy] = useState("")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc")
  const version = useRef(0)
  // 规则 / 范围 / 周期一变就存一份，下次进来直接还原
  useEffect(() => {
    try {
      localStorage.setItem(CONVERSION_DRAFT_KEY, JSON.stringify({
        rule: query.rule, rule_id: ruleId,
        organization_id: query.organization_id, date_from: query.date_from, date_to: query.date_to,
      }))
    } catch { /* 存不上也不影响使用 */ }
  }, [query.rule, query.organization_id, query.date_from, query.date_to, ruleId])
  const listTab: PrincipalQuery["tab"] = query.tab === "overview" && overviewGroup === "deals" ? "orders" : query.tab
  // 当前面板里有哪些可选项（换范围后用来丢掉已经不存在的勾选）
  const availablePicks = (data: PrincipalResult) => {
    const values = new Set<string>()
    if (overviewGroup === "deals") {
      for (const item of data.breakdown?.deals ?? []) {
        values.add(`deals:${item.key}`)
        for (const sub of item.subtypes ?? []) values.add(`subtype:${sub.key}`)
      }
      for (const item of data.breakdown?.buys ?? []) values.add(`buy:${item.key}`)
    } else if (overviewGroup === "courses") {
      for (const item of data.breakdown?.courses?.by_type ?? []) {
        values.add(`type:${item.key}`)
        for (const sub of item.subtypes ?? []) values.add(`course:${sub.key}`)
      }
      for (const item of data.breakdown?.courses?.by_teacher ?? []) values.add(`teacher:${item.key}`)
    } else if (overviewGroup === "traffic") {
      for (const item of data.breakdown?.traffic ?? []) values.add(`traffic:${item.key}`)
      for (const item of data.breakdown?.traffic_filters?.stage ?? []) values.add(`stage:${item.key}`)
      for (const item of data.breakdown?.traffic_filters?.source ?? []) values.add(`source:${item.key}`)
      for (const item of data.breakdown?.traffic_filters?.tag ?? []) values.add(`tag:${item.key}`)
      for (const item of data.breakdown?.traffic_filters?.upsell ?? []) values.add(`upsell:${item.key}`)
      for (const item of data.breakdown?.traffic_filters?.identity ?? []) values.add(`identity:${item.key}`)
    } else if (overviewGroup === "invite") {
      for (const item of data.breakdown?.invite_inviters ?? []) values.add(`inviter:${item.key}`)
      for (const item of data.breakdown?.traffic ?? []) values.add(`traffic:${item.key}`)
    }
    return values
  }
  // 二级勾选交给后端筛（否则只筛当前一页，翻页就对不上）；引流人组的客户列表在前端筛
  const serverPicks = breakdownPicks.filter(value => !value.startsWith("traffic:"))
  // 点「查询」时置 true：这一次请求要写进分析日志
  const logAnalysisRef = useRef(false)
  const pagination = useServerPagination<PrincipalRow>(async (page, size) => {
    const current = ++version.current
    // 条件没填完就别发请求：本地给出和自定义筛选一致的说法
    if (query.tab === "conversion") {
      const blank = blankConditionMessage()
      if (blank) throw new Error(blank)
    }
    const listQuery = { ...query, tab: listTab, breakdown: serverPicks, list_view: listView, sort_by: sortBy, sort_order: sortOrder }
    // 只有使用者主动点「查询」这一次才让后端记分析日志（切 tab、翻页不记）
    const logAnalysis = logAnalysisRef.current
    logAnalysisRef.current = false
    const responsePromise = principalApi.query(
      logAnalysis && listQuery.tab === "conversion" ? { ...listQuery, log_analysis: true } : listQuery,
      page,
      size,
    )
    // 经营概况展开「成交」时列表来自「交易记录」，但卡片与二级拆分必须仍用概况自己的口径
    const panelPromise = listTab !== query.tab
      ? principalApi.query({ ...listQuery, tab: query.tab }, page, size)
      : null
    const [response, panel] = await Promise.all([responsePromise, panelPromise])
    let resolved = response
    if (listTab !== query.tab) {
      if (panel) resolved = { ...response, summary: panel.summary, breakdown: panel.breakdown }
    }
    if (current === version.current) {
      setResult(resolved); setRuleError("")
      setResultTab(query.tab)
      // 换了范围后，选过的维度如果已经不在这批数据里（比如这段时间没有会员卡成交），就把它去掉
      if (query.tab === "overview") {
        const options = availablePicks(resolved)
        setBreakdownPicks(picks => picks.every(value => options.has(value)) ? picks : picks.filter(value => options.has(value)))
      }
    }
    return resolved
  }, { pageSize: PAGE_SIZE })
  useEffect(() => {
    Promise.all([principalApi.metadata(), principalApi.rules()]).then(([meta, saved]) => { setMetadata(meta); setRules(saved) }).catch(e => setError(e.message))
  }, [])
  // 条件字段按需加载：只有打开「转化分析」才拉一次，口径与自定义筛选同源
  useEffect(() => {
    if (query.tab !== "conversion" || ruleFields) return
    principalApi.ruleFields()
      .then(setRuleFields)
      .catch(() => setRuleFields({ fields: [], operators: [] }))
  }, [query.tab, ruleFields])
  // 转化分析这一屏：范围与规则都等使用者点「查询」才重新拉数据（切 tab 例外，必须立刻出结果）；
  // 其他三个 tab 没有查询按钮，改了筛选即时生效。
  const previousQueryRef = useRef(query)
  const previousListTabRef = useRef(listTab)
  useEffect(() => {
    const previous = previousQueryRef.current
    const previousListTab = previousListTabRef.current
    previousQueryRef.current = query
    previousListTabRef.current = listTab
    if (previous === query && previousListTab === listTab) return
    // 转化分析不自动查询：范围与规则都等使用者点「查询」才出结果（切 tab 也不自动跑）
    if (query.tab === "conversion") return
    version.current++
    // 不把结果清空：切换分组/范围时先沿用上一屏的数据，等新结果回来再替换，避免整块内容闪一下
    setDetail(null)
    pagination.resetPage()
  }, [query, listTab, pagination.resetPage])
  // 勾选/取消二级项目、切换「每笔交易 / 同一人」后重新取数（后端筛，翻页后口径仍然一致）
  const picksKey = `${serverPicks.join(",")}|${listView}|${sortBy}|${sortOrder}`
  const previousPicksRef = useRef(picksKey)
  useEffect(() => {
    if (previousPicksRef.current === picksKey) return
    previousPicksRef.current = picksKey
    version.current++
    pagination.resetPage()
  }, [picksKey, pagination.resetPage])
  const fieldByName = useMemo(
    () => new Map((ruleFields?.fields ?? []).map(field => [field.value, field as AnalysisFieldDefinition])),
    [ruleFields],
  )
  const operatorLabels = useMemo(
    () => Object.fromEntries((ruleFields?.operators ?? []).map(item => [item.value, item.label])) as Partial<Record<AnalysisOperator, string>>,
    [ruleFields],
  )
  const sourceFieldOptions = useMemo(() => groupFieldOptions(ruleFields?.fields ?? []), [ruleFields])
  // 条件没填完时的说法，与「自定义筛选」保持一致
  function blankConditionMessage() {
    for (const action of [query.rule.source, ...query.rule.targets]) {
      for (const condition of (action.conditions ?? [])) {
        if (VALUELESS_OPERATORS.has(condition.operator)) continue
        const value = condition.value
        const empty = value === undefined || value === null || value === ""
          || (Array.isArray(value) && (value.length === 0 || value.some(item => !item)))
        if (empty) {
          const label = fieldByName.get(condition.field)?.label ?? condition.field
          return `「${label}」的筛选值还没填，${condition.operator === "in" ? "请选择" : "请填写"}后再查询`
        }
      }
    }
    return ""
  }
  // 提示只挂在「转化分析」这个 tab 里，切到别的 tab 不会带着走
  const conversionError = query.tab === "conversion" ? (ruleError || error || pagination.error) : ""
  function runQuery() {
    const blank = blankConditionMessage()
    if (blank) { setRuleError(blank); return }
    setRuleError("")
    logAnalysisRef.current = true
    pagination.refresh()
  }
  function resetRule() {
    setRuleId("")
    setRuleError("")
    update({ rule: structuredClone(INITIAL_RULE) })
  }
  // 范围/周期/tab 一变，经营概况里勾选的二级项就失效，顺手收起来
  const resetPanel = () => {
    setBreakdownPicks([])
    setTrafficPage(1)
    setTrafficQuickFilter(null)
    setQuery(previous => (previous.course_deal ? { ...previous, course_deal: "" } : previous))
  }
  const update = (data: Partial<PrincipalQuery>) => {
    // 只有换 tab 才收起面板；改日期/范围这些不动下面的下拉，选过的维度继续生效
    if (data.tab !== undefined) { setOverviewGroup(""); setSortBy(""); setSortOrder("asc"); resetPanel() }
    setQuery(previous => ({
      ...previous,
      ...data,
      ...(data.tab ? { product: "", activity_type: "", course_subtype: "" } : {}),
      ...(data.activity_type !== undefined && data.activity_type !== "class" ? { course_subtype: "" } : {}),
    }))
  }
  const updateRule = (patch: Partial<ConversionRule>) => setQuery(previous => ({ ...previous, rule: { ...previous.rule, ...patch } }))
  function toggleSort(key: string) {
    if (sortBy === key) setSortOrder(order => order === "asc" ? "desc" : "asc")
    else { setSortBy(key); setSortOrder("asc") }
  }
  // 点「成交笔数」：把这个客户在当前范围内的成交逐笔列出来（和列里的数字对齐）
  async function openCustomerDeals(customerId: string, customerName: string, fallback: PrincipalRow | null) {
    if (!customerId) {
      if (fallback) setDetail(fallback)
      return
    }
    setDealDetail({ customer: customerName, rows: fallback ? [fallback] : [], loading: true })
    try {
      // 弹窗里始终逐笔列出，不受列表的「同一人仅显示一次」影响
      const response = await principalApi.query({ ...query, tab: "orders", breakdown: serverPicks, list_view: "order", customer_id: customerId }, 1, 100)
      setDealDetail({ customer: customerName, rows: response.items, loading: false })
    } catch {
      setDealDetail({ customer: customerName, rows: fallback ? [fallback] : [], loading: false })
    }
  }
  // 点「邀约次数 / 取消邀约次数 / 到店次数 / 参与活动」：列出这个客户的对应明细
  useEffect(() => {
    if (!trafficRecordDetail) {
      setTrafficRecordRows([])
      return
    }
    let active = true
    setTrafficRecordLoading(true)
    setTrafficRecordExpanded(false)
    customerDetailApi.get(trafficRecordDetail.customerId)
      .then(detail => {
        if (!active) return
        const { type } = trafficRecordDetail
        const rows: Array<Record<string, unknown>> = type === "activity"
          ? (detail.activities ?? []).map(item => ({
            date: item.date, type: item.type, name: item.name,
            teacher: item.host || "-", role: item.role || "-",
          }))
          : (detail.visit_records ?? [])
            .filter(record => type === "cancelled" ? record.cancelled : type === "arrived" ? record.arrived : true)
            .map(record => ({
              date: record.visit_date, referrer: record.referrer_handler || "-",
              needs: record.needs || "-", arrived: record.arrived, cancelled: record.cancelled,
            }))
        setTrafficRecordRows(rows)
      })
      .catch(() => { if (active) setTrafficRecordRows([]) })
      .finally(() => { if (active) setTrafficRecordLoading(false) })
    return () => { active = false }
  }, [trafficRecordDetail])
  // 经营概况：三张卡一次展开一组；二级项目勾选后筛选下面的列表
  const breakdown = result?.breakdown
  const picksOf = (prefix: string) => breakdownPicks.filter(item => item.startsWith(prefix)).map(item => item.slice(prefix.length))
  // 面板每个维度一个下拉（和自定义筛选同一套控件）：一级维度（付费项目 / 课程类型 / 课程老师 / 引流人）
  // 互斥，子级（卡种 / 具体课程）挂在上一级下面；购买类型是附加条件，可以和付费项目一起用。
  const pickPrefix = (value: string) => value.slice(0, value.indexOf(":"))
  const childPrefixes = (prefix: string) => Object.entries(PARENT_OF).filter(([, parent]) => parent === prefix).map(([child]) => child)
  const chooseBreakdown = (prefix: string, value: string) => {
    // 再点一次已选中的项不取消（要取消请选「全部」）
    if (breakdownPicks.includes(value)) return
    setTrafficPage(1)
    setBreakdownPicks(current => {
      const children = childPrefixes(prefix)
      const kept = current.filter(item => {
        const itemPrefix = pickPrefix(item)
        if (itemPrefix === prefix) return false                       // 同一维度只留新值
        if (children.includes(itemPrefix)) return false               // 换上一层，下面这层作废
        if (COMBINABLE_PREFIXES.has(prefix) || COMBINABLE_PREFIXES.has(itemPrefix)) return true   // 附加条件可以叠加
        return !!PARENT_OF[prefix] && itemPrefix === PARENT_OF[prefix] // 其余视角互斥，只留它的上一级
      })
      return value ? [...kept, value] : kept
    })
  }
  const chooseBreakdownMulti = (prefix: string, values: string[]) => {
    setTrafficPage(1)
    setBreakdownPicks(current => [
      ...current.filter(item => pickPrefix(item) !== prefix),
      ...values,
    ])
  }
  /** 已选中的二级项还原成看得懂的名字（卡种带上所属付费项目、具体课程带上活动类型） */
  const pickLabel = (pick: string): string => {
    const prefix = pickPrefix(pick)
    const value = pick.slice(prefix.length + 1)
    if (prefix === "deals") return breakdown?.deals?.find(item => item.key === value)?.label ?? value
    if (prefix === "buy") return breakdown?.buys?.find(item => item.key === value)?.label ?? value
    if (prefix === "subtype") {
      const parent = (breakdown?.deals ?? []).find(item => (item.subtypes ?? []).some(sub => sub.key === value))
      const sub = parent?.subtypes?.find(item => item.key === value)?.label ?? value
      return parent ? `${parent.label} · ${sub}` : sub
    }
    if (prefix === "type") return breakdown?.courses?.by_type.find(item => item.key === value)?.label ?? value
    if (prefix === "course") {
      const parent = (breakdown?.courses?.by_type ?? []).find(item => (item.subtypes ?? []).some(sub => sub.key === value))
      const sub = parent?.subtypes?.find(item => item.key === value)?.label ?? value
      return parent ? `${parent.label} · ${sub}` : sub
    }
    if (prefix === "teacher") return breakdown?.courses?.by_teacher.find(item => item.key === value)?.label ?? value
    if (prefix === "inviter") return breakdown?.invite_inviters?.find(item => item.key === value)?.label ?? value
    if (prefix === "traffic") return breakdown?.traffic?.find(item => item.key === value)?.label ?? value
    return value
  }
  /** 取消某一项筛选：清掉它自己，带上它下面的子项 */
  const clearPick = (prefix: string, value: string) => {
    setTrafficPage(1)
    setBreakdownPicks(current => current.filter(item => {
      if (item === `${prefix}:${value}`) return false
      return !childPrefixes(prefix).includes(pickPrefix(item))
    }))
  }
  const selectOverviewGroup = (key: "deals" | "courses" | "traffic" | "invite") => {
    setQuery(current => ({ ...current, course_view: "course", participant_scope: "", invite_view: "arrive" }))
    setOverviewGroup(overviewGroup === key ? "" : key)
    resetPanel()
  }
  // 排序交给后端对「整批筛选结果」排（不是只排当前页），这里直接用返回顺序
  const sortedItems = pagination.paginatedItems
  // 与「自定义筛选」一致：名称、说明、可见范围在弹窗里填，保存成功后才进入「已保存」列表
  async function persistRule(name: string, description: string, scope: "private" | "shared", id?: string) {
    const trimmed = name.trim()
    if (!trimmed) { setError("请填写规则名称"); return false }
    if (!Number.isInteger(query.rule.window_days) || query.rule.window_days < 0 || query.rule.window_days > 3650) { setError("请填写多少天内完成：0～3650 的整数，0 表示只看当天"); return false }
    setBusy(true); setError("")
    try {
      const saved = await principalApi.saveRule({
        ...query.rule,
        name: trimmed,
        description: description.trim(),
        scope,
        // 规则连当时的筛选范围一起记住
        organization_id: query.organization_id,
        date_from: query.date_from || "",
        date_to: query.date_to || "",
      }, id)
      setRules(await principalApi.rules()); setRuleId(saved.id); update({ rule: saved.rule })
      return true
    } catch (e) { setError(e instanceof Error ? e.message : "保存失败"); return false } finally { setBusy(false) }
  }
  async function createRule() {
    if (await persistRule(ruleNameDraft, ruleDescriptionDraft, ruleScopeDraft)) {
      setSaveOpen(false); setRuleNameDraft(""); setRuleDescriptionDraft(""); setRuleScopeDraft("private")
    }
  }
  async function removeRule() {
    if (!ruleId) return
    setBusy(true); setError("")
    try {
      await principalApi.deleteRule(ruleId)
      setRules(await principalApi.rules()); setRuleId(""); update({ rule: INITIAL_RULE }); setDeleteOpen(false)
    } catch (e) { setError(e instanceof Error ? e.message : "删除失败") } finally { setBusy(false) }
  }
  async function download() {
    setBusy(true); setError("")
    try { const blob = await principalApi.download({ ...query, tab: listTab, list_view: listView, breakdown: serverPicks,
      ...(showTrafficList ? { export_view: "traffic" as const, export_customer_ids: sortedTrafficCustomers.map(customer => customer.id).filter((id): id is string => !!id) } : {}),
      ...(showInviteArriveList ? { export_view: "invite_arrivals" as const, arrival_view: inviteArriveView,
        export_customer_ids: [...new Set(inviteArriveRows.map(customer => customer.id).filter((id): id is string => !!id))],
        export_columns: visibleInviteColumns.map(column => column.key) } : {}),
    }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = showTrafficList ? "引流客户.xlsx" : showInviteArriveList ? "邀约到店.xlsx" : "组织俱乐部.xlsx"; link.click(); URL.revokeObjectURL(url) }
    catch (e) { setError(e instanceof Error ? e.message : "导出失败") } finally { setBusy(false) }
  }
  async function downloadInviteDetail() {
    if (!inviteDetail) return
    setBusy(true); setError("")
    try {
      const blob = await principalApi.download({
        ...query,
        tab: "overview",
        invite_view: "initiated",
        export_view: "invite_initiated",
        export_columns: ["date", "visit_date", ...visibleInviteDetailColumns.map(column => column.key), "status_label"],
        breakdown: [
          ...serverPicks.filter(value => !value.startsWith("inviter:")),
          `inviter:${inviteDetail.key}`,
        ],
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `${inviteDetail.label}发起邀约.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败")
    } finally {
      setBusy(false)
    }
  }
  // 列表标题与「自定义筛选」结果区一致：日期区间 · 说明
  const dateSummary = query.date_from && query.date_to
    ? `${query.date_from.replaceAll("-", ".")}–${query.date_to.replaceAll("-", ".")}`
    : query.date_from ? `${query.date_from.replaceAll("-", ".")} 起`
      : query.date_to ? `截至 ${query.date_to.replaceAll("-", ".")}` : "全部时间"
  const listUnitLabel = query.tab === "conversion" ? "符合条件客户"
    : query.tab === "orders" || (query.tab === "overview" && overviewGroup === "deals") ? "交易记录"
      : query.tab === "overview" && overviewGroup === "invite"
        ? (query.invite_view === "initiated" ? "发起邀约" : "邀约到店")
        : query.course_view === "participant" ? "参与者" : query.course_view === "teacher_follow_up" ? "老师跟进" : "课程记录"

  // 展开面板：每个维度一个下拉，选项在菜单里（带数量），一行单选
  const referralConversionText = (customers: PrincipalBreakdownCustomer[]) => {
    const consumers = customers.filter(customer => customer.deals > 0)
    const firstLevelKey = breakdown?.traffic_upsell_levels?.[0]?.key
    const trialOnlyCount = firstLevelKey
      ? customers.filter(customer => {
        const levelKeys = (customer.upsell_levels ?? []).map(level => level.key)
        return levelKeys.length === 1 && levelKeys[0] === firstLevelKey
      }).length
      : 0
    const upsellCount = consumers.filter(customer => customer.is_upsell).length
    const rate = (count: number, total: number) => total > 0 ? `${Math.round(count * 1000 / total) / 10}%` : "0%"
    return `（体验卡 ${rate(trialOnlyCount, customers.length)} · 升单 ${rate(upsellCount, consumers.length)}）`
  }
  const panelSelects: { label: string; prefix: string; placeholder: string; multi?: boolean; items: { value: string; label: string; text: string; note?: string; compactText?: boolean; muted?: boolean }[] }[] = []
  if (overviewGroup === "deals") {
    panelSelects.push({
      label: "付费项目", prefix: "deals", placeholder: "全部",
      items: (breakdown?.deals ?? []).map(item => ({ value: `deals:${item.key}`, label: item.label, text: `${item.count} 笔` })),
    })
    const product = (breakdown?.deals ?? []).find(item => picksOf("deals:").includes(item.key))
    if (product?.subtypes?.length) panelSelects.push({
      label: "卡种", prefix: "subtype", placeholder: "全部",
      items: product.subtypes.map(item => ({ value: `subtype:${item.key}`, label: item.label, text: `${item.count} 笔` })),
    })
    panelSelects.push({
      label: "购买类型", prefix: "buy", placeholder: "全部",
      items: (breakdown?.buys ?? []).map(item => ({ value: `buy:${item.key}`, label: item.label, text: `${item.count} 笔` })),
    })
  }
  if (overviewGroup === "courses") {
    const types = breakdown?.courses?.by_type ?? []
    panelSelects.push({
      label: "课程类型", prefix: "type", placeholder: "全部",
      items: types.map(item => ({ value: `type:${item.key}`, label: item.label, text: `${item.count} 场 · ${item.hours ?? 0} 课时` })),
    })
    // 选了某个类型，再列这个类型下面每个具体课程各开了多少场
    const type = types.find(item => picksOf("type:").includes(item.key))
    if (type?.subtypes?.length) panelSelects.push({
      label: "具体课程", prefix: "course", placeholder: "全部",
      items: type.subtypes.map(item => ({ value: `course:${item.key}`, label: item.label, text: `${item.count} 场 · ${item.hours ?? 0} 课时` })),
    })
    panelSelects.push({
      label: "课程老师", prefix: "teacher", placeholder: "全部",
      items: (breakdown?.courses?.by_teacher ?? []).map(item => ({ value: `teacher:${item.key}`, label: item.label, text: `${item.count} 场 · ${item.hours ?? 0} 课时` })),
    })
  }
  /** 「未配置」固定排在下拉第一位 */
  const unassignedFirst = <T extends { key?: string; label: string; muted?: boolean }>(items: T[]): T[] =>
    [...items].sort((a, b) => Number((b.key ?? b.label) === "未配置") - Number((a.key ?? a.label) === "未配置"))
  if (overviewGroup === "invite") {
    panelSelects.push({
      label: "邀约人", prefix: "inviter", placeholder: "全部",
      items: (breakdown?.invite_inviters ?? []).map(item => ({
        value: `inviter:${item.key}`,
        label: item.label,
        text: `发起邀约 ${item.initiated_count} 次`,
        muted: item.key === "未配置",
      })),
    })
    panelSelects.push({
      label: "引流人", prefix: "traffic", placeholder: "全部",
      items: (breakdown?.traffic ?? []).map(item => ({
        value: `traffic:${item.key}`,
        label: item.label,
        text: `邀约到店 ${item.invite_count ?? 0} 次`,
        muted: item.key === "未配置",
      })),
    })
  }
  if (overviewGroup === "traffic") {
    panelSelects.push({
      label: "引流人", prefix: "traffic", placeholder: "全部",
      items: unassignedFirst((breakdown?.traffic ?? []).map(item => ({
        value: `traffic:${item.key}`,
        label: item.label,
        text: `引流 ${item.count} 人`,
        note: referralConversionText(item.customers ?? []),
        compactText: true,
        muted: item.key === "未配置",
      }))),
    })
    panelSelects.push({
      label: "会员身份", prefix: "identity", placeholder: "全部",
      items: unassignedFirst((breakdown?.traffic_filters?.identity ?? []).map(item => ({
        value: `identity:${item.key}`,
        label: item.label,
        text: `${item.count} 人`,
        muted: item.key === "未配置",
      }))),
    })
    panelSelects.push(
      {
        label: "升单情况", prefix: "upsell", placeholder: "全部", multi: true,
        items: (breakdown?.traffic_filters?.upsell ?? []).map(item => ({
          value: `upsell:${item.key}`,
          label: item.label,
          text: `${item.count} 人`,
        })),
      },
      {
        label: "跟进阶段", prefix: "stage", placeholder: "全部",
        items: unassignedFirst((breakdown?.traffic_filters?.stage ?? []).map(item => ({
          value: `stage:${item.key}`,
          label: item.label,
          text: `${item.count} 人`,
          muted: item.key === "未配置",
        }))),
      },
      {
        label: "流量来源", prefix: "source", placeholder: "全部",
        items: unassignedFirst((breakdown?.traffic_filters?.source ?? []).map(item => ({
          value: `source:${item.key}`,
          label: item.label,
          text: `${item.count} 人`,
          muted: item.key === "未配置",
        }))),
      },
      {
        label: "客户标签", prefix: "tag", placeholder: "全部",
        items: unassignedFirst((breakdown?.traffic_filters?.tag ?? []).map(item => ({ value: `tag:${item.key}`, label: item.label, text: `${item.count} 人` }))),
      },
    )
  }
  // 引流人组：每个引流人带来客户的成交量 + 每个付费项目的成交数
  const pickedTraffic = picksOf("traffic:")
  // 引流客户列表：引流人 + 跟进阶段 + 流量来源 + 客户标签一起筛
  const trafficCustomers = (breakdown?.traffic ?? [])
    .flatMap(item => (item.customers ?? []).map(customer => ({ ...customer, referrer: item.label })))
    .filter(customer => {
      const identity = picksOf("identity:")
      if (identity.length && !identity.includes(customer.identity ?? "")) return false
      const stage = picksOf("stage:")
      if (stage.length && !stage.includes(customer.follow_up_status ?? "")) return false
      const source = picksOf("source:")
      if (source.length && !source.includes(customer.traffic_source ?? "")) return false
      const tags = picksOf("tag:")
      if (tags.length && !tags.some(tag => (customer.tags ?? []).includes(tag))) return false
      const upsellSituations = picksOf("upsell:")
      if (upsellSituations.length) {
        const levelKeys = (customer.upsell_levels ?? []).map(level => level.key)
        const currentLevelKey = levelKeys.at(-1)
        if (!currentLevelKey || !upsellSituations.includes(currentLevelKey)) return false
      }
      const inviters = picksOf("inviter:")
      if (inviters.length && !inviters.some(name => (customer.inviters ?? []).includes(name))) return false
      return pickedTraffic.length === 0 || pickedTraffic.includes(customer.referrer)
    })
  const trafficProductCounts = new Map<string, { key: string; label: string; count: number }>()
  for (const customer of trafficCustomers) {
    for (const product of customer.products ?? []) {
      const current = trafficProductCounts.get(product.key)
      trafficProductCounts.set(product.key, { key: product.key, label: product.label, count: (current?.count ?? 0) + product.count })
    }
  }
  // 汇总条跟着「筛选后这一批明细」走（后端按当前勾选算好 list_summary），几个数之间互相影响
  const listScope = result?.list_summary
  // 引流人数：成交构成（客户成交按付费项目拆）+ 会员卡子类；会员身份人数在筛选下拉里看
  const trafficDealTotal = trafficCustomers.reduce((sum, customer) => sum + (customer.deals ?? 0), 0)
  // 邀约 / 取消邀约 / 到店：次按记录累加；人数按同一人去重
  const trafficVisitStats = trafficCustomers.reduce((totals, customer) => {
    const initiated = customer.initiated_count ?? 0
    const invite = customer.invite_count ?? 0
    const cancel = customer.cancel_count ?? 0
    const noShow = customer.no_show_count ?? Math.max(0, invite - (customer.arrive_count ?? 0))
    const arrive = customer.arrive_count ?? 0
    const invited = cancel + noShow + arrive
    return {
      initiatedCount: totals.initiatedCount + initiated,
      invitedCount: totals.invitedCount + invited,
      cancelledCount: totals.cancelledCount + cancel,
      noShowCount: totals.noShowCount + noShow,
      arrivedCount: totals.arrivedCount + arrive,
      initiatedPeople: totals.initiatedPeople + (initiated > 0 ? 1 : 0),
      invitedPeople: totals.invitedPeople + (invited > 0 ? 1 : 0),
      cancelledPeople: totals.cancelledPeople + (cancel > 0 ? 1 : 0),
      noShowPeople: totals.noShowPeople + (noShow > 0 ? 1 : 0),
      arrivedPeople: totals.arrivedPeople + (arrive > 0 ? 1 : 0),
    }
  }, {
    initiatedCount: 0, invitedCount: 0, cancelledCount: 0, noShowCount: 0, arrivedCount: 0,
    initiatedPeople: 0, invitedPeople: 0, cancelledPeople: 0, noShowPeople: 0, arrivedPeople: 0,
  })
  // 发起邀约按邀约记录的创建日期统计，与按预计到访日期统计的“邀约到店”分开。
  const inviteInitiatorRows = useMemo(() => {
    const selected = new Set(picksOf("inviter:"))
    return (breakdown?.invite_inviters ?? []).filter(item => !selected.size || selected.has(item.key))
  }, [breakdown?.invite_inviters, breakdownPicks])
  const inviteInitiatedTotal = inviteInitiatorRows.reduce((sum, item) => sum + item.initiated_count, 0)
  const inviteInitiatedPeople = new Set(
    inviteInitiatorRows.flatMap(item => (item.records ?? []).map(record => record.customer_id).filter(Boolean)),
  ).size
  // 开发热更新或旧页面缓存可能保留新增 visit_date 之前的结果；刷新后同步替换已打开弹窗的数据。
  useEffect(() => {
    if (!inviteDetail) return
    const latest = (breakdown?.invite_inviters ?? []).find(item => item.key === inviteDetail.key)
    if (latest?.records && latest.records !== inviteDetail.records) {
      setInviteDetail(current => current ? { ...current, records: latest.records ?? [] } : current)
    }
  }, [breakdown?.invite_inviters, inviteDetail?.key])
  // 邀约到店按所选日期内的次统计，三种状态互斥且合计等于总次。
  const overviewCards = [
    { id: "traffic", group: "traffic" as const, title: "引流人数（效果）", value: `${result?.summary["引流人数"] ?? "—"}`, unit: "人",
      sub: `${(breakdown?.traffic ?? []).filter(item => item.key !== "未配置").length} 位引流人 · 成交 ${(breakdown?.traffic ?? []).reduce((sum, item) => sum + (item.deal_count ?? 0), 0)} 笔`, help: <>按照引流日期进行统计</> },
    { id: "invite", group: "invite" as const, title: "邀约到店", value: `${trafficVisitStats.invitedCount}`, unit: "次",
      sub: `取消 ${trafficVisitStats.cancelledCount} · 未到场 ${trafficVisitStats.noShowCount} · 已到场 ${trafficVisitStats.arrivedCount}`,
      help: <>统计周期内邀约页面里的客户总数</> },
    { id: "courses", group: "courses" as const, title: "课程数据", value: `${result?.summary["课程数"] ?? "—"}`, unit: "场",
      sub: `总 ${result?.summary["课时数"] ?? "—"} 课时`, help: null },
    { id: "deals", group: "deals" as const, title: "成交量", value: `${result?.summary["交易笔数"] ?? "—"}`, unit: "笔",
      sub: `会员卡 ${(breakdown?.deals ?? []).filter(item => item.key === "membership").reduce((sum, item) => sum + item.count, 0)} 笔 · 其他 ${(breakdown?.deals ?? []).filter(item => item.key !== "membership").reduce((sum, item) => sum + item.count, 0)} 笔`, help: null },
  ]
  const productTotals = [...trafficProductCounts.values()].sort((a, b) => b.count - a.count)
  const scopeNumber = (key: string, fallback: string | number | undefined) => listScope?.[key] ?? fallback ?? "—"
  const panelMetrics: {
    label: string; text: string; hint?: string; help?: ReactNode
    /** 数字下面的补充说明 */
    sub?: ReactNode
    /** 引流客户列表：按有无对应记录筛（本地筛） */
    filter?: TrafficQuickFilter
    /** 二级维度筛（走后端 breakdown picks，例如 buy:升单） */
    pick?: string
    /** 课程列表筛：当日成交 / 关联成交 */
    courseDeal?: "" | "same_day" | "related"
    /** 与主指标合并展示的第二项课程成交数据 */
    secondaryCourseDeal?: { label: string; text: string; value: "same_day" | "related" }
  }[] = overviewGroup === "deals"
    ? [
      { label: "成交量", text: `${scopeNumber("成交量", result?.summary["交易笔数"])} 笔` },
      { label: "总成交人数", text: `${scopeNumber("成交人数", result?.summary["成交人数"])} 人` },
      { label: "升单人数", text: `${scopeNumber("升单人", 0)} 人`, help: <>「升单配置」页面配置，同一人多次升单，仅记作一次</>, pick: "buy:升单" },
      { label: "升单量", text: `${scopeNumber("升单量", 0)} 次`, help: <>同一人多次升单，按升单次数重复统计</>, pick: "buy:升单" },
    ]
    : overviewGroup === "courses"
      ? [
        { label: "课程数", text: `${scopeNumber("课程数", result?.summary["课程数"])} 场`,
          sub: <>总 {scopeNumber("课时数", result?.summary["课时数"])} 课时</> },
        { label: "上课人次", text: `${scopeNumber("上课人次", result?.summary["到场人次"])} 次`,
          sub: <>上课人数 {scopeNumber("上课人数", result?.summary["到场人数"])} 人</> },
        { label: "服务人次", text: `${scopeNumber("服务人次", result?.summary["服务人次"])} 人次`,
          sub: <>案主 {scopeNumber("服务案主人次", result?.summary["服务案主人次"])} · 参与者 {scopeNumber("服务参与人次", result?.summary["服务参与人次"])}</>,
          help: <>与课程记录的服务总人次一致：案主人次＋参与人次，同一人参与多堂课程分别累计。</> },
      ]
      : overviewGroup === "invite"
        ? [
          { label: "邀约到店总次", text: `${trafficVisitStats.invitedCount} 次`,
            sub: <>{trafficVisitStats.invitedPeople} 人</>,
            help: <>已取消 + 未到店 + 已到店；次按记录累加，人数同一人只算一次</> },
          { label: "取消", text: `${trafficVisitStats.cancelledCount} 次`,
            sub: <>{trafficVisitStats.cancelledPeople} 人</> },
          { label: "未到店", text: `${trafficVisitStats.noShowCount} 次`,
            sub: <>{trafficVisitStats.noShowPeople} 人</>,
            help: <>既未取消也未到店</> },
          { label: "已到店", text: `${trafficVisitStats.arrivedCount} 次`,
            sub: <>{trafficVisitStats.arrivedPeople} 人</> },
          { label: "发起邀约次", text: `${inviteInitiatedTotal} 次`,
            sub: <>{inviteInitiatedPeople} 人</>,
            help: <>按邀约记录的创建日期统计，所选时间段内每创建一条邀约记 1 次</> },
        ]
        : overviewGroup === "traffic"
        ? [
          { label: "邀约到店", text: `${trafficVisitStats.invitedCount} 次`,
            sub: <>{trafficVisitStats.invitedPeople} 人</>,
            filter: { kind: "initiated", label: "有邀约（含取消）" },
            help: <>按所选日期内的邀约记录统计，含已取消记录，同一人多次分别计数；下方三种状态合计等于总次</> },
          { label: "已取消", text: `${trafficVisitStats.cancelledCount} 次`,
            sub: <>{trafficVisitStats.cancelledPeople} 人</>,
            filter: { kind: "cancel", label: "有取消邀约" } },
          { label: "未到场", text: `${trafficVisitStats.noShowCount} 次`,
            sub: <>{trafficVisitStats.noShowPeople} 人</>,
            help: <>既未取消也未到店</> },
          { label: "已到场", text: `${trafficVisitStats.arrivedCount} 次`,
            sub: <>{trafficVisitStats.arrivedPeople} 人</>,
            filter: { kind: "arrive", label: "有到店" } },
        ]
        : []
  const showTrafficList = query.tab === "overview" && overviewGroup === "traffic"
  const showCourseDealOverviewList = query.tab === "overview" && (overviewGroup === "courses" || overviewGroup === "deals")
  const showTeacherFollowUpList = (query.tab === "courses" || (query.tab === "overview" && overviewGroup === "courses")) && query.course_view === "teacher_follow_up"
  const showInviteListTabs = query.tab === "overview" && overviewGroup === "invite"
  const showInviteArriveList = showInviteListTabs && (query.invite_view || "arrive") === "arrive"
  const showInviteInitiatedList = showInviteListTabs && query.invite_view === "initiated"
  const sortedInviteDetailRecords = useMemo(() => {
    const rows = [...(inviteDetail?.records ?? [])]
    const statusOrder: Record<string, number> = { cancelled: 0, no_show: 1, arrived: 2 }
    const valueOf = (record: (typeof rows)[number]) => {
      if (inviteDetailSort.field === "status_label") return statusOrder[record.status] ?? 99
      if (inviteDetailSort.field === "date") return record.date
      if (inviteDetailSort.field === "name") return record.name
      const value = record[inviteDetailSort.field as keyof InviteInitiatedRecord]
      return Array.isArray(value) ? value.join("、") : value ?? ""
    }
    const direction = inviteDetailSort.order === "asc" ? 1 : -1
    return rows.sort((left, right) => {
      const leftValue = valueOf(left)
      const rightValue = valueOf(right)
      const compared = typeof leftValue === "number" && typeof rightValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "zh-CN")
      return compared * direction || right.date.localeCompare(left.date)
    })
  }, [inviteDetail, inviteDetailSort])
  const toggleInviteDetailSort = (field: string) => {
    setInviteDetailSort(current => current.field === field
      ? { field, order: current.order === "asc" ? "desc" : "asc" }
      : { field, order: field === "date" ? "desc" : "asc" })
  }
  // 邀约到店列表：按首次到店日期排序，每人一行；支持表头点击排序
  const inviteArriveRows = useMemo(() => {
    const customers = trafficCustomers.filter(customer => (customer.arrive_count ?? 0) > 0 || customer.arrive_date)
    const rows = inviteArriveView === "date"
      ? customers.flatMap(customer => (customer.arrival_records ?? []).map(arrival => ({ ...customer, ...arrival, arrival_id: arrival.id })))
      : customers
    const dir = trafficSortOrder === "asc" ? 1 : -1
    if (!trafficSortBy) {
      return rows.slice().sort((a, b) => (b.arrive_date || "").localeCompare(a.arrive_date || "") || a.name.localeCompare(b.name, "zh-CN"))
    }
    const valueOf = (customer: (typeof trafficCustomers)[number]): string | number => {
      switch (trafficSortBy) {
        case "name": return customer.name
        case "identity": return customer.identity ?? ""
        case "referrer": return customer.referrer ?? ""
        case "referrer_handler": return customer.referrer_handler ?? ""
        case "follow_up_status": return customer.follow_up_status ?? ""
        case "traffic_source": return customer.traffic_source ?? ""
        case "tags": return (customer.tags ?? []).join("、")
        case "deals": return customer.deals ?? 0
        case "invite_count": return customer.invite_count ?? 0
        case "cancel_count": return customer.cancel_count ?? 0
        case "no_show_count": return customer.no_show_count ?? 0
        case "arrive_count": return customer.arrive_count ?? 0
        case "activity_count": return customer.activity_count ?? 0
        case "visit_interval": return customer.visit_interval ?? ""
        case "same_day_deals": return customer.same_day_deals ?? 0
        case "arrive_inviter": return customer.arrive_inviter ?? ""
        case "visit_purpose": return customer.visit_purpose ?? ""
        case "trauma_history": return customer.trauma_history ?? ""
        case "current_block": return customer.current_block ?? ""
        case "work_info": return customer.work_info ?? ""
        case "other_info": return customer.other_info ?? ""
        default: return customer.arrive_date ?? ""
      }
    }
    return rows.slice().sort((a, b) => {
      const av = valueOf(a)
      const bv = valueOf(b)
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir
      return String(av).localeCompare(String(bv), "zh-CN") * dir
    })
  }, [trafficCustomers, inviteArriveView, trafficSortBy, trafficSortOrder])
  const inviteArrivePageCount = Math.max(1, Math.ceil(inviteArriveRows.length / PAGE_SIZE))
  const inviteArriveCurrentPage = Math.min(inviteArrivePage, inviteArrivePageCount)
  const inviteArrivePageRows = inviteArriveRows.slice((inviteArriveCurrentPage - 1) * PAGE_SIZE, inviteArriveCurrentPage * PAGE_SIZE)
  // 当前生效的筛选（课程数 / 成交量）：显示在列表标题右边，逐个可取消
  const activeFilterChips = useMemo(() => {
    if (showTrafficList) return []
    const chips: { key: string; label: string; clear: () => void }[] = []
    for (const pick of breakdownPicks) {
      const prefix = pickPrefix(pick)
      if (!["deals", "subtype", "buy", "type", "course", "teacher", "inviter", "traffic"].includes(prefix)) continue
      chips.push({ key: pick, label: pickLabel(pick), clear: () => clearPick(prefix, pick.slice(prefix.length + 1)) })
    }
    if (overviewGroup === "courses" && query.course_deal) {
      chips.push({
        key: `course_deal:${query.course_deal}`,
        label: query.course_deal === "same_day" ? "课程当日成交" : "关联成交",
        clear: () => update({ course_deal: "" }),
      })
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakdownPicks, breakdown, overviewGroup, query.course_deal, showTrafficList])
  // 参与者视图单独一套列宽（课程名 +40px、人员类型 -60px）
  const participantTableView = (query.tab === "courses" || (query.tab === "overview" && overviewGroup === "courses"))
    && query.course_view === "participant"
  // 参与者视图用固定 px 列宽（内联样式），其它视图仍用百分比
  const columnWidthClass = (key: string) => (participantTableView ? "" : (COLUMN_WIDTH[key] ?? ""))
  const columnWidthStyle = (key: string, label: string) => {
    const min = headerMinWidth(key, label)
    if (!participantTableView) return { minWidth: min }
    return { width: Math.max(PARTICIPANT_COLUMN_WIDTH[key] ?? 0, min), minWidth: min }
  }
  // 表格最小宽度＝各列表头所需宽度之和：比它还窄才会横向滚动，正常情况下不会把表格撑出卡片
  const listTableMinWidth = (result?.columns ?? []).reduce((total, column) => total + headerMinWidth(column.key, column.label), 0)
  const toggleTrafficSort = (field: string) => {
    setTrafficPage(1)
    setInviteArrivePage(1)
    if (trafficSortBy === field) setTrafficSortOrder(order => (order === "asc" ? "desc" : "asc"))
    else { setTrafficSortBy(field); setTrafficSortOrder("asc") }
  }
  const trafficQuickFiltered = useMemo(() => {
    if (!trafficQuickFilter) return trafficCustomers
    return trafficCustomers.filter(customer => {
      if (["initiated", "invite", "cancel", "no_show", "arrive"].includes(trafficQuickFilter.kind) && customer.referrer === "未配置") return false
      switch (trafficQuickFilter.kind) {
        case "initiated": return (customer.initiated_count ?? (customer.invite_count ?? 0) + (customer.cancel_count ?? 0)) > 0
        case "invite": return (customer.invite_count ?? 0) > 0
        case "cancel": return (customer.cancel_count ?? 0) > 0
        case "no_show": return (customer.no_show_count ?? Math.max(0, (customer.invite_count ?? 0) - (customer.arrive_count ?? 0))) > 0
        case "arrive": return (customer.arrive_count ?? 0) > 0
        case "deals": return (customer.deals ?? 0) > 0
        case "product": return (customer.products ?? []).some(item => item.key === trafficQuickFilter.value)
        case "subtype": return (customer.subtypes ?? []).some(item => item.key === trafficQuickFilter.value)
        default: return true
      }
    })
  }, [trafficCustomers, trafficQuickFilter])
  const toggleTrafficQuickFilter = (next: TrafficQuickFilter) => {
    setTrafficPage(1)
    const active = trafficQuickFilter?.kind === next.kind && (trafficQuickFilter?.value ?? "") === (next.value ?? "")
    setTrafficQuickFilter(active ? null : next)
  }
  const isQuickFilterActive = (kind: TrafficQuickFilter["kind"], value = "") =>
    trafficQuickFilter?.kind === kind && (trafficQuickFilter?.value ?? "") === value
  // 指标卡里的「数字 + 单位」拆开显示：数字大字、单位小字
  const splitMetricText = (text: string): [string, string] => {
    const matched = text.match(/^(\S+)\s*(.*)$/)
    return matched ? [matched[1], matched[2]] : [text, ""]
  }
  // 换了筛选条件后列表会变短，浏览器会把滚动位置往上顶；这里始终把列表顶到可视区，
  // 避免视口停在半截的卡片/面板上。列表本来就可见时不会滚动。
  const listAnchorKey = [
    listTab, query.organization_id, query.date_from, query.date_to, query.activity_type,
    query.course_subtype, query.order_filter, query.course_deal, breakdownPicks.join(","),
    trafficQuickFilter ? `${trafficQuickFilter.kind}:${trafficQuickFilter.value ?? ""}` : "",
  ].join("|")
  // 切换 tab 或切换三张卡时不滚动：这时候列表是被下面的内容顶下去的，不是「筛选后变短」
  const lastListContextRef = useRef(`${query.tab}|${overviewGroup}`)
  useEffect(() => {
    const context = `${query.tab}|${overviewGroup}`
    const contextChanged = lastListContextRef.current !== context
    lastListContextRef.current = context
    if (contextChanged) return
    const element = listCardRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    // 数据变少时页面会变短，浏览器会把视口往上顶、列表被顶出可视区；这种情况下把列表带回顶部。
    // 列表本来就在可视区里则不动，避免用户刚点完筛选就被滚走。
    if (rect.top >= window.innerHeight - 40 || rect.bottom <= 0) {
      element.scrollIntoView({ block: "start" })
    }
  }, [listAnchorKey])
  // 明细弹窗里的空值统一显示成浅灰短横线（和列表里的占位一致）
  const recordValue = (value: unknown) => {
    const text = String(value ?? "")
    return text && text !== "-" ? text : <span className="text-[#c9cdd4]">-</span>
  }
  const trafficSortValue = (customer: PrincipalBreakdownCustomer & { referrer?: string }, field: string): string | number => {
    switch (field) {
      case "referrer": return customer.referrer ?? ""
      case "referrer_handler": return customer.referrer_handler ?? ""
      case "referral_date": return customer.referral_date ?? ""
      case "identity": return customer.identity ?? ""
      case "follow_up_status": return customer.follow_up_status ?? ""
      case "traffic_source": return customer.traffic_source ?? ""
      case "tags": return (customer.tags ?? []).join("、")
      case "visit_purpose": return customer.visit_purpose ?? ""
      case "trauma_history": return customer.trauma_history ?? ""
      case "current_block": return customer.current_block ?? ""
      case "work_info": return customer.work_info ?? ""
      case "other_info": return customer.other_info ?? ""
      case "visit_interval": {
        const days = Number.parseInt(customer.visit_interval ?? "", 10)
        return Number.isNaN(days) ? -1 : days
      }
      case "deals": return customer.deals ?? 0
      case "invite_count": return customer.invite_count ?? 0
      case "cancel_count": return customer.cancel_count ?? 0
      case "arrive_count": return customer.arrive_count ?? 0
      case "activity_count": return customer.activity_count ?? 0
      default: return ""
    }
  }
  const sortedTrafficCustomers = useMemo(() => {
    if (!trafficSortBy) return trafficQuickFiltered
    const direction = trafficSortOrder === "asc" ? 1 : -1
    return [...trafficQuickFiltered].sort((a, b) => {
      const left = trafficSortValue(a, trafficSortBy)
      const right = trafficSortValue(b, trafficSortBy)
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction
      return String(left).localeCompare(String(right), "zh-CN") * direction
    })
  }, [trafficQuickFiltered, trafficSortBy, trafficSortOrder])
  const trafficPageCount = Math.max(1, Math.ceil(sortedTrafficCustomers.length / PAGE_SIZE))
  const trafficCurrentPage = Math.min(trafficPage, trafficPageCount)
  const trafficRows = sortedTrafficCustomers.slice((trafficCurrentPage - 1) * PAGE_SIZE, trafficCurrentPage * PAGE_SIZE)
  const TrafficSortArrow = ({ field }: { field: string }) => (
    <span className="inline-flex flex-col">
      <span className={`text-[8px] leading-[8px] ${trafficSortBy === field && trafficSortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
      <span className={`-mt-[1px] text-[8px] leading-[8px] ${trafficSortBy === field && trafficSortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
    </span>
  )
  const TrafficSortHead = ({ label, field, width, align = "left", className = "" }: { label: string; field: string; width: string; align?: "left" | "right"; className?: string }) => (
    <TableHead className={`h-9 ${width} px-3 text-[11px] font-normal ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        type="button"
        onClick={() => toggleTrafficSort(field)}
        className={`inline-flex max-w-full cursor-pointer select-none items-center gap-1 hover:text-[#2b2f36] ${align === "right" ? "justify-end" : ""}`}
      >
        <span className="truncate">{label}</span>
        <TrafficSortArrow field={field} />
      </button>
    </TableHead>
  )
  // 引流客户列表：每一列的内容（列可隐藏/排序，所以统一用 key 渲染）
  const renderTrafficCell = (key: string, customer: (typeof trafficCustomers)[number]) => {
    // 缩略时单行截断，展开时整列换行显示全文
    const textCls = expandTrafficCells ? "block max-w-full whitespace-normal break-words" : "block max-w-full truncate"
    const muted = (value?: string) => (value && value !== "未配置" ? <span className={textCls} title={value}>{value}</span> : <EmptyValue />)
    switch (key) {
      case "name":
        return (
          <div className="min-w-0">
            {customer.id ? (
              <button
                type="button"
                onClick={() => setDetailCustomerId(String(customer.id))}
                className={`${textCls} text-left text-[#2b2f36] hover:underline`}
                title={customer.name}
              >
                {customer.name}
              </button>
            ) : <span className={`${textCls} text-[#2b2f36]`}>{customer.name}</span>}
            <div className={`${expandTrafficCells ? "whitespace-normal" : "truncate"} text-[11px] text-[#a1a6ad]`} title={customer.referral_date || undefined}>{customer.referral_date || <EmptyValue />}</div>
          </div>
        )
      case "referrer":
        return muted(customer.referrer)
      case "referrer_handler":
        return muted(customer.referrer_handler)
      case "identity":
        return <span className={textCls + " text-[#4e535a]"}>{muted(customer.identity)}</span>
      case "follow_up_status":
        return <span className={textCls + " text-[#4e535a]"}>{muted(customer.follow_up_status)}</span>
      case "traffic_source":
        return <span className={textCls + " text-[#4e535a]"}>{muted(customer.traffic_source)}</span>
      case "tags":
        return (customer.tags ?? []).length
          ? <span className={`${textCls} text-[#646a73]`} title={(customer.tags ?? []).join("、")}>{(customer.tags ?? []).join("、")}</span>
          : <EmptyValue />
      // 客户档案里的几项：内容较长，单行截断 + 悬停看全文
      case "visit_purpose":
        return muted(customer.visit_purpose)
      case "trauma_history":
        return muted(customer.trauma_history)
      case "current_block":
        return muted(customer.current_block)
      case "work_info":
        return muted(customer.work_info)
      case "other_info":
        return muted(customer.other_info)
      case "deals":
        return customer.deals
          ? <button type="button" onClick={() => openCustomerDeals(String(customer.id ?? ""), customer.name, null)} className="cursor-pointer tabular-nums hover:underline">{customer.deals}</button>
          : <EmptyValue />
      case "invite_count":
        return customer.invite_count
          ? <button type="button" onClick={() => setTrafficRecordDetail({ customerId: String(customer.id ?? ""), name: customer.name, type: "invited" })} className="cursor-pointer tabular-nums hover:underline">{customer.invite_count}</button>
          : <EmptyValue />
      case "cancel_count":
        return customer.cancel_count
          ? <button type="button" onClick={() => setTrafficRecordDetail({ customerId: String(customer.id ?? ""), name: customer.name, type: "cancelled" })} className="cursor-pointer tabular-nums hover:underline">{customer.cancel_count}</button>
          : <EmptyValue />
      case "arrive_count":
        return customer.arrive_count
          ? <button type="button" onClick={() => setTrafficRecordDetail({ customerId: String(customer.id ?? ""), name: customer.name, type: "arrived" })} className="cursor-pointer tabular-nums hover:underline">{customer.arrive_count}</button>
          : <EmptyValue />
      case "visit_interval":
        return customer.visit_interval && customer.visit_interval !== "-"
          ? <button type="button" onClick={() => setTrafficRecordDetail({ customerId: String(customer.id ?? ""), name: customer.name, type: "arrived" })} className="cursor-pointer tabular-nums hover:underline">{customer.visit_interval}</button>
          : <EmptyValue />
      case "activity_count":
        return customer.activity_count
          ? <button type="button" onClick={() => setTrafficRecordDetail({ customerId: String(customer.id ?? ""), name: customer.name, type: "activity" })} className="cursor-pointer tabular-nums hover:underline">{customer.activity_count}</button>
          : <EmptyValue />
      default:
        return <EmptyValue />
    }
  }
  // 明细弹窗：标题用客户/课程名，副标题是日期 · 项目 · 组织
  const detailEntries = useMemo(() => {
    const entries = parseDetails(detail?.details ?? [])
    return detailTag ? entries.filter(entry => entry.tag === detailTag) : entries
  }, [detail, detailTag])
  const detailTitle = detail ? String(detail.customer ?? detail.name ?? "关联明细") : ""
  const detailSubtitle = detail
    ? [detail.date, detail.label ?? detail.type, detail.organization].filter(value => value !== undefined && value !== null && value !== "").map(String).join(" · ")
    : ""

  /**
   * 能不能看转化分析：metadata 要等后端把组织/客户/课程都算一遍才回来（比较慢），
   * 所以先用登录时存下来的权限判断，tab 一进页面就能显示，metadata 回来后再以它为准。
   */
  const cachedTransactionAccess = (() => {
    try {
      return JSON.parse(localStorage.getItem("userEditPermissions") || "{}")?.customer_access?.transaction_access as string | undefined
    } catch {
      return undefined
    }
  })()
  const canViewDetailTabs = metadata ? metadata.transaction_access === "detail" : cachedTransactionAccess === "detail"
  const visibleTabs = TABS.filter(t => canViewDetailTabs || !["orders", "conversion"].includes(t.key))
  // 别人共享的规则可以选用，但不能更新/删除
  const selectedRule = rules.find(item => item.id === ruleId)
  const canManageSelectedRule = !!selectedRule && selectedRule.can_manage !== false
  return (
    <div className="min-h-full bg-[#f4f5f6] p-4 pb-6">
      {/* 与「付费项目」一致的顶部 tab 栏：白条 + 3px 蓝色下划线贴底 */}
      <div className="mb-3 flex h-[52px] items-center rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex h-full min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map(tab => (
            <button
              key={tab.key}
              className={`relative flex h-full shrink-0 items-center whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${query.tab === tab.key ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
              onClick={() => update({ tab: tab.key, course_view: "course", participant_scope: "" })}
            >
              {tab.label}
              {query.tab === tab.key && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
            </button>
          ))}
        </div>
      </div>

      <section className="mb-3 rounded-xl bg-white px-[22px] py-4 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        {query.tab === "conversion" && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-[#1f2329]"><span className="h-3 w-[3px] rounded-[1px] bg-[#3370ff]"></span>筛选范围</span>
            <span className="text-[11px] text-[#8f959e]">决定这批数据从哪来</span>
              <div className="ml-auto flex min-h-8 flex-wrap items-center justify-end gap-2">
                <span className="text-[12px] text-[#8f959e]">已保存</span>
                <SelectDropdown
                  size="sm"
                  className="w-[170px]"
                  value={ruleId}
                  options={[
                    { value: "", label: "未保存规则（临时）" },
                    ...rules.map(r => ({ value: r.id, label: r.rule.name, rightLabel: `${r.owner_name || "未知"} · ${r.rule.scope === "shared" ? "共享" : "个人"}` })),
                  ]}
                  onChange={value => {
                    const found = rules.find(r => r.id === value)
                    const next = found?.rule ? structuredClone(found.rule) : INITIAL_RULE
                    setRuleId(value)
                    // 规则里存过范围才恢复，老规则不动当前选择
                    const hasRange = !!(next.organization_id || next.date_from || next.date_to)
                    update({
                      rule: next,
                      ...(hasRange ? {
                        organization_id: next.organization_id || "",
                        date_from: next.date_from || null,
                        date_to: next.date_to || null,
                      } : {}),
                    })
                  }}
                  buttonClassName="!h-8 !rounded-[4px] !border !border-[#dee0e3] !bg-white !shadow-none"
                  dropdownWidth={240}
                  placeholder="选择已保存规则"
                />
                <Button variant="outline" size="sm" disabled={busy} onClick={() => {
                  // 与「自定义筛选 → 保存模板」一致：每次打开都是空名称，由使用者自己起名
                  setRuleNameDraft("")
                  setRuleDescriptionDraft("")
                  setRuleScopeDraft("private")
                  setSaveOpen(true)
                }} className="h-8 rounded-[4px] border-[#dee0e3] bg-white px-3 text-[12px] font-normal text-[#4e535a] shadow-none hover:bg-[#f5f6f7]"><Save className="mr-1 h-3.5 w-3.5" />保存规则</Button>
                {canManageSelectedRule && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleteOpen(true)} className="h-8 w-8 rounded-[4px] p-0 shadow-none hover:bg-[#fff4f4]"><Trash2 className="h-3.5 w-3.5 text-[#d85b65]" /></Button>}
              </div>
          </div>
        )}

        {query.tab === "conversion" ? (
          /* 转化分析：与「自定义筛选」同一套日期控件，组织/俱乐部 + 统计周期在同一栏里 */
          <AnalysisPeriodFilter
            inlineLabel
            dateFrom={query.date_from || ""}
            dateTo={query.date_to || ""}
            onChange={({ date_from, date_to }) => update({ date_from: date_from || null, date_to: date_to || null })}
            leading={<>
              <span className="text-[11px] font-medium text-[#4e535a]">组织/俱乐部</span>
              <SelectDropdown
                size="sm"
                className="w-[160px]"
                value={query.organization_id}
                options={[{ value: "", label: "全部可见组织/俱乐部" }, ...(metadata?.organizations || []).map(org => ({ value: org.id, label: org.name }))]}
                onChange={organization_id => update({ organization_id })}
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[11px] !shadow-none"
                placeholderColor="text-[#8f959e]"
              />
            </>}
          />
        ) : (
          /* 其余 tab：标签列 + 控件列对齐，两行（组织/俱乐部、统计周期） */
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]"><span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]"></span>范围</span>
              <div className="flex flex-wrap items-center gap-2">
                <SelectDropdown
                  size="sm"
                  className="w-[150px]"
                  value={query.organization_id}
                  options={[{ value: "", label: "全部可见组织/俱乐部" }, ...(metadata?.organizations || []).map(org => ({ value: org.id, label: org.name }))]}
                  onChange={organization_id => update({ organization_id })}
                  buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2 !text-[11px] !shadow-none"
                  placeholderColor="text-[#8f959e]"
                />
                {/* 经营概况那边的付费项目筛选已经挪到展开面板里，这里只留给「交易记录」用 */}
                {query.tab === "orders" && (
                  <SelectDropdown
                    size="sm"
                    className="w-[150px]"
                    value={query.product}
                    options={[
                      { value: "", label: "全部成交产品" },
                      ...(metadata?.products || []).map(p => ({ value: p.key, label: p.label })),
                      { value: "coarse", label: "粗门次卡扣卡" },
                    ]}
                    onChange={product => update({ product })}
                    buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2 !text-[11px] !shadow-none"
                  placeholderColor="text-[#8f959e]"
                  />
                )}
                {query.tab === "courses" && (
                  <>
                    <SelectDropdown
                      size="sm"
                      className="w-[130px]"
                      value={query.activity_type}
                      options={[
                        { value: "", label: "全部课程类型" },
                        ...(metadata?.activity_types || []).map(item => ({ value: item.key, label: item.label })),
                      ]}
                      onChange={activity_type => update({ activity_type, course_subtype: "" })}
                      buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2 !text-[11px] !shadow-none"
                      placeholderColor="text-[#8f959e]"
                    />
                    {query.activity_type === "class" && (
                      <SelectDropdown
                        size="sm"
                        className="w-[150px]"
                        value={query.course_subtype}
                        options={[
                          { value: "", label: "全部具体课程" },
                          ...(metadata?.activity_types || []).find(item => item.key === "class")?.subtypes?.map(name => ({ value: name, label: name })) || [],
                        ]}
                        onChange={course_subtype => update({ course_subtype })}
                        buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2 !text-[11px] !shadow-none"
                        placeholderColor="text-[#8f959e]"
                      />
                    )}
                  </>
                )}
                {query.tab === "orders" && (
                  <SelectDropdown
                    size="sm"
                    className="w-[150px]"
                    value={query.order_filter}
                    options={ORDER_FILTER_OPTIONS}
                    onChange={order_filter => update({ order_filter: order_filter as PrincipalQuery["order_filter"] })}
                    buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2 !text-[11px] !shadow-none"
                  placeholderColor="text-[#8f959e]"
                  />
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex w-[62px] shrink-0 items-center gap-[10px] text-[12px] text-[#8f959e]"><span className="h-3 w-[2.5px] rounded-[1px] bg-[#d0d3d6]"></span>统计周期</span>
              <AnalysisPeriodFilter
                variant="inline"
                label=""
                dateFrom={query.date_from || ""}
                dateTo={query.date_to || ""}
                onChange={({ date_from, date_to }) => update({ date_from: date_from || null, date_to: date_to || null })}
              />
            </div>
          </div>
        )}
        {query.tab === "conversion" && metadata && (
          <div className="mt-4 space-y-3 border-t border-[#f0f0f0] pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-2 text-[13px] font-semibold text-[#1f2329]"><span className="h-3 w-[3px] rounded-[1px] bg-[#3370ff]"></span>转化规则</span>
              <span className="text-[11px] text-[#8f959e]">决定什么算转化；改完点「查询」重算，要长期使用请点「保存规则」</span>
            </div>

            {query.rule.description && <p className="text-[11px] leading-5 text-[#8f959e]">规则说明：{query.rule.description}</p>}

            <div className="space-y-1">
              <div className="flex min-w-0 items-start gap-2">
                <span className="w-6 shrink-0 pt-1 text-[12px] font-medium text-[#3370ff]">从</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {metadata && <ActionEditor metadata={metadata} value={query.rule.source} onChange={source => updateRule({ source })} />}
                  {ruleFields && <RuleConditions
                    conditions={query.rule.source.conditions ?? []}
                    allowedFields={ruleFields.fields}
                    fieldOptions={sourceFieldOptions}
                    fieldByName={fieldByName}
                    operatorLabels={operatorLabels}
                    onChange={conditions => updateRule({ source: { ...query.rule.source, conditions } })}
                  />}
                </div>
              </div>
              {query.rule.targets.map((target, index) => (
                <div key={index} className="flex min-w-0 items-start gap-2">
                  <span className="w-6 shrink-0 pt-1 text-[12px] font-medium text-[#4e535a]">{index === 0 ? "到" : query.rule.target_mode === "all" ? "且" : "或"}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <ActionEditor
                      metadata={metadata}
                      value={target}
                      onChange={action => updateRule({ targets: query.rule.targets.map((item, i) => i === index ? action : item) })}
                    />
                  </div>
                  {query.rule.targets.length > 1 && (
                    <button
                      type="button"
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] text-[#b0b5bb] hover:bg-[#f0f1f3] hover:text-[#4e535a]"
                      aria-label="移除这项条件"
                      onClick={() => updateRule({ targets: query.rule.targets.filter((_, i) => i !== index) })}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                disabled={query.rule.targets.length >= 8}
                onClick={() => updateRule({ targets: [...query.rule.targets, { kind: "purchase", product: "", subtype: "", occurrence: "any", conditions: [] }] })}
                className="ml-6 flex h-7 items-center rounded-[3px] px-1.5 text-[12px] text-[#3370ff] hover:bg-[#f0f5ff] disabled:opacity-40"
              >
                <Plus className="mr-0.5 h-3.5 w-3.5" />再加一项条件
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-[4px] bg-[#f7f8fa] px-2.5 py-2">
              {query.rule.targets.length > 1 && <SelectDropdown
                size="sm"
                className="w-[176px]"
                value={query.rule.target_mode}
                options={TARGET_MODE_OPTIONS}
                onChange={target_mode => updateRule({ target_mode: target_mode as "any" | "all" })}
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#e1e4e7] !bg-white !px-2 !text-[12px] !shadow-none"
              />}
              <span className="text-[12px] text-[#4e535a]">转化间隔期限</span>
              <Input
                type="number"
                aria-label="间隔天数"
                min={0}
                max={3650}
                className="h-7 w-20 rounded-[4px] border-[#e1e4e7] bg-white px-2 text-[12px]"
                value={query.rule.window_days}
                onChange={e => updateRule({ window_days: Number(e.target.value) })}
              />
              <span className="text-[12px] text-[#4e535a]">天</span>
              <span className="text-[11px] text-[#8f959e]">（0 表示当天）</span>
              <label className="flex items-center gap-1.5 text-[12px] text-[#4e535a]">
                <input
                  type="checkbox"
                  checked={query.rule.same_organization}
                  onChange={e => updateRule({ same_organization: e.target.checked })}
                />
                同一组织/俱乐部
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-medium text-[#3370ff]">② 结果状态</span>
              <div className="flex items-center rounded-[4px] border border-[#e1e4e7] bg-white p-0.5">
                {STATUS_FILTERS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => update({ status: item.value as PrincipalQuery["status"] })}
                    className={`h-6 rounded-[3px] px-2.5 text-[11px] ${query.status === item.value ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#646a73]"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-[#8f959e]">已转化：达到条件；未转化：到期还没达到；观察中：还没到截止日期。</span>
            </div>

            {/* 与「自定义筛选」底部那一栏一致：整条浅色底 + 上边线，左边当前摘要，右边重置 / 查询 */}
            <div className="-mx-[22px] mt-4 flex items-center gap-3 border-t border-[#f0f0f0] bg-[#fafbfc] px-[22px] py-2.5">
              <span className="min-w-0 flex-1 truncate text-[12px] text-[#79838f]" title={describeRule(query.rule, metadata)} aria-live="polite">当前：{describeRule(query.rule, metadata)}</span>
              {conversionError && <span className="shrink-0 text-[12px] text-[#c4506a]">{conversionError}</span>}
              <button type="button" onClick={resetRule} disabled={busy} className="h-8 shrink-0 px-2 text-[12px] text-[#8f959e] hover:text-[#4e535a] disabled:opacity-50">重置</button>
              <Button size="sm" onClick={runQuery} disabled={busy || pagination.loading} className="h-8 shrink-0 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-5 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{pagination.loading ? "查询中" : "查询"}</Button>
            </div>
          </div>
        )}

      {(error || pagination.error) && query.tab !== "conversion" && (
        <div className="mt-3 rounded-[4px] border border-[#f1d9dc] bg-[#fff8f8] px-3 py-2">
          <p role="alert" className="text-[12px] text-[#b94a58]">{error || pagination.error}</p>
        </div>
      )}
      {metadata && !metadata.organizations.length && (
        <div className="mt-3 rounded-[4px] bg-[#f7f8fa] px-3 py-2">
          <p className="text-[12px] text-[#8f959e]">没有可查看的组织。请检查账号归属人与组织成员配置；同名归属人需先消除歧义。</p>
        </div>
      )}

      {!pagination.error && result && query.tab === "overview" && (
        /* 经营概况：引流人数、邀约到店人次、课程与成交。 */
        <div className="mt-4 border-t border-[#f0f0f0] pt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {overviewCards.map(card => {
              const isPrimaryCard = card.id === card.group
              const active = isPrimaryCard && overviewGroup === card.group
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (isPrimaryCard) selectOverviewGroup(card.group)
                    else if (card.group === "invite") selectOverviewGroup("invite")
                    else if (overviewGroup !== "traffic") selectOverviewGroup("traffic")
                  }}
                  className={`group min-w-0 rounded-[8px] border px-4 py-3.5 text-left transition-all ${active
                    ? "border-[#c7d7f7] bg-white shadow-[0_1px_6px_rgba(51,112,255,.07)]"
                    : "border-[#e8eaed] bg-white hover:border-[#d5dbe6] hover:shadow-[0_2px_10px_rgba(31,35,41,.05)]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-[#4e535a]">
                      <span className={`h-3.5 w-[3px] shrink-0 rounded-[2px] ${active ? "bg-[#3370ff]" : "bg-[#e3e6ea]"}`} />
                      <span className="truncate">{card.title}</span>
                      {card.help ? (
                        <HelpTip width={232}>{card.help}</HelpTip>
                      ) : null}
                    </span>
                  </div>
                  {isEmptyMetric(card.value)
                    ? <span className="mt-3 block h-[2px] w-[14px] rounded-full bg-[#e5e8eb]" aria-label="无数据" />
                    : (
                      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {!isEmptyMetric(card.value) && (
                          <span className="flex items-baseline gap-1">
                            <span className="text-[26px] font-semibold leading-none text-[#1f2329] tabular-nums">{card.value}</span>
                            <span className="text-[12px] text-[#8f959e]">{card.unit}</span>
                          </span>
                        )}
                      </div>
                    )}
                  <div className="mt-2 truncate text-[11.5px] text-[#9aa1a9]" title={card.sub}>{card.sub}</div>
                </button>
              )
            })}
          </div>

          {overviewGroup && (
            <div className="mt-3 overflow-hidden rounded-[8px] border border-[#e8eaed] bg-white">
              <div className="flex min-w-0 items-center gap-2 border-b border-[#f2f3f5] bg-[#fafbfc] px-4 py-2">
                <span className="shrink-0 text-[12px] text-[#646a73]">{overviewCards.find(item => item.id === overviewGroup)?.title ?? overviewCards.find(item => item.group === overviewGroup)?.title}明细</span>
                <span className="shrink-0 text-[11px] text-[#b0b5bb]">按下面的维度筛选列表</span>
                {(breakdownPicks.length > 0 || trafficQuickFilter || query.course_deal) && (
                  <button type="button" onClick={resetPanel} className="ml-auto shrink-0 text-[11px] text-[#8f959e] hover:text-[#3370ff]">清除全部</button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 px-4 py-3.5">
                {panelSelects.map(group => {
                  const chosen = breakdownPicks.find(item => pickPrefix(item) === group.prefix) ?? ""
                  const chosenValues = breakdownPicks.filter(item => pickPrefix(item) === group.prefix)
                  const options = group.items.map(item => ({
                    value: item.value,
                    label: item.label,
                    rightLabel: item.text,
                    rightNote: item.note,
                    rightLabelClassName: item.compactText ? "text-[11px]" : undefined,
                    muted: item.muted,
                  }))
                  const active = !!(group.multi ? chosenValues.length : chosen)
                  return (
                    <div
                      key={group.prefix}
                      className={`inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full border pl-3 pr-1 transition-colors ${
                        active
                          ? "border-[#c7d7f7] bg-[#f0f5ff]"
                          : "border-[#e8eaed] bg-[#fafbfc] hover:border-[#d5dbe6]"
                      }`}
                    >
                      <span className={`shrink-0 text-[12px] ${active ? "text-[#3370ff]" : "text-[#4e535a]"}`}>
                        {group.label}
                      </span>
                      <span className={`shrink-0 text-[12px] ${active ? "text-[#245be8]" : "text-[#8f959e]"}`}>
                        ·
                      </span>
                      {group.multi ? (
                        <SelectDropdown
                          multi
                          size="sm"
                          className="min-w-0 max-w-[160px] shrink"
                          value={chosenValues}
                          options={options}
                          placeholder={group.placeholder}
                          triggerLabel={chosenValues.length ? `已选 ${chosenValues.length} 项` : undefined}
                          onChange={values => chooseBreakdownMulti(group.prefix, values)}
                          buttonClassName={`!h-7 !rounded-full !border-0 !bg-transparent !px-1.5 !text-[12px] !shadow-none ${
                            active ? "!text-[#3370ff]" : "!text-[#8f959e]"
                          }`}
                          placeholderColor="text-[#8f959e]"
                          dropdownWidth={260}
                          menuMaxHeight={280}
                          hideRightLabelInTrigger
                        />
                      ) : (
                        <SelectDropdown
                          size="sm"
                          className="min-w-0 max-w-[160px] shrink"
                          value={chosen}
                          options={[{ value: "", label: group.placeholder }, ...options]}
                          onChange={value => chooseBreakdown(group.prefix, value)}
                          buttonClassName={`!h-7 !rounded-full !border-0 !bg-transparent !px-1.5 !text-[12px] !shadow-none ${
                            active ? "!text-[#3370ff]" : "!text-[#8f959e]"
                          }`}
                          placeholderColor="text-[#8f959e]"
                          dropdownWidth={overviewGroup === "traffic" && group.prefix === "traffic" ? 320 : 260}
                          menuMaxHeight={280}
                          hideRightLabelInTrigger
                        />
                      )}
                    </div>
                  )
                })}
                {!panelSelects.length && (
                  <p className="text-[12px] text-[#8f959e]">
                    {overviewGroup === "deals" ? "这个范围里没有成交记录。" : overviewGroup === "courses" ? "这个范围里没有课程记录。" : overviewGroup === "invite" ? "这个范围里没有邀约记录。" : "这个范围里没有引流客户。"}
                  </p>
                )}
              </div>
              {overviewGroup === "traffic" && trafficCustomers.length > 0 && (
                <div className="border-t border-[#f5f6f7]">
                  <div className="flex items-baseline gap-1 px-4 py-2.5">
                    <span className="shrink-0 text-[12px] text-[#8f959e]">成交总计</span>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12px] text-[#646a73]">
                    <button
                      type="button"
                      onClick={() => toggleTrafficQuickFilter({ kind: "deals", label: "有成交" })}
                      title="点击筛选下面的列表"
                      className={`cursor-pointer hover:underline ${isQuickFilterActive("deals") ? "text-[#3370ff]" : "hover:text-[#3370ff]"}`}
                    >
                      <span className={`text-[12px] font-medium tabular-nums ${isQuickFilterActive("deals") ? "text-[#3370ff]" : "text-[#1f2329]"}`}>{trafficDealTotal}</span>
                      <span className="ml-1 text-[11px] text-[#8f959e]">笔</span>
                    </button>
                    {productTotals.map(item => (
                      <span key={item.label} className="whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleTrafficQuickFilter({ kind: "product", value: item.key, label: `买了${item.label}` })}
                          title="点击筛选下面的列表"
                          className={`cursor-pointer hover:underline ${isQuickFilterActive("product", item.key) ? "text-[#3370ff]" : "hover:text-[#3370ff]"}`}
                        >
                          <span className="text-[11px]">{item.label}</span>{' '}
                          <b className={`text-[11px] font-normal tabular-nums ${isQuickFilterActive("product", item.key) ? "text-[#3370ff]" : ""}`}>{item.count}</b>
                        </button>
                      </span>
                    ))}
                    </div>
                  </div>
                </div>
              )}
              {overviewGroup !== "traffic" && panelMetrics.length > 0 && (
                <div className="flex flex-wrap border-t border-[#f2f3f5] bg-[#fcfcfd]">
                  {panelMetrics.map(item => {
                    const secondaryActive = !!item.secondaryCourseDeal && query.course_deal === item.secondaryCourseDeal.value
                    const active = item.filter
                      ? isQuickFilterActive(item.filter.kind, item.filter.value ?? "")
                      : item.pick
                        ? breakdownPicks.includes(item.pick)
                        : (!!item.courseDeal && query.course_deal === item.courseDeal) || secondaryActive
                    // 显示 0 的指标点了也只会筛出空列表，就不做成可点
                    const metricIsZero = Number(String(item.text).trim().split(/\s+/)[0]) === 0
                    const clickable = (!!item.filter || !!item.pick || !!item.courseDeal) && !metricIsZero
                    const handleClick = item.filter
                      ? () => toggleTrafficQuickFilter(item.filter!)
                      : item.pick
                        ? () => chooseBreakdown(item.pick!.split(":")[0], active ? "" : item.pick!)
                        : item.courseDeal
                          ? () => update({ course_deal: active ? "" : item.courseDeal })
                          : undefined
                    const chipClass = `min-w-[104px] flex-1 border-r border-[#f2f3f5] px-4 py-2.5 text-left last:border-r-0 ${
                      clickable ? "cursor-pointer hover:bg-[#f7f8fa]" : "cursor-default"
                    } ${active ? "bg-[#f0f5ff]" : ""}`
                    const chipBody = (
                      <>
                        <div className="flex min-w-0 items-center gap-1 text-[11px] text-[#8f959e]">
                          <span className="truncate" title={item.hint ?? item.label}>{item.label}</span>
                          {item.help && <HelpTip width={196}>{item.help}</HelpTip>}
                        </div>
                        {item.secondaryCourseDeal ? (
                          <button
                            type="button"
                            disabled={metricIsZero}
                            className={`mt-1 block whitespace-normal text-[14px] font-medium leading-[1.35] tabular-nums hover:text-[#3370ff] hover:underline ${active && !secondaryActive ? "text-[#3370ff]" : "text-[#2b2f36]"}`}
                            onClick={handleClick}
                          >
                            {item.text}
                          </button>
                        ) : (
                          <div className={`mt-1 whitespace-normal text-[14px] font-medium leading-[1.35] tabular-nums ${active ? "text-[#3370ff]" : "text-[#2b2f36]"}`}>
                            {item.text}
                          </div>
                        )}
                        {item.sub && <div className="mt-1 whitespace-normal break-words text-[11px] font-normal leading-[1.35] text-[#8f959e]">{item.sub}</div>}
                        {item.secondaryCourseDeal && (
                          <button
                            type="button"
                            className={`mt-1 whitespace-nowrap text-[11px] font-normal leading-[1.35] hover:text-[#3370ff] hover:underline ${secondaryActive ? "text-[#3370ff]" : "text-[#8f959e]"}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              update({ course_deal: secondaryActive ? "" : item.secondaryCourseDeal!.value })
                            }}
                          >
                            {item.secondaryCourseDeal.label} {item.secondaryCourseDeal.text}
                          </button>
                        )}
                      </>
                    )
                    // 整块不可点时用 div 承载，关联成交仍可单独点击
                    return item.secondaryCourseDeal ? (
                      <div key={item.label} className={chipClass}>{chipBody}</div>
                    ) : clickable ? (
                      <button key={item.label} type="button" onClick={handleClick} title="点击筛选下面的列表" className={chipClass}>
                        {chipBody}
                      </button>
                    ) : (
                      <div key={item.label} className={chipClass}>{chipBody}</div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!pagination.error && result && query.tab !== "overview" && (query.tab !== "conversion" || resultTab === "conversion") && (
        <div className={`mt-4 ${query.tab === "conversion" ? "" : "border-t border-[#f0f0f0] pt-4"}`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(result.summary).map(([label, value]) => (
              <div key={label} className="min-w-0 border-[0.5px] border-[#eceef0] bg-white px-3 py-2.5">
                <div className="truncate text-[12px] text-[#8f959e]" title={label}>{label}</div>
                {isEmptyMetric(value)
                  ? <span className="mt-1 inline-block h-[2px] w-[12px] rounded-full bg-[#e5e8eb] align-middle" aria-label="无数据" />
                  : <div className="mt-1 text-[20px] font-medium leading-none text-[#212631] tabular-nums">{value}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 与「自定义筛选」的结果区一致：带 0.5px 边框的容器 + 表头栏 */}
      <div ref={listCardRef} className="mt-4 min-h-[640px] overflow-hidden border-[0.5px] border-[#eceef0] bg-white">
        {(query.tab === "courses" || showInviteListTabs || (query.tab === "overview" && overviewGroup === "courses")) && (
          <div className="flex flex-wrap items-center gap-4 border-b border-[#eceef0] px-3.5 py-2">
            {/* 分段控件：浅灰底槽 + 白底选中（细阴影），比下划线明显，又不像蓝底那样抢视觉 */}
            <div className="flex items-center gap-[3px] rounded-[6px] bg-[#f2f3f5] p-[3px]" role="tablist" aria-label={showInviteListTabs ? "邀约列表类型" : "课程列表类型"}>
              {(showInviteListTabs
                ? ([{ value: "arrive", label: "邀约到店" }, { value: "initiated", label: "发起邀约" }] as const)
                : ([{ value: "course", label: "课程记录" }, { value: "participant", label: "参与者" }, ...(metadata?.can_view_follow_up ? [{ value: "teacher_follow_up" as const, label: "老师跟进" }] : [])] as const)
              ).map(item => {
                const selected = showInviteListTabs
                  ? (query.invite_view || "arrive") === item.value
                  : (query.course_view || "course") === item.value
                return (
                  <button key={item.value} type="button" role="tab" aria-selected={selected}
                    className={`h-7 rounded-[4px] px-3.5 text-[12px] transition-colors ${selected
                      ? "bg-white text-[#1f2329] shadow-[0_1px_3px_rgba(31,35,41,.12)]"
                      : "text-[#4e535a] hover:text-[#1f2329]"}`}
                    onClick={() => {
                      setSortBy("")
                      setQuery(current => showInviteListTabs
                        ? { ...current, invite_view: item.value as "arrive" | "initiated" }
                        : { ...current, course_view: item.value as "course" | "participant" | "teacher_follow_up", participant_scope: "" })
                    }}>{item.label}</button>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-b-[0.5px] border-[#f0f0f0] px-3.5 py-2.5">
          <div className="flex min-w-0 items-baseline gap-2">
            <div className="truncate text-[13px] font-medium text-[#2b2f36]">{dateSummary} · {showTrafficList ? "引流客户" : listUnitLabel}</div>
            {result && (
              <span className="shrink-0 text-[12px] text-[#8f959e]">
                {showInviteInitiatedList
                  ? `共 ${inviteInitiatorRows.length} 位邀约人 · ${inviteInitiatedTotal} 人次`
                  : `共 ${showInviteArriveList ? inviteArriveRows.length : showTrafficList ? trafficQuickFiltered.length : pagination.totalItems} 条`}
              </span>
            )}
            {pagination.loading && <span className="shrink-0 text-[11px] text-[#b0b5bb]">查询中…</span>}
            {showTrafficList && trafficQuickFilter && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-[#f0f5ff] px-2 py-0.5 text-[11px] text-[#3370ff]">
                已筛选：{trafficQuickFilter.label}
                <button type="button" onClick={() => setTrafficQuickFilter(null)} className="cursor-pointer hover:text-[#245be8]" title="取消筛选">✕</button>
              </span>
            )}
            {/* 课程数 / 成交量：把正在生效的筛选显示在标题右边，点 ✕ 取消这一项 */}
            {!showTrafficList && activeFilterChips.map(chip => (
              <span key={chip.key} className="inline-flex shrink-0 items-center gap-1 rounded-[3px] bg-[#f0f5ff] px-2 py-0.5 text-[11px] text-[#3370ff]">
                已筛选：{chip.label}
                <button type="button" onClick={chip.clear} className="cursor-pointer hover:text-[#245be8]" title="取消这个筛选">✕</button>
              </span>
            ))}
          </div>
          {showInviteInitiatedList ? null : showInviteArriveList ? (
            <div className="flex shrink-0 items-center gap-2">
              <ColumnSettings
                config={listInviteColumns}
                onChange={changeInviteColumns}
                onReset={defaultInviteColumns}
                resetLabel="恢复默认"
                maxColumns={10}
              />
              <SelectDropdown
                size="sm"
                className="w-[196px]"
                value={inviteArriveView}
                options={[{ value: "customer", label: "单个客户仅显示一次" }, { value: "date", label: "按日期显示每条邀约记录" }]}
                onChange={value => { setInviteArriveView(value as "customer" | "date"); setInviteArrivePage(1) }}
                buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2.5 !text-[12px] !text-[#4e535a] !shadow-none"
                dropdownWidth={196}
              />
              <button
                type="button"
                onClick={download}
                disabled={busy || pagination.loading || !!pagination.error}
                className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7] disabled:opacity-50">
                <Download className="h-3.5 w-3.5" />{busy ? "导出中" : "导出"}
              </button>
              <button
                type="button"
                onClick={() => setExpandTrafficCells(current => !current)}
                aria-pressed={expandTrafficCells}
                className="flex h-7 shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
              >
                {expandTrafficCells ? "缩略" : "展开"}
              </button>
            </div>
          ) : showTrafficList ? (
            <div className="flex shrink-0 items-center gap-2">
            {trafficQuickFilter && (
              <button
                type="button"
                onClick={() => setTrafficQuickFilter(null)}
                className="flex h-7 shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
              >
                重置筛选
              </button>
            )}
            <ColumnSettings config={listTrafficColumns} onChange={changeTrafficColumns} />
            <button type="button" onClick={download}
              disabled={busy || pagination.loading || !!pagination.error}
              className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7] disabled:opacity-50">
              <Download className="h-3.5 w-3.5" />{busy ? "导出中" : "导出"}
            </button>
            <button
              type="button"
              onClick={() => setExpandTrafficCells(current => !current)}
              aria-pressed={expandTrafficCells}
              className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
            >
              {expandTrafficCells ? "缩略" : "展开"}
            </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {/* 交易列表：按每笔交易看，还是同一个人只显示一次 */}
              {listTab === "orders" && (
                <SelectDropdown
                  size="sm"
                  className="w-[150px]"
                  value={listView}
                  options={[{ value: "order", label: "每笔交易显示一次" }, { value: "customer", label: "同一人仅显示一次" }]}
                  onChange={value => setListView(value as "order" | "customer")}
                  buttonClassName="!h-7 !rounded-[4px] !border !border-[#dee0e3] !bg-white !px-2.5 !text-[12px] !text-[#4e535a] !shadow-none"
                  dropdownWidth={168}
                />
              )}
              {/* 课程列表的新人/老人名单默认单行缩略，需要看全部名字时可以展开 */}
              {result?.columns.some(column => column.key === "new_names") && (
                <button
                  type="button"
                  onClick={() => setExpandNames(current => !current)}
                  aria-pressed={expandNames}
                  className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
                >
                  {expandNames ? "缩略" : "展开"}
                </button>
              )}
              {showTeacherFollowUpList && (
                <button type="button" onClick={() => setExpandTeacherFollowUp(value => !value)} aria-pressed={expandTeacherFollowUp}
                  className="flex h-7 shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]">
                  {expandTeacherFollowUp ? "缩略" : "展开"}
                </button>
              )}
              <button
                type="button"
                onClick={download}
                disabled={busy || pagination.loading || !!pagination.error}
                className="flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:text-[#b7bdc6]"
              >
                <Download className="h-3.5 w-3.5" />
                {busy ? "导出中" : "导出"}
              </button>
            </div>
          )}
        </div>

        {query.tab === "conversion" && resultTab !== "conversion" ? (
          <div className="py-24 text-center text-[13px] text-[#8f959e]">点「查询」按当前范围与规则出结果</div>
        ) : showInviteInitiatedList ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed" style={{ minWidth: 720 }}>
                <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                  <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                    <TableHead className="w-[24%] pl-4 text-[11px] font-normal text-[#646a73]">邀约人</TableHead>
                    <TableHead className="w-[15%] text-right text-[11px] font-normal text-[#646a73]">邀约人次</TableHead>
                    <TableHead className="w-[15%] text-right text-[11px] font-normal text-[#646a73]">取消人次</TableHead>
                    <TableHead className="w-[15%] text-right text-[11px] font-normal text-[#646a73]">未到场人次</TableHead>
                    <TableHead className="w-[15%] text-right text-[11px] font-normal text-[#646a73]">已到场人次</TableHead>
                    <TableHead className="w-[16%] pr-4 text-right text-[11px] font-normal text-[#646a73]">邀约明细</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inviteInitiatorRows.map(item => (
                    <TableRow key={item.key} className="h-11 border-[#f0f0f0] text-[12px] hover:bg-[#f7f8fa]">
                      <TableCell className={`pl-4 font-medium ${item.label === "未配置" ? "text-[#a8adb5]" : "text-[#2b2f36]"}`}>{item.label}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#2b2f36]">{item.initiated_count}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#4e535a]">{item.cancel_count ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#4e535a]">{item.no_show_count ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums text-[#4e535a]">{item.arrive_count ?? 0}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setInviteDetailSort({ field: "date", order: "desc" })
                            setExpandInviteDetail(false)
                            const records = item.records ?? []
                            setInviteDetail({ key: item.key, label: item.label, records })
                            if (records.some(record => !Object.prototype.hasOwnProperty.call(record, "visit_date"))) {
                              pagination.refresh()
                            }
                          }}
                          className="text-[12px] text-[#3370ff] hover:text-[#245be8]"
                        >
                          查看
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!inviteInitiatorRows.length && (
              <div className="py-16 text-center text-sm text-muted-foreground">所选时间范围内暂无发起邀约记录</div>
            )}
          </>
        ) : showInviteArriveList ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed" style={{ minWidth: Math.max(720, visibleInviteColumns.length * 88) }}>
                <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                  <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                    {visibleInviteColumns.map((column, index) => (
                      <TrafficSortHead
                        key={column.key}
                        label={column.label}
                        field={column.sortField}
                        width={column.width}
                        align={column.align}
                        className={`${index === 0 ? "!pl-4 !pr-1" : ""} ${index === visibleInviteColumns.length - 1 ? "!pr-4" : ""}`}
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inviteArrivePageRows.map(customer => (
                    <TableRow key={`${customer.id ?? customer.name}:${"arrival_id" in customer ? customer.arrival_id : "once"}`} className="h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                      {visibleInviteColumns.map((column, index) => {
                        const isLast = index === visibleInviteColumns.length - 1
                        const base = `${expandTrafficCells ? "whitespace-normal break-words py-2 align-top" : "h-11 overflow-hidden py-0"} text-[12px] ${column.align === "right" ? "text-right tabular-nums" : ""} ${index === 0 ? "pl-4 pr-1" : "px-3"} ${isLast ? "pr-4" : ""}`
                        if (column.key === "arrive_date") {
                          return (
                            <TableCell key={column.key} className={`${base} py-1`}>
                              <div className="truncate tabular-nums text-[12px] text-[#8f959e]" title={customer.arrive_date || undefined}>
                                {customer.arrive_date || <EmptyValue />}
                              </div>
                              {!expandTrafficCells && (
                                <div className="truncate text-[11px] tabular-nums text-[#a1a6ad]" title={customer.arrive_time || undefined}>
                                  {customer.arrive_time || <EmptyValue />}
                                </div>
                              )}
                            </TableCell>
                          )
                        }
                        if (column.key === "name") {
                          return (
                            <TableCell key={column.key} className={`${base} text-[12px] font-medium text-[#2b2f36]`}>
                              {customer.name || <EmptyValue />}
                            </TableCell>
                          )
                        }
                        if (column.key === "identity") {
                          return (
                            <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.identity || <EmptyValue />}</TableCell>
                          )
                        }
                        if (["referrer", "referrer_handler", "follow_up_status", "traffic_source", "tags",
                          "visit_purpose", "trauma_history", "current_block", "work_info", "other_info"].includes(column.key)) {
                          const value = column.key === "referrer" ? customer.referrer
                            : column.key === "referrer_handler" ? customer.referrer_handler
                              : column.key === "follow_up_status" ? customer.follow_up_status
                                : column.key === "traffic_source" ? customer.traffic_source
                                  : column.key === "tags" ? (customer.tags ?? []).join("、")
                                    : column.key === "visit_purpose" ? customer.visit_purpose
                                      : column.key === "trauma_history" ? customer.trauma_history
                                        : column.key === "current_block" ? customer.current_block
                                          : column.key === "work_info" ? customer.work_info
                                            : customer.other_info
                          return (
                            <TableCell key={column.key} className={`${base} text-[#4e535a]`}>
                              <div className={expandTrafficCells ? "whitespace-normal break-words" : "truncate"} title={value || undefined}>{value || <EmptyValue />}</div>
                            </TableCell>
                          )
                        }
                        if (column.key === "arrive_inviter") {
                          return (
                            <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.arrive_inviter || <EmptyValue />}</TableCell>
                          )
                        }
                        if (column.key === "invite_count") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.invite_count ?? 0}</TableCell>
                        }
                        if (column.key === "deals") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.deals ?? 0}</TableCell>
                        }
                        if (column.key === "cancel_count") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.cancel_count ?? 0}</TableCell>
                        }
                        if (column.key === "no_show_count") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.no_show_count ?? 0}</TableCell>
                        }
                        if (column.key === "arrive_count") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.arrive_count ?? 0}</TableCell>
                        }
                        if (column.key === "activity_count") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.activity_count ?? 0}</TableCell>
                        }
                        if (column.key === "visit_interval") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.visit_interval || <EmptyValue />}</TableCell>
                        }
                        if (column.key === "same_day_deals") {
                          return <TableCell key={column.key} className={`${base} text-[#4e535a]`}>{customer.same_day_deals ?? 0}</TableCell>
                        }
                        return <TableCell key={column.key} className={base}><EmptyValue /></TableCell>
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!inviteArriveRows.length && (
              <div className="py-16 text-center text-sm text-muted-foreground">所选时间范围内暂无到店记录</div>
            )}
            <PaginationBar
              currentPage={inviteArriveCurrentPage}
              totalPages={inviteArrivePageCount}
              totalItems={inviteArriveRows.length}
              startIndex={inviteArriveRows.length ? (inviteArriveCurrentPage - 1) * PAGE_SIZE + 1 : 0}
              endIndex={Math.min(inviteArriveCurrentPage * PAGE_SIZE, inviteArriveRows.length)}
              onPageChange={setInviteArrivePage}
            />
          </>
        ) : showTrafficList ? (
          <>
            <div className="overflow-x-auto">
              <Table className="w-full table-fixed" style={{ minWidth: trafficTableMinWidth }}>
                <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                  <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                    {visibleTrafficColumns.map((column, index) => (
                      <TrafficSortHead
                        key={column.key}
                        label={column.label}
                        field={column.sortField}
                        width={column.width}
                        align={column.align}
                        className={`${index === 0 ? "!pl-4 pr-1" : ""} ${index === visibleTrafficColumns.length - 1 ? "pr-4" : ""}`}
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trafficRows.map(customer => (
                    <TableRow key={`${customer.referrer}-${customer.id ?? customer.name}`} className="h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                      {visibleTrafficColumns.map((column, index) => (
                        <TableCell
                          key={column.key}
                          className={`${expandTrafficCells ? "whitespace-normal break-words py-2 align-top" : "h-11 overflow-hidden py-0"} text-[12px] ${column.align === "right" ? "text-right tabular-nums" : ""} ${index === 0 ? "pl-4 pr-1" : "px-3"} ${index === visibleTrafficColumns.length - 1 ? "pr-4" : ""}`}
                        >
                          {renderTrafficCell(column.key, customer)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {!trafficCustomers.length && <div className="py-16 text-center text-sm text-muted-foreground">暂无符合条件的数据</div>}
            <PaginationBar
              currentPage={trafficCurrentPage}
              totalPages={trafficPageCount}
              totalItems={trafficCustomers.length}
              startIndex={(trafficCurrentPage - 1) * PAGE_SIZE + 1}
              endIndex={Math.min(trafficCurrentPage * PAGE_SIZE, trafficCustomers.length)}
              onPageChange={setTrafficPage}
            />
          </>
        ) : showTeacherFollowUpList && !pagination.error ? (
          <>
            <TeacherFollowUpList
              rows={sortedItems}
              loading={pagination.loading}
              expanded={expandTeacherFollowUp}
              onOpenCustomer={row => { setDetailCourseId(String(row.course_id || "")); setDetailCustomerId(String(row.customer_id)) }}
              onOpenDetail={setTeacherFollowUpDetail}
            />
            <PaginationBar currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems} startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} />
          </>
        ) : pagination.loading && !pagination.paginatedItems.length ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中…</div>
        ) : !pagination.error ? (
          <>
            <div className={`overflow-x-auto transition-opacity ${pagination.loading ? "opacity-55" : ""}`}>
            <Table className="w-full table-fixed" style={{ minWidth: listTableMinWidth }}>
              <TableHeader className="bg-[#fafafa] [&_tr]:border-[#f0f0f0]">
                <TableRow className="h-9 bg-[#fafafa] hover:bg-[#fafafa]">
                  {result?.columns.map((c, i) => {
                    const isNum = NUMBER_COLUMNS.has(c.key)
                    const sortable = !UNSORTABLE_COLUMNS.has(c.key)
                    return (
                    <TableHead key={c.key} style={columnWidthStyle(c.key, c.label)} className={`h-9 ${showCourseDealOverviewList ? "!px-3" : "!px-2"} text-[11px] font-normal ${i === 0 ? (showCourseDealOverviewList ? "!pl-4 !pr-1" : "!pl-3") : ""} ${columnWidthClass(c.key)} ${isNum ? "text-right" : ""}`}>
                      {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex max-w-full items-center gap-1 ${isNum ? "justify-end" : ""}`}
                        title={`按${c.label}排序`}
                      >
                        <span className="truncate">{c.label}</span>
                        {c.key === "org_participation_count" && <HelpTip trigger="click" width={220}>{PARTICIPATION_COUNT_TIP}</HelpTip>}
                        {c.key === "org_participation_hours" && <HelpTip trigger="click" width={220}>{PARTICIPATION_HOURS_TIP}</HelpTip>}
                        {c.key === "classification" && <HelpTip width={299}>{PURCHASE_TYPE_TIP}</HelpTip>}
                        <span className="inline-flex shrink-0 flex-col leading-none">
                          <span className={`text-[8px] leading-[8px] ${sortBy === c.key && sortOrder === "asc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▲</span>
                          <span className={`-mt-px text-[8px] leading-[8px] ${sortBy === c.key && sortOrder === "desc" ? "text-[#1f2329]" : "text-[#d0d3d6]"}`}>▼</span>
                        </span>
                      </button>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="truncate">{c.label}</span>
                          {c.key === "org_participation_count" && <HelpTip trigger="click" width={220}>{PARTICIPATION_COUNT_TIP}</HelpTip>}
                          {c.key === "org_participation_hours" && <HelpTip trigger="click" width={220}>{PARTICIPATION_HOURS_TIP}</HelpTip>}
                          {c.key === "classification" && <HelpTip width={299}>{PURCHASE_TYPE_TIP}</HelpTip>}
                        </span>
                      )}
                    </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map(row => {
                  const hasDetails = row.details?.length > 0
                  return (
                  <TableRow key={row.id} className="group h-11 border-[#f0f0f0] text-[12px] last:border-b-0 hover:bg-[#f7f8fa]">
                    {result?.columns.map((c, i) => {
                      const isNumber = NUMBER_COLUMNS.has(c.key) || typeof row[c.key] === "number"
                      const isFollowUpText = query.course_view === "teacher_follow_up" && ["visit_need", "customer_info", "follow_up"].includes(c.key)
                      // 只有「有数」的数字才可点：0 或空值点了也看不到东西
                      const cellNumber = Number(row[c.key])
                      const clickable = hasDetails && isNumber && Number.isFinite(cellNumber) && cellNumber > 0
                        // 课时数、到场人数、累计课程/课时不参与明细点击，避免误点；成交笔数可点，但不做成蓝色
                        && !["hours", "participants", "org_participation_count", "org_participation_hours"].includes(c.key)
                      const accentClickable = clickable && !["deal_count", "order_count", "same_day_deals"].includes(c.key)
                      return (
                      <TableCell
                        key={c.key}
                        onClick={clickable ? () => (c.key === "deal_count"
                          ? openCustomerDeals(String(row.customer_id ?? ""), String(row.customer ?? ""), row)
                          : (setDetailTag(c.key === "same_day_deals" ? "当日成交" : c.key === "order_count" ? "关联成交" : ""), setDetail(row))) : undefined}
                        title={c.key === "deal_count"
                          ? `这个客户在这批数据里共 ${row.deal_count} 笔，点开看全部`
                          : c.key === "classification" && Number(row.repeat_times) > 1
                            ? `第 ${row.repeat_times} 次购买同一个卡种/具体项目，已经复购 ${Number(row.repeat_times) - 1} 次`
                          : COLUMN_CELL[c.key] && String(row[c.key] ?? "") ? String(row[c.key]) : undefined}
                        className={`${isFollowUpText ? "whitespace-pre-wrap break-words py-2 align-top" : expandNames && (c.key === "new_names" || c.key === "old_names") ? "whitespace-normal break-words py-2 align-top" : "h-11 overflow-hidden text-ellipsis py-0"} ${showCourseDealOverviewList ? "!px-3" : "!px-2"} text-[12px] ${i === 0 ? (showCourseDealOverviewList ? "!pl-4 !pr-1" : "!pl-3") : ""} ${COLUMN_WIDTH[c.key] || ""} ${COLUMN_CELL[c.key] || ""} ${isNumber ? "text-right tabular-nums" : ""} ${clickable ? "cursor-pointer hover:underline" : ""} ${accentClickable ? "text-[#3370ff]" : ""}`}
                      >
                        {c.key === "customer" && row.customer_id ? (
                          <button
                            type="button"
                            onClick={() => { setDetailCourseId(String(row.course_id || "")); setDetailCustomerId(String(row.customer_id)) }}
                            className="max-w-full truncate text-[#2b2f36] hover:underline"
                            title={String(row[c.key] ?? "")}
                          >
                            {String(row[c.key] ?? "")}
                          </button>
                        ) : (c.key === "new_names" || c.key === "old_names") && (row[c.key === "new_names" ? "new_people" : "old_people"] as { id?: string; name?: string }[] | undefined)?.length ? (
                          // 名单里的每个名字都能点开客户详情
                          <span className={`text-[#2b2f36] ${expandNames ? "whitespace-normal break-words" : "block truncate"}`}>
                            {(row[c.key === "new_names" ? "new_people" : "old_people"] as { id?: string; name?: string }[]).map((person, index) => (
                              <span key={`${person.id || person.name}-${index}`}>
                                {index > 0 && "、"}
                                {person.id ? (
                                  <button
                                    type="button"
                                    onClick={() => { setDetailCourseId(String(row.course_id || row.id || "")); setDetailCustomerId(String(person.id)) }}
                                    className="cursor-pointer hover:text-[#3370ff] hover:underline"
                                  >
                                    {person.name}
                                  </button>
                                ) : person.name}
                              </span>
                            ))}
                          </span>
                        ) : c.key === "classification" && Number(row.repeat_times) > 1 ? (
                          <span className="inline-flex items-baseline gap-1">
                            <span>{String(row[c.key] ?? "")}</span>
                            <span className="shrink-0 text-[11px] text-[#8f959e]">第 {row.repeat_times} 次</span>
                          </span>
                        ) : String(row[c.key] ?? "") || <EmptyValue />}
                      </TableCell>
                      )
                    })}
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            </div>
            {!pagination.paginatedItems.length && <div className="py-16 text-center text-sm text-muted-foreground">暂无符合条件的数据</div>}
            <PaginationBar currentPage={pagination.currentPage} totalPages={pagination.totalPages} totalItems={pagination.totalItems} startIndex={pagination.startIndex} endIndex={pagination.endIndex} onPageChange={pagination.goToPage} />
          </>
        ) : null}
      </div>
      </section>

    <Dialog open={!!inviteDetail} onOpenChange={open => { if (!open) setInviteDetail(null) }}>
      <DialogContent initialFocus={false} className="flex h-[86vh] max-h-[86vh] w-[1180px] max-w-[98vw] flex-col gap-0 overflow-hidden rounded-[10px] border border-[#e6e8eb] bg-white p-0 shadow-[0_16px_48px_rgba(31,35,41,.14)]">
        <DialogHeader className="border-b border-[#eceef1] bg-white px-4 py-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <DialogTitle className="text-[16px] font-medium leading-5 text-[#1f2329]">邀约明细 · <span className={inviteDetail?.label === "未配置" ? "text-[#a8adb5]" : ""}>{inviteDetail?.label || ""}</span></DialogTitle>
              <p className="mt-1 text-[12.5px] leading-5 text-[#858b94]">共 {(inviteDetail?.records ?? []).length} 条记录 · 按邀约创建日期统计</p>
            </div>
            <div className="flex shrink-0 items-end gap-2">
              <ColumnSettings
                config={listInitiatedColumns}
                onChange={changeInitiatedColumns}
                onReset={defaultInitiatedColumns}
                resetLabel="恢复默认"
                maxColumns={10}
              />
              <button
                type="button"
                onClick={downloadInviteDetail}
                disabled={busy || !(inviteDetail?.records ?? []).length}
                className="flex h-7 shrink-0 items-center gap-1 rounded-[5px] border border-[#dfe2e6] bg-white px-3 text-[12.5px] font-normal text-[#4e535a] hover:bg-[#f5f6f7] disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" />{busy ? "导出中" : "导出"}
              </button>
              <button
                type="button"
                onClick={() => setExpandInviteDetail(current => !current)}
                className="flex h-7 shrink-0 items-center rounded-[5px] border border-[#dfe2e6] bg-white px-3 text-[12.5px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
              >
                {expandInviteDetail ? "缩略" : "展开"}
              </button>
            </div>
          </div>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden bg-white p-4">
          <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[7px] border border-[#e5e8ec] bg-white">
          <Table className="w-full table-fixed">
            <TableHeader className="sticky top-0 z-10 bg-[#f7f8fa] [&_tr]:border-[#e8eaed]">
              <TableRow className="h-10 bg-[#f7f8fa] hover:bg-[#f7f8fa]">
                {[{ key: "date", label: "发起邀约", width: "w-[96px]" }, { key: "visit_date", label: "邀约到店", width: "w-[96px]" }, ...visibleInviteDetailColumns, { key: "status_label", label: "邀约状态", width: "w-[90px]" }].map((column, index) => (
                  <TableHead key={column.key} className={`h-auto min-h-10 ${column.width} px-2 py-2 text-[11px] font-medium leading-4 text-[#5f6670] ${index === 0 ? "pl-4" : ""}`}>
                    <button type="button" onClick={() => toggleInviteDetailSort(column.key)} className="inline-flex max-w-full items-center gap-1 hover:text-[#2b2f36]" title={`按${column.label}排序`}>
                      <span className="whitespace-normal break-keep text-left">{column.label}</span>
                      <span className="inline-flex shrink-0 flex-col leading-none">
                        <span className={`text-[8px] leading-[7px] ${inviteDetailSort.field === column.key && inviteDetailSort.order === "asc" ? "text-[#2b2f36]" : "text-[#d0d3d6]"}`}>▲</span>
                        <span className={`text-[8px] leading-[7px] ${inviteDetailSort.field === column.key && inviteDetailSort.order === "desc" ? "text-[#2b2f36]" : "text-[#d0d3d6]"}`}>▼</span>
                      </span>
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedInviteDetailRecords.map(record => (
                <TableRow key={record.id || `${record.date}-${record.customer_id}`} className="min-h-11 border-[#eef0f2] hover:bg-[#fafbfc]">
                  <TableCell className="pl-4 text-[12px] tabular-nums text-[#5f6670]">{record.date}</TableCell>
                  <TableCell className="px-2 text-[12px] tabular-nums text-[#5f6670]">{record.visit_date || <EmptyValue />}</TableCell>
                  {visibleInviteDetailColumns.map(column => {
                    const raw = record[column.key as keyof InviteInitiatedRecord]
                    const text = Array.isArray(raw) ? raw.join("、") : String(raw ?? "")
                    const isNumber = column.align === "right"
                    return (
                      <TableCell key={column.key} className={`${expandInviteDetail ? "whitespace-normal break-words py-2.5 align-top" : "h-11 overflow-hidden py-0"} px-2 text-[12px] ${isNumber ? "text-right tabular-nums" : ""} ${text === "未配置" ? "text-[#a8adb5]" : "text-[#454b54]"}`}>
                        {column.key === "name" && record.customer_id ? (
                          <button
                            type="button"
                            onClick={() => { setInviteDetail(null); setDetailCustomerId(record.customer_id) }}
                            className={`${expandInviteDetail ? "whitespace-normal break-words" : "block max-w-full truncate"} text-left text-[#2b2f36] hover:underline`}
                            title={`查看${record.name}的客户详情`}
                          >
                            {record.name}
                          </button>
                        ) : text ? (
                          <span className={expandInviteDetail ? "whitespace-normal break-words" : "block max-w-full truncate"} title={text}>{text}</span>
                        ) : <EmptyValue />}
                      </TableCell>
                    )
                  })}
                  <TableCell className={`px-2 text-[12px] ${record.status === "arrived" ? "text-[#2f8f57]" : record.status === "cancelled" ? "text-[#8f959e]" : "text-[#b26b24]"}`}>
                    {record.status_label}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!(inviteDetail?.records ?? []).length && (
            <div className="py-14 text-center text-[13px] text-muted-foreground">暂无明细</div>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!detailCustomerId} onOpenChange={open => { if (!open) setDetailCustomerId("") }}>
      <DialogContent initialFocus={false} className="flex max-h-[90vh] max-w-[1180px] flex-col overflow-hidden p-0">
        <DetailView selectedCustomerId={detailCustomerId} onClearSelection={() => setDetailCustomerId("")} hideSearch defaultTab="healing" principalCourse={detailCourseId} principalParticipant={(query.course_view === "participant" || !!detailCourseId) && (query.tab === "courses" || (query.tab === "overview" && overviewGroup === "courses"))} />
      </DialogContent>
    </Dialog>

    <Dialog open={!!dealDetail} onOpenChange={open => { if (!open) setDealDetail(null) }}>
      <DialogContent initialFocus={false} className="flex max-h-[80vh] w-[660px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border-[0.5px] border-[#e8eaed] p-0">
        <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
          <DialogTitle className="text-[14px] font-medium text-[#1f2329]">{dealDetail?.customer || "成交明细"}</DialogTitle>
          <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">
            {dealDetail?.loading ? "加载中…" : `${dateSummary} · 共 ${dealDetail?.rows.length ?? 0} 笔成交`}
          </p>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {dealDetail?.rows.map((row, index) => (
            <div key={row.id} className="flex items-start gap-3 rounded-[6px] border border-[#f0f1f3] bg-[#fcfcfd] px-3 py-2.5">
              <span className="mt-[1px] flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] bg-[#f0f2f5] text-[11px] tabular-nums text-[#646a73]">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-[#2b2f36]">{String(row.date ?? "")} · {String(row.label ?? "")}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-[#8f959e]">
                  {[row.organization, row.classification, row.closers].map(value => String(value ?? "")).filter(Boolean).join(" · ")}
                </div>
              </div>
            </div>
          ))}
          {!dealDetail?.loading && !dealDetail?.rows.length && <p className="py-8 text-center text-[13px] text-[#8f959e]">暂无成交记录</p>}
        </div>
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
          <Button variant="outline" size="sm" onClick={() => setDealDetail(null)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={!!trafficRecordDetail} onOpenChange={open => { if (!open) setTrafficRecordDetail(null) }}>
      <DialogContent initialFocus={false} className="flex max-h-[80vh] w-[620px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border-[0.5px] border-[#e8eaed] p-0">
        <DialogHeader className="flex-row items-start justify-between gap-3 border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-[14px] font-medium text-[#1f2329]">
              {trafficRecordDetail?.name || ""}
              {trafficRecordDetail?.type === "invited" && " · 受邀记录"}
              {trafficRecordDetail?.type === "cancelled" && " · 取消记录"}
              {trafficRecordDetail?.type === "arrived" && " · 到店记录"}
              {trafficRecordDetail?.type === "activity" && " · 参与活动"}
            </DialogTitle>
            <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">
              {trafficRecordLoading ? "加载中…" : `共 ${trafficRecordRows.length} 条`}
            </p>
          </div>
          {!trafficRecordLoading && trafficRecordRows.length > 0 && (
            <button
              type="button"
              onClick={() => setTrafficRecordExpanded(current => !current)}
              className="h-7 shrink-0 rounded-[4px] border border-[#dee0e3] bg-white px-2.5 text-[12px] font-normal text-[#4e535a] hover:bg-[#f5f6f7]"
            >
              {trafficRecordExpanded ? "缩略" : "展开"}
            </button>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {trafficRecordDetail?.type === "activity" ? (
            <>
              <div className="flex items-center border-b border-[#f0f0f0] px-5 py-1.5 text-[11px] text-[#8f959e]">
                <span className="w-24 shrink-0">日期</span>
                <span className="w-20 shrink-0">类型</span>
                <span className="min-w-0 flex-1">活动名称</span>
                <span className="w-20 shrink-0">老师</span>
                <span className="w-16 shrink-0">身份</span>
              </div>
              {trafficRecordRows.map((row, index) => (
                <div key={index} className={`flex px-5 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa] ${trafficRecordExpanded ? "items-start" : "items-center"}`}>
                  <span className="w-24 shrink-0 tabular-nums">{String(row.date ?? "")}</span>
                  <span className="w-20 shrink-0 text-[#8f959e]">{String(row.type ?? "")}</span>
                  <span className={trafficRecordExpanded ? "min-w-0 flex-1 whitespace-normal break-words" : "min-w-0 flex-1 truncate"} title={String(row.name ?? "")}>{String(row.name ?? "")}</span>
                  <span className={`w-20 shrink-0 ${trafficRecordExpanded ? "whitespace-normal break-words" : "truncate"}`} title={String(row.teacher ?? "")}>{recordValue(row.teacher)}</span>
                  <span className="w-16 shrink-0">{recordValue(row.role)}</span>
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="flex items-center border-b border-[#f0f0f0] px-5 py-1.5 text-[11px] text-[#8f959e]">
                <span className="w-32 shrink-0">日期</span>
                <span className="w-20 shrink-0">邀约人</span>
                <span className="min-w-0 flex-1">来访需求</span>
              </div>
              {trafficRecordRows.map((row, index) => (
                <div key={index} className={`flex px-5 py-2 text-[12px] text-[#4e535a] hover:bg-[#f7f8fa] ${trafficRecordExpanded ? "items-start" : "items-center"}`}>
                  <span className="w-32 shrink-0 tabular-nums">
                    {String(row.date ?? "")}
                    {trafficRecordDetail?.type !== "arrived" && (row.cancelled
                      ? <span className="ml-1 text-[#c4506a]">（已取消）</span>
                      : !row.arrived ? <span className="ml-1 text-[#a0a4ab]">（未参与）</span> : null)}
                  </span>
                  <span className="w-20 shrink-0 truncate text-[#8f959e]" title={String(row.referrer ?? "")}>{recordValue(row.referrer)}</span>
                  <span className={trafficRecordExpanded ? "min-w-0 flex-1 whitespace-normal break-words" : "min-w-0 flex-1 truncate"} title={String(row.needs ?? "")}>{recordValue(row.needs)}</span>
                </div>
              ))}
            </>
          )}
          {!trafficRecordLoading && !trafficRecordRows.length && <p className="py-8 text-center text-[13px] text-[#8f959e]">暂无数据</p>}
        </div>
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
          <Button variant="outline" size="sm" onClick={() => setTrafficRecordDetail(null)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <TeacherFollowUpDialog row={teacherFollowUpDetail} onClose={() => setTeacherFollowUpDetail(null)} />

    <Dialog open={!!detail} onOpenChange={open => { if (!open) { setDetail(null); setDetailTag("") } }}>
      <DialogContent initialFocus={false} className="flex max-h-[80vh] w-[660px] max-w-[92vw] flex-col gap-0 overflow-hidden rounded-[8px] border-[0.5px] border-[#e8eaed] p-0">
        <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
          <DialogTitle className="text-[14px] font-medium text-[#1f2329]">{detailTitle || "关联明细"}</DialogTitle>
          {detailSubtitle && <p className="mt-1 text-[12px] leading-5 text-[#8f959e]">{detailTag ? `${detailSubtitle} · ${detailTag}` : detailSubtitle}</p>}
        </DialogHeader>
        {detailEntries.length ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
            {detailEntries.map((entry, index) => {
              const dealRows = detailDealRows(entry.tag, entry.values)
              return (
                <div key={`${entry.tag}-${index}`} className="flex items-start gap-2.5 rounded-[6px] border border-[#f0f1f3] bg-[#fcfcfd] px-3 py-2">
                  <span className={`mt-[1px] shrink-0 rounded-[3px] px-1.5 py-0.5 text-[11px] leading-4 ${detailTagStyle(entry.tag)}`}>
                    {entry.tag}
                    {dealRows && dealRows.length > 1 ? ` ${dealRows.length} 笔` : ""}
                  </span>
                  {dealRows ? (
                    // 成交类明细按列对齐：客户 / 日期 / 项目 / 归属 每行对齐，读起来更清爽
                    <div className="min-w-0 flex-1">
                      <div className="grid grid-cols-[minmax(56px,84px)_88px_minmax(0,1fr)_minmax(72px,104px)] gap-3 text-[11px] leading-4 text-[#a0a6ad]">
                        <span>客户</span><span>日期</span><span>项目</span><span>归属</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {dealRows.map((row, rowIndex) => (
                          <div key={rowIndex} className="grid grid-cols-[minmax(56px,84px)_88px_minmax(0,1fr)_minmax(72px,104px)] gap-3 text-[12.5px] leading-5 text-[#2b2f36]">
                            <span className="truncate" title={row[0]}>{row[0] || "—"}</span>
                            <span className="truncate tabular-nums" title={row[1]}>{row[1] || "—"}</span>
                            <span className="truncate" title={row[2]}>{row[2] || "—"}</span>
                            <span className="truncate text-[#646a73]" title={row[3]}>{row[3] || "—"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <span className="min-w-0 flex-1 space-y-0.5 text-[12.5px] leading-5 text-[#2b2f36]">
                      {detailValueLines(entry.tag, entry.values).map((line, lineIndex) => <span key={lineIndex} className="block break-words">{line || "—"}</span>)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-[#8f959e]">暂无关联明细</p>
        )}
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-2.5">
          <Button variant="outline" size="sm" onClick={() => setDetail(null)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={saveOpen} onOpenChange={open => {
      setSaveOpen(open)
      if (!open && !busy) { setRuleNameDraft(""); setRuleDescriptionDraft(""); setRuleScopeDraft("private") }
    }}>
      <DialogContent initialFocus={false} className="w-[400px] max-w-[90vw] gap-0 rounded-[4px] border-[0.5px] border-[#e8eaed] p-0">
        <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-6 pb-2 pt-3">
          <DialogTitle className="text-[14px] font-normal">保存转化规则</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">规则名称</span>
            <Input value={ruleNameDraft} onChange={e => setRuleNameDraft(e.target.value)} maxLength={80} className="h-8 flex-1 rounded-[4px] border-[0.5px] border-[#e1e4e7] text-[12px] shadow-none focus-visible:ring-0" placeholder="例如：粗门首次到场 → 会员卡首购" />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">规则说明</span>
            <Input value={ruleDescriptionDraft} onChange={e => setRuleDescriptionDraft(e.target.value)} maxLength={200} className="h-8 flex-1 rounded-[4px] border-[0.5px] border-[#e1e4e7] text-[12px] shadow-none focus-visible:ring-0" placeholder="简要说明这条规则的用途（选填）" />
          </div>
          <div className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-right text-[12px] text-[#4e535a]">可见范围</span>
            <SelectDropdown value={ruleScopeDraft} options={[{ value: "private", label: "仅自己可见" }, { value: "shared", label: "团队共享" }]} onChange={value => setRuleScopeDraft(value as "private" | "shared")} className="flex-1" buttonClassName="!h-8 !rounded-[4px] !border-[0.5px] !border-[#e1e4e7] !bg-white !shadow-none" />
          </div>
          <p className="pl-[76px] text-[11px] leading-5 text-[#8f959e]">保存时会一并记住当前的筛选范围（组织/俱乐部 + 统计周期），下次选用这条规则会一起还原。</p>
        </div>
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => { setSaveOpen(false); setRuleNameDraft("") }} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
          <Button size="sm" onClick={createRule} disabled={!ruleNameDraft.trim() || busy} className="h-8 rounded-[4px] border border-[#3370ff] bg-[#3370ff] px-4 text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">{busy ? "保存中" : "保存"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={deleteOpen} onOpenChange={open => { if (!open) setDeleteOpen(false) }}>
      <DialogContent initialFocus={false} className="w-[360px] max-w-[90vw] gap-0 rounded-[10px] border-[0.5px] border-[#e8eaed] p-0">
        <DialogHeader className="border-b-[0.5px] border-[#f0f0f0] px-6 pb-2 pt-3"><DialogTitle className="text-[14px] font-normal">删除规则</DialogTitle></DialogHeader>
        <div className="px-5 py-5 text-[12px] text-[#4e535a]">确认删除“{query.rule.name}”吗？删除后无法恢复，业务记录不受影响。</div>
        <DialogFooter className="!mx-0 !mb-0 !rounded-b-none !bg-transparent border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
          <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} className="h-8 rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white px-4 text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
          <Button variant="destructive" size="sm" onClick={removeRule} disabled={busy} className="h-8 rounded-[4px] border-[0.5px] border-[#efc9cc] bg-[#fff5f5] px-4 text-[12px] font-normal text-[#c94b55] shadow-none hover:bg-[#ffeded]">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  )
}
