import { useEffect, useState, useRef } from "react"
import { Plus, Edit, Trash2, X, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { accountApi, positionApi, visitApi } from "@/lib/api"
import type { Account, AccountCreate, Position, CustomerSearchResult } from "@/lib/api"

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [form, setForm] = useState<AccountCreate>({ owner: "", role: "", username: "", password: "", enabled: true })
  const [isEditingSystem, setIsEditingSystem] = useState(false)
  const [formErrors, setFormErrors] = useState<{ owner?: string; role?: string; username?: string; password?: string }>({})

  // 搜索归属人相关状态
  const [ownerSearch, setOwnerSearch] = useState("")
  const [ownerResults, setOwnerResults] = useState<CustomerSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false)
  const searchTimeoutRef = useRef<number | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowOwnerDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const loadData = async () => {
    const [a, p] = await Promise.all([accountApi.list(), positionApi.list()])
    setAccounts(a)
    setPositions(p)
  }

  const handleOwnerSearch = (keyword: string) => {
    setOwnerSearch(keyword)
    setForm({ ...form, owner: keyword })
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    if (!keyword.trim()) { setOwnerResults([]); setShowOwnerDropdown(false); return }
    searchTimeoutRef.current = window.setTimeout(async () => {
      setSearching(true)
      try {
        const results = await visitApi.searchCustomers(keyword)
        setOwnerResults(results)
        setShowOwnerDropdown(true)
      } catch { setOwnerResults([]) }
      finally { setSearching(false) }
    }, 300)
  }

  const handleSelectOwner = (customer: CustomerSearchResult) => {
    setForm({ ...form, owner: customer.nickname })
    setOwnerSearch(customer.nickname)
    setOwnerResults([])
    setShowOwnerDropdown(false)
  }

  const handleSave = async () => {
    const errors: { owner?: string; role?: string; username?: string; password?: string } = {}

    // 必填验证
    if (!form.owner.trim()) errors.owner = "归属人不能为空"
    if (!form.role.trim()) errors.role = "角色不能为空"
    if (!form.username.trim()) errors.username = "账号不能为空"
    if (!form.password.trim()) errors.password = "密码不能为空"

    // 唯一性验证（仅新增时）
    if (!editingId) {
      if (form.owner.trim() && accounts.some(a => a.owner === form.owner.trim())) {
        errors.owner = "归属人已存在"
      }
      if (form.username.trim() && accounts.some(a => a.username === form.username.trim())) {
        errors.username = "账号已存在"
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    setFormErrors({})
    try {
      if (editingId) {
        await accountApi.update(editingId, form)
      } else {
        await accountApi.create(form)
      }
      setShowForm(false)
      setEditingId(null)
      setForm({ owner: "", role: "", username: "", password: "", enabled: true })
      loadData()
    } catch (error: any) {
      // 处理后端返回的错误
      const message = error.message || "操作失败"
      if (message.includes("归属人")) {
        setFormErrors({ owner: message })
      } else if (message.includes("账号")) {
        setFormErrors({ username: message })
      }
    }
  }

  const handleEdit = (a: Account) => {
    setEditingId(a.id)
    setIsEditingSystem(!!a.is_system)
    setForm({ owner: a.owner, role: a.role, username: a.username, password: a.password, enabled: a.enabled })
    setOwnerSearch(a.owner)
    setShowForm(true)
  }

  const handleDelete = async () => {
    if (deleteId) {
      await accountApi.delete(deleteId)
      setDeleteId(null)
      loadData()
    }
  }

  const handleToggle = async (a: Account) => {
    await accountApi.update(a.id, { enabled: !a.enabled })
    loadData()
  }

  return (
    <div className="px-6 pt-12 pb-6 space-y-3">
      <div className="flex items-center justify-between pb-2">
        <div>
          <h1 className="text-lg font-semibold">账号管理</h1>
          <p className="text-xs text-muted-foreground mt-1.5">管理系统登录账号，角色从角色管理中选择</p>
        </div>
        <Button size="sm" className="h-8 text-xs" onClick={() => { setEditingId(null); setForm({ owner: "", role: "", username: "", password: "", enabled: true }); setOwnerSearch(""); setShowForm(true) }}>
          <Plus className="h-3.5 w-3.5 mr-1" /> 新增账号
        </Button>
      </div>

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
                        className={`text-[12px] px-2 py-0.5 rounded-full ${a.enabled ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}
                        onClick={() => handleToggle(a)}
                      >
                        {a.enabled ? "启用" : "禁用"}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleEdit(a)}>
                        <Edit className="h-3.5 w-3.5" />
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

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => { setShowForm(false); setFormErrors({}) }}>
          <div className="bg-white rounded-lg w-[400px] shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <span className="text-sm font-medium">{editingId ? "编辑账号" : "新增账号"}</span>
              <button onClick={() => { setShowForm(false); setFormErrors({}) }}><X className="h-4 w-4 text-[#8f959e]" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-start gap-3" ref={dropdownRef}>
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">归属人</span>
                <div className="relative flex-1">
                  <Input
                    value={ownerSearch}
                    onChange={(e) => handleOwnerSearch(e.target.value)}
                    placeholder="输入昵称或姓名搜索..."
                    className="h-8"
                    onFocus={() => ownerResults.length > 0 && setShowOwnerDropdown(true)}
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
                  {showOwnerDropdown && ownerResults.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm max-h-60 overflow-y-auto">
                      {ownerResults.map((customer) => (
                        <div key={customer.id} className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-muted" onClick={() => handleSelectOwner(customer)}>
                          <div className="flex items-center gap-2">
                            <span className="text-[12px] font-medium">{customer.nickname}</span>
                            {customer.name && customer.name !== customer.nickname && (
                              <span className="text-[11px] text-muted-foreground">({customer.name})</span>
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">{customer.member_type || "新人"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showOwnerDropdown && ownerResults.length === 0 && ownerSearch && !searching && (
                    <div className="absolute z-50 w-full mt-1 bg-white border rounded shadow-sm p-3 text-[12px] text-muted-foreground text-center">未找到匹配的用户</div>
                  )}
                  {formErrors.owner && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.owner}</p>}
                </div>
              </div>
              {!isEditingSystem && (
                <div className="flex items-start gap-3">
                  <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">角色</span>
                  <div className="relative flex-1">
                    <select className="w-full h-8 text-[12px] appearance-none border rounded pl-2 pr-7" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                      <option value="">选择角色</option>
                      {positions.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                    </select>
                    <svg className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8f959e] pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
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
              <div className="flex items-start gap-3">
                <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest w-16 shrink-0 pt-2">密码</span>
                <div className="flex-1">
                  <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="输入密码" className="h-8" />
                  {formErrors.password && <p className="text-[11px] text-red-500 mt-0.5 -mb-2">{formErrors.password}</p>}
                </div>
              </div>
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
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setFormErrors({}) }}>取消</Button>
              <Button size="sm" onClick={handleSave}>保存</Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除账号</AlertDialogTitle>
            <AlertDialogDescription>确定要删除该账号吗？此操作不可撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>确定删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}
