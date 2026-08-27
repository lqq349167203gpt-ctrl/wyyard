import { useEffect, useRef, useState } from "react"
import { Edit, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { positionApi, positionPermissionApi, accountApi } from "@/lib/api"
import type { Position, Account, PositionEditPermissions, PositionEditScope } from "@/lib/api"
import { normalizePagePermissions, removePagePermissions } from "@/lib/page-permissions"
import { storePagePermissions } from "@/hooks/use-page-permissions"
import { storeEditPermissions } from "@/hooks/use-edit-permissions"
import { AccountsContent } from "@/pages/accounts"

const ALL_PAGES = [
  // 数据
  { key: "custom-analysis", label: "自定义筛选" },
  { key: "referral-statistics", label: "引流统计" },
  { key: "member-statistics", label: "会员情况" },
  { key: "course-statistics", label: "课程" },
  { key: "product-sales", label: "产品销售" },
  { key: "statistics", label: "服务数据" },
  { key: "financial-overview", label: "财务数据" },
  // 报表
  { key: "daily-report", label: "每日报表" },
  // 业务
  { key: "healing-records", label: "客户资料" },
  { key: "class-records", label: "邀约" },
  { key: "daily-activities", label: "课表" },
  { key: "offline-course-records", label: "落地课程" },
  // 沟通
  { key: "communication-records", label: "沟通记录" },
  { key: "followup-records", label: "回访记录" },
  // 付费
  { key: "payment", label: "付费项目" },
  { key: "payment-deductions", label: "销卡" },
  { key: "payment-refunds", label: "退费" },
  { key: "expenses", label: "支出项" },
  { key: "debt-records", label: "欠卡记录" },
  // 信息配置
  { key: "member-identities", label: "会员身份" },
  { key: "customer-tags", label: "客户标签" },
  { key: "healing-identities", label: "疗愈老师" },
  { key: "organizations", label: "组织信息" },
  { key: "spaces", label: "空间配置" },
  // 账号管理
  { key: "position-management", label: "账号管理" },
  { key: "change-password", label: "密码修改" },
  { key: "disabled-customers", label: "停用客户" },
  // 系统配置
  { key: "agents", label: "AI 配置" },
  { key: "chat-history", label: "沟通记录" },
  { key: "system-logs", label: "系统日志" },
  { key: "operation-logs", label: "操作日志" },
  { key: "login-records", label: "使用统计" },
  { key: "analysis-logs", label: "分析日志" },
  // 茶客业务
  { key: "tea-guest-consumption-records", label: "消费记录" },
  { key: "tea-guest-expenses", label: "支出" },
]

const PERMISSION_GROUPS = [
  { label: "数据", keys: ["custom-analysis", "referral-statistics", "member-statistics", "course-statistics", "product-sales", "statistics"] },
  { label: "报表", keys: ["financial-overview", "daily-report"] },
  { label: "业务", keys: ["healing-records", "class-records", "daily-activities", "offline-course-records"] },
  { label: "沟通", keys: ["communication-records", "followup-records"] },
  { label: "付费", keys: ["payment", "payment-deductions", "payment-refunds", "debt-records"] },
  { label: "支出", keys: ["expenses"] },
  { label: "信息配置", keys: ["member-identities", "customer-tags", "healing-identities", "organizations", "spaces"] },
  { label: "账号管理", keys: ["position-management", "change-password", "disabled-customers"] },
  { label: "系统", keys: ["agents", "chat-history", "system-logs", "operation-logs", "login-records", "analysis-logs"] },
  { label: "茶客业务", keys: ["tea-guest-consumption-records", "tea-guest-expenses"] },
]

const DEFAULT_EDIT_PERMISSIONS: PositionEditPermissions = {
  visits: "own",
  activities: "own",
}

export default function PositionManagementPage() {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("tab_position-management") || "accounts" } catch { return "accounts" }
  })

  const handleTabChange = (key: string) => {
    setActiveTab(key)
    try { localStorage.setItem("tab_position-management", key) } catch {}
    if (key === "roles" && !selectedPositionId && positions.length > 0) {
      setSelectedPositionId(positions[0].id)
    }
  }
  const [positions, setPositions] = useState<Position[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [editPermissions, setEditPermissions] = useState<Record<string, PositionEditPermissions>>({})
  const [loading, setLoading] = useState(true)

  // 左侧选中
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(() => {
    try { return localStorage.getItem("selectedPositionId") || null } catch { return null }
  })
  // 权限 Tab 切换
  const [permTab, setPermTab] = useState<"page" | "edit">("page")

  // 权限编辑状态
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [formEditPermissions, setFormEditPermissions] = useState<PositionEditPermissions>(DEFAULT_EDIT_PERMISSIONS)
  const [saving, setSaving] = useState(false)

  // 新增角色 Dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")

  // 保存结果 Dialog
  const [saveResultOpen, setSaveResultOpen] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string }>({ success: true, message: "" })

  // 删除确认 Dialog
  const [deletePosition, setDeletePosition] = useState<Position | null>(null)
  const [deleteConfirmName, setDeleteConfirmName] = useState("")
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  const [editName, setEditName] = useState("")
  const [deleting, setDeleting] = useState(false)

  const loadData = async () => {
    try {
      const [p, a, perm, editPerm] = await Promise.all([
        positionApi.list(),
        accountApi.list(),
        positionPermissionApi.getAll(),
        positionPermissionApi.getEditPermissions(),
      ])
      setPositions(p)
      setAccounts(a)
      setPermissions(perm)
      setEditPermissions(editPerm)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // 持久化选中角色
  useEffect(() => {
    if (selectedPositionId) {
      try { localStorage.setItem("selectedPositionId", selectedPositionId) } catch {}
    }
  }, [selectedPositionId])

  // 选中角色变化时，加载权限到 form 状态
  const lastLoadedPositionId = useRef<string | null>(selectedPositionId)
  useEffect(() => {
    if (!selectedPositionId) {
      lastLoadedPositionId.current = null
      return
    }
    const pos = positions.find(p => p.id === selectedPositionId)
    if (!pos) return
    setFormPermissions(
      pos.name === "超级管理员"
        ? ALL_PAGES.map(page => page.key)
        : normalizePagePermissions(permissions[pos.name] || [])
    )
    setFormEditPermissions(
      pos.name === "超级管理员"
        ? { visits: "all", activities: "all" }
        : editPermissions[pos.name] || DEFAULT_EDIT_PERMISSIONS
    )
    // 仅当角色真正切换时才重置 permTab，避免保存后 loadData 刷新把用户拉回"页面权限"
    if (lastLoadedPositionId.current !== selectedPositionId) {
      lastLoadedPositionId.current = selectedPositionId
      setPermTab("page")
    }
  }, [selectedPositionId, positions, permissions, editPermissions])

  const selectedPosition = positions.find(p => p.id === selectedPositionId) || null
  const isSystemRole = selectedPosition?.is_system || false

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => a.role === positionName).length
  }

  const handleTogglePermission = (pageKey: string) => {
    if (isSystemRole) return
    setFormPermissions(prev => {
      const next = prev.includes(pageKey) ? removePagePermissions(prev, [pageKey]) : [...prev, pageKey]
      if (!next.includes(pageKey)) {
        if (pageKey === "class-records") {
          setFormEditPermissions(current => ({ ...current, visits: "own" }))
        }
        if (pageKey === "daily-activities") {
          setFormEditPermissions(current => ({ ...current, activities: "own" }))
        }
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    const created = await positionApi.create({ name: formName.trim(), description: formDescription })
    await positionPermissionApi.setFull(
      created.name,
      ALL_PAGES.map(p => p.key),
      DEFAULT_EDIT_PERMISSIONS
    )
    setCreateDialogOpen(false)
    setFormName("")
    setFormDescription("")
    await loadData()
    setSelectedPositionId(created.id)
  }

  const handleEditName = async () => {
    if (!editingPosition || !editName.trim()) return
    try {
      await positionApi.update(editingPosition.id, { name: editName.trim() })
      setEditingPosition(null)
      setEditName("")
      await loadData()
    } catch (e: any) {
      alert(e?.message || "修改失败")
    }
  }

  const handleSave = async () => {
    if (!selectedPosition || isSystemRole || saving) return
    setSaving(true)
    try {
      await positionPermissionApi.setFull(
        selectedPosition.name,
        formPermissions,
        formEditPermissions
      )
      try {
        const currentRole = JSON.parse(localStorage.getItem("currentUser") || "{}").role
        if (currentRole === selectedPosition.name) {
          storePagePermissions(formPermissions)
          storeEditPermissions(formEditPermissions)
        }
      } catch {}
      setSaveResult({ success: true, message: "权限保存成功" })
      // 保存后立即重新拉取最新数据，确保切角色回来后 UI 状态正确
      await loadData()
    } catch (e: any) {
      setSaveResult({ success: false, message: e?.message || "保存失败" })
    } finally {
      setSaving(false)
      setSaveResultOpen(true)
    }
  }

  const handleDelete = async () => {
    if (!deletePosition || deleting) return
    setDeleting(true)
    try {
      await positionApi.delete(deletePosition.id)
      if (selectedPositionId === deletePosition.id) {
        setSelectedPositionId(null)
      }
      setDeletePosition(null)
      setDeleteConfirmName("")
      loadData()
    } catch (e: any) {
      console.error("删除失败:", e?.message || e)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="px-6 pt-4 pb-6 space-y-3">
      {/* Tab 切换 */}
      <div className="flex items-center border-b-[0.5px] border-[#e8e8e8] -mx-6 px-6 min-h-[39px]">
        <div className="flex items-center gap-6">
          {[
            { key: "accounts", label: "账号管理" },
            { key: "roles", label: "角色权限" },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`relative px-1 pb-2 text-[14px] transition-colors ${
                activeTab === tab.key
                  ? "text-[#3370ff]"
                  : "text-[#2b2f36] hover:text-[#4e535a]"
              }`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              {activeTab === tab.key && (
                <span className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-[#3370ff] rounded-t-sm" />
              )}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "accounts" && <AccountsContent embedded />}

      {activeTab === "roles" && (
        <div className="flex gap-4" style={{ height: 'calc(100vh - 180px)' }}>
          {/* 左侧面板 */}
          <div className="w-[234px] bg-white rounded-lg flex flex-col shrink-0">
            <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
              <span className="text-[13px] font-medium text-[#2b2f36]">角色列表</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-[#3370ff] hover:text-[#3370ff] hover:bg-[#f0f5ff]" onClick={() => setCreateDialogOpen(true)}>
                新增
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">加载中...</div>
              ) : positions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">暂无角色</div>
              ) : (
                positions.map((pos) => {
                  const isSelected = selectedPositionId === pos.id
                  return (
                    <div
                      key={pos.id}
                      className={`flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors group ${
                        isSelected ? "bg-[#f0f5ff] text-[#3370ff]" : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                      }`}
                      onClick={() => setSelectedPositionId(pos.id)}
                    >
                      <span className="text-[13px] truncate">{pos.name}</span>
                      <div className="flex items-center gap-1">
                        {!pos.is_system && (
                          <>
                            <button
                              className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                              onClick={(e) => { e.stopPropagation(); setEditingPosition(pos); setEditName(pos.name) }}
                            >
                              <Edit className="h-3 w-3" />
                            </button>
                            <button
                              className="h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-[#f0f0f0] transition-all"
                              onClick={(e) => { e.stopPropagation(); setDeletePosition(pos); setDeleteConfirmName("") }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </>
                        )}
                        <span className={`text-[11px] ${isSelected ? "text-[#3370ff]/70" : "text-[#8f959e]"}`}>
                          {getPersonCount(pos.name)}人
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 右侧面板 */}
          <div className="flex-1 bg-white rounded-lg flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 h-11 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-6">
                <button
                  className={`relative px-1 pb-0.5 text-[13px] transition-colors ${permTab === "page" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
                  onClick={() => setPermTab("page")}
                >
                  页面权限
                  {permTab === "page" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3370ff] rounded-t-sm" />}
                </button>
                <button
                  className={`relative px-1 pb-0.5 text-[13px] transition-colors ${permTab === "edit" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
                  onClick={() => setPermTab("edit")}
                >
                  信息编辑
                  {permTab === "edit" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3370ff] rounded-t-sm" />}
                </button>
                {selectedPosition && isSystemRole && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-[#f0f1f2] text-[#8f959e]">系统角色</span>
                )}
              </div>
              {selectedPosition && !isSystemRole && (
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? "保存中..." : "保存"}
                </Button>
              )}
            </div>
            {!selectedPosition ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">请从左侧选择角色</p>
                  <p className="text-xs text-muted-foreground mt-1">选择后可配置页面权限和信息编辑范围</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* 页面权限 */}
                  {permTab === "page" && <div>
                    {PERMISSION_GROUPS.map((group) => {
                      const checkedCount = group.keys.filter(k => formPermissions.includes(k)).length
                      return (
                        <div key={group.label} className="mb-4">
                          <div className="flex items-center justify-between px-3 py-2 bg-[#f7f8fa] rounded-md mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] font-medium text-[#2b2f36]">{group.label}</span>
                              <span className="text-[11px] text-[#8f959e]">({checkedCount}/{group.keys.length})</span>
                            </div>
                            {!isSystemRole && (
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={group.keys.every(k => formPermissions.includes(k))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormPermissions(prev => [...new Set([...prev, ...group.keys])])
                                    } else {
                                      setFormPermissions(prev => removePagePermissions(prev, group.keys))
                                      if (group.keys.includes("class-records")) {
                                        setFormEditPermissions(current => ({ ...current, visits: "own" }))
                                      }
                                      if (group.keys.includes("daily-activities")) {
                                        setFormEditPermissions(current => ({ ...current, activities: "own" }))
                                      }
                                    }
                                  }}
                                  className="rounded"
                                />
                                <span className="text-[11px] text-[#8f959e]">全选</span>
                              </label>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3">
                            {group.keys.map((key) => {
                              const page = ALL_PAGES.find(p => p.key === key)
                              return (
                                <label key={key} className={`flex items-center gap-3 py-1.5 rounded ${isSystemRole ? "" : "hover:bg-[#fafbfc] cursor-pointer"}`}>
                                  <input
                                    type="checkbox"
                                    checked={formPermissions.includes(key)}
                                    onChange={() => handleTogglePermission(key)}
                                    disabled={isSystemRole}
                                    className="rounded"
                                  />
                                  <span className="text-[13px] text-[#2b2b2b]">{page?.label || key}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>}

                  {permTab === "edit" && (
                    <div className="max-w-[720px]">
                      <p className="mb-4 text-[12px] text-[#8f959e]">
                        “全部记录”允许该角色修改他人录入的受保护信息；未开放时仍按创建人规则处理。
                      </p>
                      <div className="divide-y divide-[#f0f0f0] border-y border-[#f0f0f0]">
                        {([
                          {
                            key: "visits" as const,
                            pageKey: "class-records",
                            label: "邀约",
                            description: "邀约人、时间、来访需求、取消及删除",
                          },
                          {
                            key: "activities" as const,
                            pageKey: "daily-activities",
                            label: "课表",
                            description: "课程、老师、时间、扣卡、案主、简介及删除",
                          },
                        ]).map((item) => {
                          const pageEnabled = formPermissions.includes(item.pageKey)
                          return (
                            <div key={item.key} className="flex items-center justify-between gap-6 px-3 py-4">
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-[#2b2f36]">{item.label}</div>
                                <div className="mt-1 text-[12px] text-[#8f959e]">{item.description}</div>
                                {!pageEnabled && (
                                  <div className="mt-1 text-[11px] text-[#c9cdd4]">请先开启“{item.label}”页面权限</div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                                {([
                                  { value: "own" as PositionEditScope, label: "仅本人录入" },
                                  { value: "all" as PositionEditScope, label: "全部记录" },
                                ]).map((option) => {
                                  const selected = formEditPermissions[item.key] === option.value
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      disabled={isSystemRole || !pageEnabled}
                                      onClick={() => setFormEditPermissions(current => ({ ...current, [item.key]: option.value }))}
                                      className={`h-7 rounded-[3px] px-3 text-[12px] transition-colors disabled:cursor-default ${
                                        selected
                                          ? "bg-[#1f2329] text-white"
                                          : "text-[#646a73] hover:bg-[#f5f6f7] disabled:text-[#c9cdd4] disabled:hover:bg-transparent"
                                      }`}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-3 text-[11px] text-[#8f959e]">
                        客户信息和跟进点仍按每条内容的填写人分别控制，不受此设置影响。
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 新增角色 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">新增角色</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">名称</span>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="输入角色名称" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">简介</span>
              <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="输入角色简介（可选）" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t">
            <Button variant="outline" size="sm" onClick={() => setCreateDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleCreate} disabled={!formName.trim()}>创建</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 编辑角色名称 Dialog */}
      <Dialog open={!!editingPosition} onOpenChange={(open) => { if (!open) { setEditingPosition(null); setEditName("") } }}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">编辑角色名称</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-[12px] text-[#4e535a] font-light text-right tracking-widest">名称</span>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="输入角色名称" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t">
            <Button variant="outline" size="sm" onClick={() => { setEditingPosition(null); setEditName("") }}>取消</Button>
            <Button size="sm" onClick={handleEditName} disabled={!editName.trim()}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 保存结果 Dialog */}
      <Dialog open={saveResultOpen} onOpenChange={setSaveResultOpen}>
        <DialogContent className="max-w-xs p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{saveResult.success ? "保存成功" : "保存失败"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <p className="text-[13px] text-[#2b2f36]">{saveResult.message}</p>
          </div>
          <div className="flex justify-end px-5 py-3 border-t">
            <Button size="sm" onClick={() => setSaveResultOpen(false)}>确定</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 Dialog */}
      <AlertDialog open={!!deletePosition} onOpenChange={() => { setDeletePosition(null); setDeleteConfirmName("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除角色</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletePosition?.name}」吗？该角色下的人员不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <label className="text-xs text-muted-foreground mb-1 block">请输入角色名称确认删除</label>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={deletePosition?.name}
              className="h-8"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteConfirmName !== deletePosition?.name || deleting}
            >
              {deleting ? "删除中..." : "确定删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
