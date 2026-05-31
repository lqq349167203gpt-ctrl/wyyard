import { useEffect, useState } from "react"
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
import { memberIdentityApi, type MemberIdentity, type MemberIdentityCreate, type IdentityCondition } from "@/lib/api"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"
import { ActivityConfigContent } from "@/pages/activity-config"

const CARD_TYPES = ["体验会员", "常规通卡", "半年卡", "年卡"]
const COURSE_TYPES = ["疗愈师课程：自爱力构建", "商业框架陪跑：自觉力提升", "落地赋能班：自洽力整合"]
const PAYMENT_CATEGORIES = ["会员活动", "觉醒游戏", "情绪释放", "能量结", "内部课程"]

const TYPE_LABELS: Record<string, string> = {
  arrival: "到店情况",
  activity: "活动参与",
  payment: "付费项目",
  card: "付费项目",
  course: "付费项目",
}

const COUNT_OP_LABELS: Record<string, string> = { ">": "大于", "=": "等于", "<": "小于" }
const COUNT_CATEGORIES = ["觉醒游戏", "情绪释放", "能量结"]

function getPaymentCategories(c: IdentityCondition): string[] {
  if (c.type === "card") return ["会员活动"]
  if (c.type === "course") return ["内部课程"]
  return c.payment_categories || []
}

function conditionSummary(c: IdentityCondition): string {
  if (c.type === "arrival" || c.type === "activity") {
    const label = TYPE_LABELS[c.type]
    if (c.count_value === 0 && c.count_op === "=") return `未${c.type === "arrival" ? "到店" : "参与活动"}`
    if (c.count_value === 0 && c.count_op === ">") return `${label} ≥ 1 次`
    return `${label} ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} 次`
  }
  if (c.type === "card" || c.type === "course" || c.type === "payment") {
    const categories = getPaymentCategories(c)
    const parts: string[] = []
    for (const cat of categories) {
      if (cat === "会员活动" || cat === "内部课程") {
        const prefix = cat === "会员活动" ? "持有" : "购买"
        const subItems = c.items.length > 0 ? c.items.join("、") : "任意"
        const validity = c.validity === "active" ? "有效" : "含过期"
        parts.push(`${prefix}${validity}：${subItems}`)
      } else {
        parts.push(`${cat} ${COUNT_OP_LABELS[c.count_op]} ${c.count_value} 次`)
      }
    }
    return parts.join("，")
  }
  return ""
}

function defaultCondition(): IdentityCondition {
  return { type: "" as any, items: [], payment_categories: [], count_op: ">", count_value: 0, validity: "active" }
}

