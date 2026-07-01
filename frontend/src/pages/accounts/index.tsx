import { useEffect, useState } from "react"
import { useEnterToNext } from "@/hooks/use-enter-to-next"
import { Plus, Edit, Trash2, KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { accountApi, positionApi, customerApi } from "@/lib/api"
import type { Account, AccountCreate, Position, Customer } from "@/lib/api"
import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"

export function AccountsContent({ embedded }: { embedded?: boolean } = {}) {
  const enterToNext = useEnterToNext()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountCreate>({ owner: "", role: "", username: "", password: "", enabled: true })
  const [isEditingSystem, setIsEditingSystem] = useState(false)
  const [formErrors, setFormErrors] = useState<{ owner?: string; role?: string; username?: string; password?: string }>({})
  const [customerList, setCustomerList] = useState<Customer[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [changePwdId, setChangePwdId] = useState<string | null>(null)
  const [changePwdForm, setChangePwdForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" })
  const [changePwdErrors, setChangePwdErrors] = useState<{ old?: string; new?: string; confirm?: string }>({})
  const [changePwdSaving, setChangePwdSaving] = useState(false)

  useEffect(() => { loadData(); customerApi.list().then(setCustomerList).catch(() => {}) }, [])

  const loadData = async () => {
    const [a, p] = await Promise.all([accountApi.list(), positionApi.list()])
    setAccounts(a)
    setPositions(p)
  }

  const handleSave = async () => {
    const errors: { owner?: string; role?: string; username?: string; password?: string } = {}

    // 必填验证
    if (!form.owner.trim()) errors.owner = "归属人不能为空"
    else if (!customerList.some(c => c.nickname === form.owner.trim())) errors.owner = "归属人必须是客户列表中的昵称"
    if (!form.role.trim()) errors.role = "角色不能为空"
    if (!form.username.trim()) errors.username = "账号不能为空"
    if (!editingId) {
      if (!form.password.trim()) errors.password = "密码不能为空"
      else if (form.password.length < 8) errors.password = "密码至少8位"
      else if (!/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) errors.password = "密码必须包含字母和数字"
    }

    // 唯一性验证
    if (form.owner.trim() && accounts.some(a => a.id !== editingId && a.owner === form.owner.trim())) {
      errors.owner = "归属人已存在"
    }
    if (form.username.trim() && accounts.some(a => a.id !== editingId && a.username === form.username.trim())) {
      errors.username = "账号已存在"
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})
    setSaving(true)
    try {
      if (editingId) {
        const { password, ...updateData } = form
        await accountApi.update(editingId, updateData)
      } else {
        await accountApi.create(form)
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ owner: "", role: "", username: "", password: "", enabled: true })
      loadData()
    } catch (error: any) {
      const message = error.message || "操作失败"
      if (message.includes("归属人")) {
        setFormErrors({ owner: message })
      } else if (message.includes("账号")) {
        setFormErrors({ username: message })
      }
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (a: Account) => {
    setEditingId(a.id)
    setIsEditingSystem(!!a.is_system)
    setForm({ owner: a.owner, role: a.role, username: a.username, password: "", enabled: a.enabled })
    setFormErrors({})
    setShowForm(true)
  }

  const currentUser = (() => { try { return JSON.parse(localStorage.getItem("currentUser") || "{}") } catch { return {} } })()

  const handleDelete = async () => {
    if (!deleteId || deleting) return
    if (deleteId === currentUser.id) {
      alert("不能删除当前登录的账号")
      setDeleteId(null)
      return
    }
    setDeleting(true)
    try {
      await accountApi.delete(deleteId)
      setDeleteId(null)
      loadData()
    } catch (e: any) {
      console.error("删除失败:", e?.message || e)
    } finally {
      setDeleting(false)
    }
  }

  const handleSavePassword = async () => {
    const errors: { old?: string; new?: string; confirm?: string } = {}
    if (!changePwdForm.oldPassword) errors.old = "请输入原密码"
    if (!changePwdForm.newPassword) errors.new = "请输入新密码"
    else if (changePwdForm.newPassword.length < 8) errors.new = "密码至少8位"
    else if (!/[a-zA-Z]/.test(changePwdForm.newPassword) || !/[0-9]/.test(changePwdForm.newPassword)) errors.new = "密码必须包含字母和数字"
    if (changePwdForm.newPassword !== changePwdForm.confirmPassword) errors.confirm = "两次密码不一致"
    if (Object.keys(errors).length > 0) { setChangePwdErrors(errors); return }
    setChangePwdErrors({})
    setChangePwdSaving(true)
    try {
      await accountApi.changePassword(changePwdId!, changePwdForm.oldPassword, changePwdForm.newPassword)
      setChangePwdId(null)
      setChangePwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" })
    } catch (e: any) {
      setChangePwdErrors({ old: e.message || "修改失败" })
    } finally {
      setChangePwdSaving(false)
    }
  }

  const handleToggle = async (a: Account) => {
    if (togglingId) return
    setTogglingId(a.id)
    try {
      await accountApi.update(a.id, { enabled: !a.enabled })
      loadData()
    } catch (e: any) {
      console.error("切换状态失败:", e?.message || e)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className={embedded ? "space-y-3" : "px-6 pt-12 pb-6 space-y-3"}>
      {!embedded && (
        <div className="flex items-center justify-between pb-2">
          <div>
            <h1 className="text-lg font-semibold">账号管理</h1>
            <p className="text-xs text-muted-foreground mt-1.5">管理系统登录账号，角色从角色权限中选择</p>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingId(null); setIsEditingSystem(false); setForm({ owner: "", role: "", username: "", password: "", enabled: true }); setShowForm(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 新增账号
          </Button>
        </div>
      )}

      {embedded && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">管理系统登录账号，角色从角色权限中选择</span>
          <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingId(null); setIsEditingSystem(false); setForm({ owner: "", role: "", username: "", password: "", enabled: true }); setShowForm(true) }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 新增账号
          </Button>
        </div>
      )}

      <div className="bg-white rounded-lg">
        {accounts.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">暂无账号</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">归属人</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>账号</TableHead>
                <TableHead>创建日期</TableHead>
                <TableHead className="text-center">状态</TableHead>
                <TableHead className="text-right pr-4">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.id} className="group">
                  <TableCell className="pl-4">
                    <span className="text-[13px] text-[#2b2f36]">{a.owner}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#2b2f36]">{a.role}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[13px] text-[#4e535a]">{a.username}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-[12px] text-[#8f959e]">{new Date(a.created_at).toLocaleDateString("zh-CN")}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    {a.is_system ? (
                      <span className="text-[12px] px-2 py-0.5 rounded-full bg-green-50 text-green-600">永久</span>
                    ) : (
                      <button
                        className={`text-[12px] px-2 py-0.5 rounded-full ${a.enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"} ${togglingId === a.id ? "opacity-50" : ""}`}
                        onClick={() => handleToggle(a)}
                        disabled={togglingId === a.id}
                      >
                        {togglingId === a.id ? "切换中..." : (a.enabled ? "启用" : "禁用")}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(a)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setChangePwdId(a.id); setChangePwdForm({ oldPassword: "", newPassword: "", confirmPassword: "" }); setChangePwdErrors({}) }}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      {!a.is_system && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(a.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setFormErrors({}) } }}>
        <DialogContent className="w-[400px] max-w-[90vw] p-0 gap-0">
          <DialogHeader className="px-6 pt-3 pb-2 border-b border-[#f0f0f0]">
            <DialogTitle className="text-[14px] font-normal">{editingId ? "编辑账号" : "新增账号"}</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4" {...enterToNext}>
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">归属人</span>
              <div className="relative flex-1">
                <CustomerSearchInput
                  customers={customerList}
                  value={form.owner}
                  onChange={(val) => setForm({ ...form, owner: val as string })}
                  placeholder="输入昵称搜索..."
                  filterSelected={false}
                />
                {formErrors.owner && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.owner}</p>}
              </div>
            </div>
            {!isEditingSystem && (
              <div className="flex items-start gap-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">角色</span>
                <div className="relative flex-1">
                  <SelectDropdown
                    value={form.role}
                    options={[{ value: "超级管理员", label: "超级管理员" }, ...positions.map(p => ({ value: p.name, label: p.name }))]}
                    placeholder="选择角色"
                    onChange={(v) => setForm({ ...form, role: v })}
                  />
                  {formErrors.role && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.role}</p>}
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">账号</span>
              <div className="flex-1">
                <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="输入登录账号" className="h-8" />
                {formErrors.username && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.username}</p>}
              </div>
            </div>
            {!editingId && (
              <div className="flex items-start gap-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">密码</span>
                <div className="flex-1">
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少8位，包含字母和数字" className="h-8" />
                  {formErrors.password && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.password}</p>}
                </div>
              </div>
            )}
            {!isEditingSystem && (
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0">是否启用</span>
                <div className="relative flex-1">
                  <select className="w-full h-8 text-[12px] appearance-none border rounded pl-2 pr-7" value={form.enabled ? "true" : "false"} onChange={(e) => setForm({ ...form, enabled: e.target.value === "true" })}>
                    <option value="true">启用</option>
                    <option value="false">禁用</option>
                  </select>
                  <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8f959e] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-[#f0f0f0]">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setFormErrors({}) }}>取消</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除账号</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该账号吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>{deleting ? "删除中..." : "确定删除"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 修改密码弹窗 */}
      <Dialog open={!!changePwdId} onOpenChange={(open) => { if (!open) { setChangePwdId(null); setChangePwdErrors({}) } }}>
        <DialogContent className="w-[400px]">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">原密码</span>
              <div className="flex-1">
                <Input type="password" value={changePwdForm.oldPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, oldPassword: e.target.value })} placeholder="输入原密码" className="h-8" />
                {changePwdErrors.old && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{changePwdErrors.old}</p>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">新密码</span>
              <div className="flex-1">
                <Input type="password" value={changePwdForm.newPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, newPassword: e.target.value })} placeholder="至少8位，包含字母和数字" className="h-8" />
                {changePwdErrors.new && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{changePwdErrors.new}</p>}
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">确认密码</span>
              <div className="flex-1">
                <Input type="password" value={changePwdForm.confirmPassword} onChange={(e) => setChangePwdForm({ ...changePwdForm, confirmPassword: e.target.value })} placeholder="再次输入新密码" className="h-8" />
                {changePwdErrors.confirm && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{changePwdErrors.confirm}</p>}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setChangePwdId(null); setChangePwdErrors({}) }}>取消</Button>
            <Button size="sm" onClick={handleSavePassword} disabled={changePwdSaving}>{changePwdSaving ? "保存中..." : "确认修改"}</Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  )
}
