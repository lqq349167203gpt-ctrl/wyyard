import { useEffect, useState } from "react"
import { Plus, Trash2, Bell, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { reminderApi, positionApi, accountApi, type Reminder, type ReminderCreate, type ReminderCondition } from "@/lib/api"
import { SelectDropdown } from "@/components/select-dropdown"
import { usePagination } from "@/hooks/use-pagination"
import { PaginationBar } from "@/components/pagination-bar"

const CONDITION_TYPE_OPTIONS = [
  { value: "acquaintance_date", label: "认识日期" },
  { value: "visit_count", label: "到店次数" },
  { value: "activity", label: "活动参与" },
]

const ACTIVITY_TYPE_OPTIONS = [
  { value: "membership", label: "会员活动" },
  { value: "emotional_release", label: "情绪释放" },
  { value: "group_case", label: "觉醒游戏" },
  { value: "energy_knot", label: "能量结" },
  { value: "internal_course", label: "内部课程" },
]

const OPERATOR_OPTIONS = [
  { value: "gt", label: "大于" },
  { value: "eq", label: "等于" },
  { value: "lt", label: "小于" },
]

const emptyCondition = (): ReminderCondition => ({
  type: "acquaintance_date",
  mode: "fixed_cycle",
  operator: "",
  value: 0,
  activity_type: "",
})

const emptyForm = (): ReminderCreate => ({
  name: "",
  account_role: "全部",
  account_id: "全部",
  condition_logic: "all",
  conditions: [emptyCondition()],
  trigger_mode: "once",
})

function formatCondition(c: ReminderCondition): string {
  if (c.type === "acquaintance_date") {
    if (c.mode === "fixed_cycle") return `每${c.value}天`
    const op = OPERATOR_OPTIONS.find(o => o.value === c.operator)?.label || c.operator
    return `认识${op}${c.value}天`
  }
  if (c.type === "visit_count") {
    if (c.mode === "fixed_cycle") return `每${c.value}次`
    const op = OPERATOR_OPTIONS.find(o => o.value === c.operator)?.label || c.operator
    return `到店${op}${c.value}次`
  }
  if (c.type === "activity") {
    const actLabel = ACTIVITY_TYPE_OPTIONS.find(a => a.value === c.activity_type)?.label || c.activity_type
    const modeLabel = c.mode === "participation_count" ? "参与" : "剩余"
    const op = OPERATOR_OPTIONS.find(o => o.value === c.operator)?.label || c.operator
    return `${actLabel}${modeLabel}${op}${c.value}次`
  }
  return ""
}

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingItem, setDeletingItem] = useState<Reminder | null>(null)
  const [editingItem, setEditingItem] = useState<Reminder | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<ReminderCreate>(emptyForm())

  const [roles, setRoles] = useState<string[]>([])
  const [accounts, setAccounts] = useState<{ id: string; username: string }[]>([])

  const loadData = () => {
    reminderApi.list()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    positionApi.list().then(list => setRoles(list.map((p: { name: string }) => p.name))).catch(() => {})
    accountApi.list().then((list: { id: string; username: string }[]) => setAccounts(list)).catch(() => {})
  }, [])

  const { paginatedItems, currentPage, totalPages, totalItems, goToPage, startIndex, endIndex } = usePagination(items)

  const handleOpenCreate = () => {
    setEditingItem(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const handleOpenEdit = (item: Reminder) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      account_role: item.account_role,
      account_id: item.account_id,
      condition_logic: item.condition_logic,
      conditions: item.conditions.length > 0 ? item.conditions : [emptyCondition()],
      trigger_mode: item.trigger_mode,
    })
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      if (editingItem) {
        await reminderApi.update(editingItem.id, form)
      } else {
        await reminderApi.create(form)
      }
      setDialogOpen(false)
      loadData()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingItem) return
    await reminderApi.delete(deletingItem.id)
    setDeleteDialogOpen(false)
    setDeletingItem(null)
    loadData()
  }

  const updateCondition = (index: number, patch: Partial<ReminderCondition>) => {
    setForm(prev => {
      const conditions = [...prev.conditions]
      conditions[index] = { ...conditions[index], ...patch }
      return { ...prev, conditions }
    })
  }

  const addCondition = () => {
    setForm(prev => ({ ...prev, conditions: [...prev.conditions, emptyCondition()] }))
  }

  const removeCondition = (index: number) => {
    setForm(prev => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }))
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">提醒配置</h1>
          <p className="text-xs text-muted-foreground mt-1.5">共 {items.length} 条提醒规则</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={handleOpenCreate}>
          <Plus className="mr-1 h-3.5 w-3.5" /> 新增提醒
        </Button>
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">加载中...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <Bell className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">暂无提醒规则</p>
          <p className="text-xs text-muted-foreground mt-1">点击上方"新增提醒"按钮添加</p>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">名称</TableHead>
                <TableHead>账号角色</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>条件</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="pl-4">
                    <span className="text-[13px] text-[#2b2f36] font-medium">{item.name}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36]">{item.account_role}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36]">{item.account_id}</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {item.conditions.map((c, i) => (
                        <span key={i} className="text-[12px] text-[#8f959e] bg-[#f0f1f2] px-1.5 py-0.5 rounded">
                          {formatCondition(c)}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(item)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setDeletingItem(item); setDeleteDialogOpen(true) }}>
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

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editingItem ? "编辑提醒" : "新增提醒"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            {/* 提醒名称 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">名称</span>
              <Input value={form.name} onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))} placeholder="请输入提醒名称" />
            </div>

            {/* 账号角色 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">角色</span>
              <SelectDropdown
                value={form.account_role}
                options={[{value: "全部", label: "全部"}, ...roles.map(r => ({value: r, label: r}))]}
                placeholder="全部"
                onChange={(v) => setForm(prev => ({ ...prev, account_role: v }))}
              />
            </div>

            {/* 账号 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">账号</span>
              <SelectDropdown
                value={form.account_id}
                options={[{value: "全部", label: "全部"}, ...accounts.map(a => ({value: a.id, label: a.username}))]}
                placeholder="全部"
                onChange={(v) => setForm(prev => ({ ...prev, account_id: v }))}
              />
            </div>

            {/* 条件列表 */}
            <div className="grid grid-cols-[70px_1fr] items-start gap-2">
              <div className="flex items-center justify-end h-7">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">条件</span>
              </div>
              <div className="space-y-2">
                {/* 标题行：满足所有条件 + 添加条件 */}
                <div className="flex items-center justify-between">
                  <SelectDropdown
                    value={form.condition_logic}
                    options={[{value: "all", label: "满足所有条件"}, {value: "any", label: "满足任一条件"}]}
                    onChange={(v) => setForm(prev => ({ ...prev, condition_logic: v as "all" | "any" }))}
                    size="sm"
                  />
                  <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={addCondition}>
                    <Plus className="mr-1 h-3 w-3" /> 添加条件
                  </Button>
                </div>
                {/* 条件外框 */}
                <div className="border rounded-md divide-y">
                  {form.conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2 px-3 py-2">
                      {/* 条件类型 */}
                      <SelectDropdown
                        value={cond.type}
                        options={CONDITION_TYPE_OPTIONS}
                        onChange={(v) => {
                          const type = v as ReminderCondition["type"]
                          updateCondition(idx, {
                            type,
                            mode: type === "activity" ? "participation_count" : "fixed_cycle",
                            operator: "",
                            value: 0,
                            activity_type: "",
                          })
                        }}
                        size="sm"
                      />

                      {/* 条件详情 - 同一行内横向展开 */}
                      {cond.type === "acquaintance_date" && (
                        <>
                          <SelectDropdown
                            value={cond.mode}
                            options={[{value: "fixed_cycle", label: "按固定周期"}, {value: "relative", label: "按天"}]}
                            onChange={(v) => updateCondition(idx, { mode: v as "fixed_cycle" | "relative", operator: "", value: 0 })}
                            size="sm"
                          />
                          {cond.mode === "relative" && (
                            <SelectDropdown
                              value={cond.operator}
                              options={OPERATOR_OPTIONS}
                              onChange={(v) => updateCondition(idx, { operator: v as ReminderCondition["operator"] })}
                              size="sm"
                            />
                          )}
                          <Input
                            type="number"
                            value={cond.value || ""}
                            onChange={(e) => updateCondition(idx, { value: Number(e.target.value) })}
                            className="h-7 w-16 text-[11px]"
                            placeholder="天数"
                          />
                          <span className="text-[11px] text-[#8f959e]">天</span>
                        </>
                      )}

                      {cond.type === "visit_count" && (
                        <>
                          <SelectDropdown
                            value={cond.mode}
                            options={[{value: "fixed_cycle", label: "按固定周期"}, {value: "relative", label: "按天"}]}
                            onChange={(v) => updateCondition(idx, { mode: v as "fixed_cycle" | "relative", operator: "", value: 0 })}
                            size="sm"
                          />
                          {cond.mode === "relative" && (
                            <SelectDropdown
                              value={cond.operator}
                              options={OPERATOR_OPTIONS}
                              onChange={(v) => updateCondition(idx, { operator: v as ReminderCondition["operator"] })}
                              size="sm"
                            />
                          )}
                          <Input
                            type="number"
                            value={cond.value || ""}
                            onChange={(e) => updateCondition(idx, { value: Number(e.target.value) })}
                            className="h-7 w-16 text-[11px]"
                            placeholder="次数"
                          />
                          <span className="text-[11px] text-[#8f959e]">次</span>
                        </>
                      )}

                      {cond.type === "activity" && (
                        <>
                          <SelectDropdown
                            value={cond.activity_type}
                            options={[{value: "", label: "选择活动"}, ...ACTIVITY_TYPE_OPTIONS]}
                            placeholder="选择活动"
                            onChange={(v) => updateCondition(idx, { activity_type: v as ReminderCondition["activity_type"] })}
                            size="sm"
                          />
                          <SelectDropdown
                            value={cond.mode}
                            options={[{value: "participation_count", label: "参与次数"}, {value: "remaining_count", label: "剩余次数"}]}
                            onChange={(v) => updateCondition(idx, { mode: v as "participation_count" | "remaining_count", operator: "", value: 0 })}
                            size="sm"
                          />
                          <SelectDropdown
                            value={cond.operator}
                            options={OPERATOR_OPTIONS}
                            onChange={(v) => updateCondition(idx, { operator: v as ReminderCondition["operator"] })}
                            size="sm"
                          />
                          <Input
                            type="number"
                            value={cond.value || ""}
                            onChange={(e) => updateCondition(idx, { value: Number(e.target.value) })}
                            className="h-7 w-16 text-[11px]"
                            placeholder="次数"
                          />
                          <span className="text-[11px] text-[#8f959e]">次</span>
                        </>
                      )}

                      {/* 删除按钮 */}
                      {form.conditions.length > 1 && (
                        <button className="text-[#8f959e] hover:text-red-500 cursor-pointer ml-auto" onClick={() => removeCondition(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 提醒方式 */}
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">方式</span>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked readOnly className="accent-[#3370ff]" />
                <span className="text-[12px] text-[#2b2f36]">触发后提醒一次</span>
              </label>
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除提醒</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingItem?.name}」吗？此操作不可撤销。
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
