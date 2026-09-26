import { useEffect, useMemo, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Trash2, Edit, ArrowUp, ArrowDown, ShieldCheck, Loader2 } from "lucide-react"
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
import { memberIdentityApi, customerApi, type MemberIdentity, type MemberIdentityCreate, type IdentityCondition, type CustomerLight } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { HEALING_POSITIONS } from "@/lib/positions"

// 与 membership_card.card_type 实际值对齐；新增卡类型时需同步更新
const CARD_TYPES = ["次卡", "体验会员", "月卡", "12次卡", "3月卡", "30次卡", "60次卡", "半年卡", "年卡"]
const COURSE_TYPES = ["疗愈师课程：自爱力构建", "商业框架陪跑：自觉力提升", "落地赋能班：自洽力整合"]
const PAYMENT_CATEGORIES = ["会员卡", "粗门次卡", "觉醒游戏", "情绪释放", "能量结", "OH卡梳理", "内部课程", "茶位费", "线下课程", "其他项目"]

const TYPE_LABELS: Record<string, string> = {
  invitation: "邀约情况",
  arrival: "到店情况",
  activity: "活动参与",
  payment: "付费项目",
  card: "付费项目",
  course: "付费项目",
  teacher: "疗愈老师",
  fixed: "固定人员",
  amount: "消费金额",
}

const TEACHER_POSITIONS = [...HEALING_POSITIONS]

const COUNT_OP_LABELS: Record<string, string> = { ">": "大于", "=": "等于", "<": "小于", ">=": "不少于", "<=": "不超过" }
const COUNT_CATEGORIES = ["觉醒游戏", "情绪释放", "能量结", "OH卡诊断", "OH卡梳理", "其他项目", "粗门次卡", "茶位费", "线下课程"]
const RECORD_CATEGORIES = ["粗门次卡", "茶位费", "线下课程", "其他项目"]
const COUNT_OPTIONS = Object.entries(COUNT_OP_LABELS).map(([value, label]) => ({ value, label }))

function getPaymentCategories(c: IdentityCondition): string[] {
  if (c.type === "card") return ["会员卡"]
  if (c.type === "course") return ["内部课程"]
  return (c.payment_categories || []).map(category => category === "OH卡诊断" ? "OH卡梳理" : category === "会员活动" ? "会员卡" : category)
}

function conditionSummary(c: IdentityCondition): string {
  if (c.type === "invitation") {
    const label = c.invitation_scope === "cancelled" ? "取消邀约" : "邀约情况"
    if (c.count_value === 0 && c.count_op === "=") return c.invitation_scope === "cancelled" ? "没有取消记录" : "未被邀约"
    if (c.count_value === 0 && c.count_op === ">") return `${label} ≥ 1 次`
    return `${label} ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} 次`
  }
  if (c.type === "arrival" || c.type === "activity") {
    const isWelfare = c.type === "activity" && c.activity_scope === "welfare"
    const label = c.type === "arrival" ? "到店" : (isWelfare ? "参与公益活动" : "参与活动")
    const unit = isWelfare ? "场" : "天"
    if (c.count_value === 0 && c.count_op === "=") return `未${c.type === "arrival" ? "到店" : (isWelfare ? "参加公益活动" : "参与活动")}`
    if (c.count_value === 0 && c.count_op === ">") return `${label}至少 1 ${unit}`
    return `${label} ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} ${unit}`
  }
  if (c.type === "teacher") {
    if (!c.items || c.items.length === 0) return "疗愈老师（未选择）"
    return `疗愈老师：${c.items.join("或")}`
  }
  if (c.type === "fixed") {
    if (!c.items || c.items.length === 0) return "固定人员（未选择）"
    return `固定人员：${c.items.join("、")}`
  }
  if (c.type === "card" || c.type === "course" || c.type === "payment") {
    const categories = getPaymentCategories(c)
    const parts: string[] = []
    for (const cat of categories) {
      if (cat === "会员卡" || cat === "内部课程") {
        const subItems = c.items.length > 0 ? c.items.join("或") : `任意${cat}`
        parts.push(`${cat === "会员卡" ? "持有" : "购买"}${c.validity === "active" ? "有效的" : ""}${subItems}${c.validity === "all" ? "（含过期）" : ""}`)
      } else {
        parts.push(`${cat} ${RECORD_CATEGORIES.includes(cat) ? "交易笔数" : "购买场次"} ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} ${RECORD_CATEGORIES.includes(cat) ? "笔" : "次"}`)
      }
    }
    return parts.join("；或 ") || "请选择付费项目"
  }
  if (c.type === "amount") {
    return `消费金额 ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} 元`
  }
  return ""
}