export default function MemberIdentitiesPage() {
  const [activeTab, setActiveTab] = useState("identities")
  const [identities, setIdentities] = useState<MemberIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<MemberIdentity | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const [formName, setFormName] = useState("")
  const [formConditions, setFormConditions] = useState<IdentityCondition[]>([defaultCondition()])
  const [formOperator, setFormOperator] = useState<"all" | "any">("all")

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(identities)

  const load = () => {
    memberIdentityApi.list()
      .then(setIdentities)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleOpenCreate = () => {
    setEditingItem(null)
    setFormName("")
    setFormConditions([defaultCondition()])
    setFormOperator("all")
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: MemberIdentity) => {
    setEditingItem(item)
    setFormName(item.name)
    setFormConditions(item.conditions.length > 0 ? [...item.conditions] : [defaultCondition()])
    setFormOperator(item.operator || "all")
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!formName.trim()) return
    setSaving(true)
    try {
      const validConditions = formConditions.filter(c => c.type)
      const data: MemberIdentityCreate = {
        name: formName.trim(),
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
      console.error("保存失败:", error)
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
      console.error("删除失败:", error)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshing(true)
    try {
      await memberIdentityApi.refreshAll()
    } catch (error) {
      console.error("刷新失败:", error)
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
    try {
      await memberIdentityApi.reorder(reordered.map(item => item.id))
      load()
    } catch {}
  }

  const handleMoveDown = async (index: number) => {
    if (index === identities.length - 1) return
    const reordered = [...identities]
    const temp = reordered[index]
    reordered[index] = reordered[index + 1]
    reordered[index + 1] = temp
    try {
      await memberIdentityApi.reorder(reordered.map(item => item.id))
      load()
    } catch {}
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
        updated.count_value = 0
        updated.validity = "active"
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
      {/* Tab 切换 */}
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {[
            { key: "identities", label: "会员身份" },
            { key: "activity-permissions", label: "会员权限" },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-2 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "identities" && (
        <>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          共 {identities.length} 个身份
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={handleRefreshAll}
            disabled={refreshing}
          >
            {refreshing ? (
              <><Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> 刷新中...</>
            ) : (
              "刷新全部用户身份"
            )}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> 新增身份
          </Button>
        </div>
      </div>

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
                <TableHead>匹配条件</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item, index) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4">
                    <div className="flex flex-col gap-0.5">
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors disabled:opacity-30"
                        disabled={index === 0}
                        onClick={() => handleMoveUp(index)}
                      >
                        <ArrowUp className="h-3 w-3 text-[#8f959e]" />
                      </button>
                      <button
                        className="h-5 w-5 flex items-center justify-center rounded hover:bg-[#f0f0f0] transition-colors disabled:opacity-30"
                        disabled={index === identities.length - 1}
                        onClick={() => handleMoveDown(index)}
                      >
                        <ArrowDown className="h-3 w-3 text-[#8f959e]" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36] font-medium">{item.name}</span>
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
                      <span className="text-[12px] text-[#8f959e] font-light">无条件（直接匹配）</span>
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
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-[14px]">{editingItem ? "编辑身份" : "新增身份"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">身份名称</span>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="输入会员身份名称" />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-[70px_1fr] items-center gap-2">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">匹配条件</span>
                <div className="flex items-center justify-between gap-2">
                  {formConditions.length > 1 && (
                    <select
                      value={formOperator}
                      onChange={(e) => setFormOperator(e.target.value as "all" | "any")}
                      className="h-7 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                    >
                      <option value="all">全部满足</option>
                      <option value="any">满足任意一项</option>
                    </select>
                  )}
                  <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={addCondition}>
                    <Plus className="mr-1 h-3 w-3" /> 新增条件
                  </Button>
                </div>
              </div>

              {formConditions.length === 0 ? (
                <div className="grid grid-cols-[70px_1fr] items-start gap-2">
                  <span />
                  <p className="text-[12px] text-[#8f959e] py-4">无条件则直接匹配所有用户</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {formConditions.map((cond, ci) => (
                    <div key={ci} className="grid grid-cols-[70px_1fr] items-start gap-2">
                      <span />
                      <div className="border border-[#e5e6eb] rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right">条件</span>
                        <select
                          value={cond.type}
                          onChange={(e) => updateCondition(ci, { type: e.target.value as IdentityCondition["type"] })}
                          className="h-8 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                        >
                          <option value="" disabled>请选择条件类型</option>
                          <option value="arrival">到店情况</option>
                          <option value="activity">活动参与</option>
                          <option value="payment">付费项目</option>
                        </select>

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

                      {/* 到店/活动 → 按次数 */}
                      {cond.type && (cond.type === "arrival" || cond.type === "activity") && (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right">次数</span>
                          <select
                            value={cond.count_op}
                            onChange={(e) => updateCondition(ci, { count_op: e.target.value as IdentityCondition["count_op"] })}
                            className="h-8 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                          >
                            <option value=">">大于</option>
                            <option value="=">等于</option>
                            <option value="<">小于</option>
                          </select>
                          <Input
                            type="number"
                            min={0}
                            value={cond.count_value}
                            onChange={(e) => updateCondition(ci, { count_value: parseInt(e.target.value) || 0 })}
                            className="w-20 h-8 text-[12px]"
                          />
                          <span className="text-[12px] text-[#4e535a]">次</span>
                        </div>
                      )}

                      {/* 付费项目 → 项目类别 + 子项/次数 */}
                      {cond.type && (cond.type === "payment" || cond.type === "card" || cond.type === "course") && (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right">项目</span>
                            <select
                              value={getPaymentCategories(cond)[0] || ""}
                              onChange={(e) => selectPaymentCategory(ci, e.target.value)}
                              className="h-8 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                            >
                              <option value="" disabled>请选择项目</option>
                              {PAYMENT_CATEGORIES.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>

                          {/* 会员活动子项 */}
                          {getPaymentCategories(cond).includes("会员活动") && (
                            <div className="flex items-start gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right pt-1.5">会员活动</span>
                              <div className="flex flex-wrap gap-1.5">
                                {CARD_TYPES.map((item) => (
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
                            <div className="flex items-start gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right pt-1.5">内部课程</span>
                              <div className="flex flex-wrap gap-1.5">
                                {COURSE_TYPES.map((item) => (
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

                          {/* 觉醒游戏/情绪释放/能量结 → 购买次数 */}
                          {getPaymentCategories(cond).some((cat: string) => COUNT_CATEGORIES.includes(cat)) && (
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right">次数</span>
                              <select
                                value={cond.count_op}
                                onChange={(e) => updateCondition(ci, { count_op: e.target.value as IdentityCondition["count_op"] })}
                                className="h-8 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                              >
                                <option value=">">大于</option>
                                <option value="=">等于</option>
                                <option value="<">小于</option>
                              </select>
                              <Input
                                type="number"
                                min={0}
                                value={cond.count_value}
                                onChange={(e) => updateCondition(ci, { count_value: parseInt(e.target.value) || 0 })}
                                className="w-20 h-8 text-[12px]"
                              />
                              <span className="text-[12px] text-[#4e535a]">次</span>
                            </div>
                          )}

                          {/* 有效期（会员活动或内部课程选中时显示） */}
                          {getPaymentCategories(cond).some((cat: string) => cat === "会员活动" || cat === "内部课程") && (
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#4e535a] font-light shrink-0 w-10 text-right">有效期</span>
                              <select
                                value={cond.validity}
                                onChange={(e) => updateCondition(ci, { validity: e.target.value as IdentityCondition["validity"] })}
                                className="h-8 appearance-none rounded-md border border-[#dee0e3] bg-white pl-2 pr-7 text-[12px] text-[#2b2f36] focus:outline-none focus:border-[#3370ff] bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%238f959e%22%20d%3D%22M3%204.5l3%203%203-3%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_8px_center] bg-no-repeat"
                              >
                                <option value="active">仅有效期内</option>
                                <option value="all">过期依旧保留</option>
                              </select>
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

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" className="h-8 text-[12px]" onClick={handleSave} disabled={saving || !formName.trim()}>
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
              确定要删除该身份规则吗？已匹配的用户身份不会自动清除，需手动刷新。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
        </>
      )}

      {activeTab === "activity-permissions" && <ActivityConfigContent embedded />}
    </div>
  )
}