function defaultCondition(): IdentityCondition {
  return { type: "" as any, items: [], payment_categories: [], count_op: ">", count_value: "" as any, validity: "active", activity_scope: "all", invitation_scope: "active" }
}

export default function MemberIdentitiesPage() {
  const enterToNext = useEnterToNext()
  const [identities, setIdentities] = useState<MemberIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [keyword, setKeyword] = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [conditionFilter, setConditionFilter] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MemberIdentity | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState("")
  const [formConditions, setFormConditions] = useState<IdentityCondition[]>([defaultCondition()])
  const [formOperator, setFormOperator] = useState<"all" | "any">("all")
  const [customerList, setCustomerList] = useState<CustomerLight[]>([])

  useEffect(() => {
    if (!dialogOpen) return
    let active = true
    customerApi.light().then(items => { if (active) setCustomerList(items) }).catch(() => {})
    return () => { active = false }
  }, [dialogOpen])

  const filteredIdentities = useMemo(() => identities.filter(item =>
    item.name.toLowerCase().includes(keyword.trim().toLowerCase()) &&
    (!typeFilter || item.type === typeFilter) &&
    (!conditionFilter || (conditionFilter === "none" ? item.conditions.length === 0 : item.conditions.some(c =>
      (c.type === "card" || c.type === "course" ? "payment" : c.type) === conditionFilter)))
  ), [identities, keyword, typeFilter, conditionFilter])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(filteredIdentities)

  const load = () => {
    setError("")
    memberIdentityApi.list()
      .then(setIdentities)
      .catch(e => setError(e instanceof Error ? e.message : "身份加载失败，请重试"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormName("")
    setFormType("")
    setFormConditions([defaultCondition()])
    setFormOperator("all")
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: MemberIdentity) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormType(item.type || "")
    // 兼容旧类型：card/course 自动转为 payment
    const conditions = item.conditions.length > 0 ? item.conditions.map(c => {
      if (c.type === "card") return { ...c, type: "payment" as const, payment_categories: ["会员卡"] }
      if (c.type === "course") return { ...c, type: "payment" as const, payment_categories: ["内部课程"] }
      return c
    }) : [defaultCondition()]
    setFormConditions(conditions)
    setFormOperator(item.operator || "all")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim() || !formType) return
    setSaving(true)
    setError("")
    try {
      const validConditions = formConditions.filter(c => c.type).map(c => ({
        ...c,
        count_value: parseInt(c.count_value as any) || 0,
      }))
      const data: MemberIdentityCreate = {
        name: formName.trim(),
        type: formType,
        conditions: validConditions,
        operator: validConditions.length > 1 ? formOperator : "all",
      }
      if (editingItem) {
        await memberIdentityApi.update(editingItem.id, data)
      } else {
        await memberIdentityApi.create(data)
      }
      setDialogOpen(false)
      load()
    } catch (error) {
      setError(error instanceof Error ? error.message : "保存失败，请重试")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    try {
      await memberIdentityApi.delete(deleteId)
      setDeleteId(null)
      load()
    } catch (error) {
      setError(error instanceof Error ? error.message : "删除失败，请重试")
    }
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    try {
      await memberIdentityApi.refreshAll()
    } catch (error) {
      setError(error instanceof Error ? error.message : "刷新失败，请重试")
    } finally {
      setRefreshing(false)
    }
  }

  const handleMoveUp = async (index: number) => {
    if (index === 0) return
    const reordered = [...identities]
    const temp = reordered[index]
    reordered[index] = reordered[index - 1]
    reordered[index - 1] = temp
    setIdentities(reordered)
    try {
      await memberIdentityApi.reorder(reordered.map(item => item.id))
    } catch { load() }
  }

  const handleMoveDown = async (index: number) => {
    if (index === identities.length - 1) return
    const reordered = [...identities]
    const temp = reordered[index]
    reordered[index] = reordered[index + 1]
    reordered[index + 1] = temp
    setIdentities(reordered)
    try {
      await memberIdentityApi.reorder(reordered.map(item => item.id))
    } catch { load() }
  }

  const addCondition = () => {
    setFormConditions(prev => [...prev, defaultCondition()])
  }

  const removeCondition = (index: number) => {
    setFormConditions(prev => prev.filter((_, i) => i !== index))
  }

  const updateCondition = (index: number, updates: Partial<IdentityCondition>) => {
    setFormConditions(prev => prev.map((c, i) => {
      if (i !== index) return c
      const updated = { ...c, ...updates }
      // 类型切换时重置
      if (updates.type && updates.type !== c.type) {
        updated.items = []
        updated.payment_categories = []
        updated.count_op = ">"
        updated.count_value = "" as any
        updated.validity = "active"
        updated.activity_scope = "all"
      }
      return updated
    }))
  }

  const selectPaymentCategory = (condIndex: number, category: string) => {
    setFormConditions(prev => prev.map((c, i) => {
      if (i !== condIndex) return c
      const current = (c.payment_categories || [])[0]
      const next = current === category ? [] : [category]
      return { ...c, payment_categories: next, items: [] }
    }))
  }

  const toggleItem = (condIndex: number, item: string) => {
    setFormConditions(prev => prev.map((c, i) => {
      if (i !== condIndex) return c
      const items = c.items.includes(item) ? c.items.filter(x => x !== item) : [...c.items, item]
      return { ...c, items }
    }))
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">
      <h1 className="text-[18px] font-medium text-[#1f2329]">会员身份</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Input className="h-8 w-52 text-xs" value={keyword} placeholder="搜索身份名称" onChange={e => { setKeyword(e.target.value); goToPage(1) }} />
        <SelectDropdown value={typeFilter} options={[{ value: "", label: "全部分类" }, { value: "新人", label: "新人" }, { value: "老人", label: "老人" }]} onChange={v => { setTypeFilter(v); goToPage(1) }} />
        <SelectDropdown value={conditionFilter} options={[{ value: "", label: "全部条件" }, ...Object.entries(TYPE_LABELS).filter(([key]) => key !== "card" && key !== "course").map(([value, label]) => ({ value, label })), { value: "none", label: "默认匹配" }]} onChange={v => { setConditionFilter(v); goToPage(1) }} />
        {(keyword || typeFilter || conditionFilter) && <Button variant="ghost" size="sm" onClick={() => { setKeyword(""); setTypeFilter(""); setConditionFilter(""); goToPage(1) }}>重置</Button>}
        <Button size="sm" className="ml-auto h-8 text-xs" onClick={handleOpenCreate}><Plus className="mr-1 h-3.5 w-3.5" />新增身份</Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>显示 {filteredIdentities.length} / {identities.length} 个身份 · 从上到下，首个命中生效{keyword || typeFilter || conditionFilter ? " · 清空筛选后可调整顺序" : ""}</span>
        <div className="flex items-center gap-2">
          <span>保存后自动更新，通常无需手动刷新</span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleRefreshAll} disabled={refreshing}>
            {refreshing && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}{refreshing ? "刷新中…" : "手动刷新"}
          </Button>
        </div>
      </div>
      {error && <div role="alert" className="text-xs text-destructive">{error} <button onClick={load}>重新加载</button></div>}
      {!loading && identities.length > 0 && filteredIdentities.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">没有符合筛选条件的身份</p>}
      <div className="bg-white rounded-lg">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
        ) : identities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ShieldCheck className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">暂无会员身份</p>
            <p className="text-xs text-muted-foreground mt-1">点击上方"新增身份"按钮添加</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 pl-4">优先级</TableHead>
                <TableHead>身份名称</TableHead>
                <TableHead className="w-16">类型</TableHead>
                <TableHead>匹配条件</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => {
                const globalIndex = identities.findIndex(identity => identity.id === item.id)
                return (
                <TableRow key={item.id}>
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground tabular-nums">{globalIndex + 1}</span>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors disabled:opacity-30"
                        title="提高优先级" aria-label="提高优先级" disabled={globalIndex === 0 || !!keyword || !!typeFilter || !!conditionFilter}
                        onClick={() => handleMoveUp(globalIndex)}
                      >
                        <ArrowUp className="h-3 w-3 text-[#8f959e]" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors disabled:opacity-30"
                        title="降低优先级" aria-label="降低优先级" disabled={globalIndex === identities.length - 1 || !!keyword || !!typeFilter || !!conditionFilter}
                        onClick={() => handleMoveDown(globalIndex)}
                      >
                        <ArrowDown className="h-3 w-3 text-[#8f959e]" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36] font-medium">{item.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px] text-[#4e535a]">{item.type || "-"}</span>
                  </TableCell>
                  <TableCell>
                    {item.conditions.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {item.conditions.map((c, ci) => (
                          <div key={ci} className="text-[12px] text-[#4e535a]">
                            {ci > 0 && (
                              <span className="text-[#8f959e] mr-1">{item.operator === "any" ? "或" : "且"}</span>
                            )}
                            {conditionSummary(c)}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#8f959e] font-light">默认匹配 · 接收前面未命中的客户</span>
                    )}
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
                )
              })}
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
        <DialogContent initialFocus={false} className="sm:max-w-[640px] p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[14px]">{editingItem ? "编辑身份" : "新增身份"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto" {...enterToNext}>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <h2 className="text-[13px] font-medium">基本信息</h2>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">身份名称</span>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="输入会员身份名称" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">分类</span>
              <SelectDropdown
                value={formType}
                options={[{value: "老人", label: "老人"}, {value: "新人", label: "新人"}]}
                placeholder="请选择类型"
                onChange={setFormType}
              />
            </div>

            <div className="space-y-3 border-t pt-4">
              <h2 className="text-[13px] font-medium">匹配规则</h2>
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">满足方式</span>
                <div className="flex items-center justify-between gap-2">
                  {(
                    <SelectDropdown
                      value={formOperator}
                      options={[{value: "all", label: "全部满足"}, {value: "any", label: "满足任意一项"}]}
                      onChange={(v) => setFormOperator(v as "all" | "any")}
                      size="sm"
                    />
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={addCondition}>
                    <Plus className="mr-1 h-3 w-3" /> 新增条件
                  </Button>
                </div>
              </div>

              {formConditions.length === 0 ? (
                <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                  <span />
                  <p className="text-[12px] text-[#8f959e] py-4">默认匹配前面规则未命中的客户，建议放在最后。</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formConditions.map((cond, ci) => (
                    <div key={ci} className="grid grid-cols-[28px_1fr] items-start gap-2">
                      <span className="pt-3 text-xs text-muted-foreground">{ci + 1}</span>
                      <div className="border border-[#e5e6eb] rounded-md p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">条件</span>
                        <SelectDropdown
                          value={cond.type}
                          options={[{value: "invitation", label: "邀约情况"}, {value: "arrival", label: "到店情况"}, {value: "activity", label: "活动参与"}, {value: "teacher", label: "疗愈老师"}, {value: "payment", label: "付费项目"}, {value: "fixed", label: "固定人员"}, {value: "amount", label: "消费金额"}]}
                          placeholder="请选择条件类型"
                          onChange={(v) => updateCondition(ci, { type: v as IdentityCondition["type"] })}
                        />

                        <div className="flex-1" />

                        {formConditions.length > 1 && (
                          <button
                            className="h-7 w-7 flex items-center justify-center rounded hover:bg-red-50 transition-colors"
                            onClick={() => removeCondition(ci)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-[#8f959e] hover:text-destructive" />
                          </button>
                        )}
                      </div>

                      {/* 邀约/到店/活动 → 按次数 */}
                      {cond.type && (cond.type === "invitation" || cond.type === "arrival" || cond.type === "activity") && (
                        <>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">{cond.type === "arrival" || (cond.type === "activity" && cond.activity_scope !== "welfare") ? "天数" : cond.type === "activity" ? "场数" : "次数"}</span>
                          <SelectDropdown
                            value={cond.count_op}
                            options={COUNT_OPTIONS}
                            onChange={(v) => updateCondition(ci, { count_op: v as IdentityCondition["count_op"] })}
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cond.count_value}
                            onChange={(e) => updateCondition(ci, { count_value: e.target.value.replace(/[^0-9]/g, "") } as any)}
                            className="w-20 h-8 text-[12px]"
                          />
                          <span className="text-[12px] text-[#4e535a]">{cond.type === "arrival" || (cond.type === "activity" && cond.activity_scope !== "welfare") ? "天" : cond.type === "activity" ? "场" : "次"}</span>
                        </div>
                        {cond.type === "activity" && (
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cond.activity_scope === "welfare"}
                              onChange={(e) => updateCondition(ci, { activity_scope: e.target.checked ? "welfare" : "all" })}
                              className="w-3.5 h-3.5 rounded border-[#dee0e3]"
                            />
                            <span className="text-[12px] text-[#4e535a]">仅公益活动</span>
                          </label>
                        )}
                        {cond.type === "invitation" && (
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">口径</span>
                            <SelectDropdown
                              value={cond.invitation_scope || "active"}
                              options={[{ value: "active", label: "正常邀约" }, { value: "cancelled", label: "已取消邀约" }]}
                              onChange={(v) => updateCondition(ci, { invitation_scope: v as "active" | "cancelled" })}
                            />
                            <span className="text-[12px] text-[#8f959e]">与是否到店无关</span>
                          </div>
                        )}
                        </>
                      )}

                      {/* 消费金额 → 运算符 + 金额 */}
                      {cond.type === "amount" && (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">金额</span>
                          <SelectDropdown
                            value={cond.count_op}
                            options={[{value: ">", label: "大于"}, {value: ">=", label: "大于等于"}, {value: "=", label: "等于"}, {value: "<=", label: "小于等于"}, {value: "<", label: "小于"}]}
                            onChange={(v) => updateCondition(ci, { count_op: v as IdentityCondition["count_op"] })}
                          />
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={cond.count_value}
                            onChange={(e) => updateCondition(ci, { count_value: e.target.value.replace(/[^0-9]/g, "") } as any)}
                            className="w-24 h-8 text-[12px]"
                          />
                          <span className="text-[12px] text-[#4e535a]">元</span>
                        </div>
                      )}

                      {/* 疗愈老师 → 身份选择 */}
                      {cond.type === "teacher" && (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">身份</span>
                          <SelectDropdown
                            value={cond.items[0] || ""}
                            options={TEACHER_POSITIONS.map(p => ({value: p, label: p}))}
                            placeholder="请选择身份"
                            onChange={(v) => updateCondition(ci, { items: v ? [v] : [] })}
                          />
                        </div>
                      )}

                      {/* 固定人员 → 多昵称选择 */}
                      {cond.type === "fixed" && (
                        <div className="flex items-start gap-2">
                          <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right pt-2">人员</span>
                          <div className="flex-1">
                            <CustomerSearchInput
                              customers={customerList}
                              value={cond.items}
                              onChange={(val) => updateCondition(ci, { items: val as string[] })}
                              multi
                              placeholder="输入姓名或昵称搜索添加..."
                            />
                          </div>
                        </div>
                      )}

                      {/* 付费项目 → 项目类别 + 子项/次数 */}
                      {cond.type && (cond.type === "payment" || cond.type === "card" || cond.type === "course") && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">项目</span>
                            <SelectDropdown
                              value={getPaymentCategories(cond)[0] || ""}
                              options={PAYMENT_CATEGORIES.map(cat => ({value: cat, label: cat}))}
                              placeholder="请选择项目"
                              onChange={(v) => selectPaymentCategory(ci, v)}
                            />
                          </div>

                          {/* 会员卡子项 */}
                          {getPaymentCategories(cond).includes("会员卡") && (
                            <div className="flex items-start gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right pt-1.5">会员卡</span>
                              <div className="flex flex-wrap gap-1.5">
                                {Array.from(new Set([...CARD_TYPES, ...cond.items.filter(item => !COURSE_TYPES.includes(item))])).map((item) => (
                                  <label
                                    key={item}
                                    className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[12px] cursor-pointer transition-colors ${
                                      cond.items.includes(item)
                                        ? "bg-[#3370ff] text-white border-[#3370ff]"
                                        : "border-[#dee0e3] bg-white text-[#2b2f36] hover:bg-[#f7f8fa]"
                                    }`}
                                  >
                                    <input type="checkbox" checked={cond.items.includes(item)} onChange={() => toggleItem(ci, item)} className="hidden" />
                                    {item}
                                  </label>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 内部课程子项 */}
                          {getPaymentCategories(cond).includes("内部课程") && (
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">内部课程</span>
                              <SelectDropdown
                                value={cond.items[0] || ""}
                                options={COURSE_TYPES.map(t => ({value: t, label: t}))}
                                placeholder="请选择课程"
                                onChange={(v) => updateCondition(ci, { items: v ? [v] : [] })}
                              />
                            </div>
                          )}

                          {/* 觉醒游戏/情绪释放/能量结 → 购买场次 */}
                          {getPaymentCategories(cond).some((cat: string) => COUNT_CATEGORIES.includes(cat)) && (
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">{getPaymentCategories(cond).some(cat => RECORD_CATEGORIES.includes(cat)) ? "交易笔数" : "购买场次"}</span>
                              <SelectDropdown
                                value={cond.count_op}
                                options={COUNT_OPTIONS}
                                onChange={(v) => updateCondition(ci, { count_op: v as IdentityCondition["count_op"] })}
                              />
                              <Input
                                type="text"
                                inputMode="numeric"
                                value={cond.count_value}
                                onChange={(e) => updateCondition(ci, { count_value: e.target.value.replace(/[^0-9]/g, "") } as any)}
                                className="w-20 h-8 text-[12px]"
                              />
                              <span className="text-[12px] text-[#4e535a]">{getPaymentCategories(cond).some(cat => RECORD_CATEGORIES.includes(cat)) ? "笔" : "次"}</span>
                            </div>
                          )}

                          {getPaymentCategories(cond).some(cat => ["粗门次卡", "茶位费", "线下课程"].includes(cat)) && <p className="text-xs text-muted-foreground">按未删除、未取消的交易记录计笔数，不按扣卡次数；不判断有效期。</p>}
                          {/* 有效期（会员卡或内部课程选中时显示） */}
                          {getPaymentCategories(cond).some((cat: string) => cat === "会员卡" || cat === "内部课程") && (
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-[50px] text-right">有效期</span>
                              <SelectDropdown
                                value={cond.validity}
                                options={[{value: "active", label: "仅有效期内"}, {value: "all", label: "过期依旧保留"}]}
                                onChange={(v) => updateCondition(ci, { validity: v as IdentityCondition["validity"] })}
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <section aria-live="polite" className="rounded-md border border-[#e5e6eb] bg-[#f7f8fa] p-3 space-y-2">
              <h2 className="text-[13px] font-medium">规则预览</h2>
              <p className="text-xs text-muted-foreground">{formName.trim() || "未命名身份"}{formType ? " · " + formType : ""}</p>
              {formConditions.some(c => c.type) ? (
                <div className="space-y-1 text-[13px] leading-6 text-[#4e535a]">
                  {formConditions.filter(c => c.type).map((c, index) => (
                    <p key={index}>{index > 0 && <span className="mr-1 text-[#3370ff]">{formOperator === "all" ? "并且" : "或者"}</span>}{conditionSummary({ ...c, count_value: Number(c.count_value) || 0 })}</p>
                  ))}
                </div>
              ) : <p className="text-[13px] text-[#4e535a]">默认匹配：接收前面规则未命中的客户，建议放在最后。</p>}
              <p className="text-xs text-muted-foreground">保存后自动更新客户身份；数量未填时按 0 保存。</p>
            </section>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" className="h-8 text-[12px]" onClick={handleSave} disabled={saving || !formName.trim() || !formType}>
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
            <AlertDialogTitle>删除身份</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除该身份规则吗？系统会重新计算客户身份，并移除该身份关联的权限配置。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
