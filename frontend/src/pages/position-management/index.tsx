import { useEffect, useState } from "react"
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
import { positionApi, positionPermissionApi, memberIdentityApi, accountApi } from "@/lib/api"
import type { Position, Account } from "@/lib/api"
import { AccountsContent } from "@/pages/accounts"

const ALL_PAGES = [
  // 业务数据
  { key: "business-reminders", label: "业务提醒" },
  { key: "traffic-records", label: "引流记录" },
  { key: "activity-records", label: "活动记录" },
  { key: "consumption-records", label: "消费记录" },
  { key: "class-attendance", label: "上课记录" },
  // 疗愈活动
  { key: "healing-records", label: "客户信息" },
  { key: "class-records", label: "人员安排" },
  { key: "daily-activities", label: "活动安排" },
  // 付费项目
  { key: "payment", label: "付费项目" },
  { key: "membership-cards", label: "会员卡" },
  { key: "group-cases", label: "觉醒游戏" },
  { key: "group-case-sessions", label: "觉醒游戏场次" },
  { key: "emotional-releases", label: "情绪释放" },
  { key: "emotional-release-sessions", label: "情绪释放场次" },
  { key: "oh-card-readings", label: "OH卡梳理" },
  { key: "energy-knots", label: "能量结" },
  { key: "energy-knot-sessions", label: "能量结场次" },
  { key: "internal-courses", label: "内部课程" },
  { key: "internal-course-sessions", label: "内部课程场次" },
  { key: "other-projects", label: "其他项目" },
  // 信息配置
  { key: "member-identities", label: "会员身份" },
  { key: "healing-identities", label: "疗愈老师" },
  { key: "organizations", label: "组织管理" },
  { key: "spaces", label: "空间配置" },
  { key: "reminders", label: "提醒配置" },
  // 账号管理
  { key: "position-management", label: "账号管理" },
  { key: "change-password", label: "密码修改" },
  // 系统配置
  { key: "agents", label: "AI 配置" },
  { key: "chat-history", label: "沟通记录" },
  { key: "system-logs", label: "系统日志" },
  { key: "operation-logs", label: "操作日志" },
]

const PERMISSION_GROUPS = [
  { label: "业务数据", keys: ["business-reminders", "traffic-records", "activity-records", "consumption-records", "class-attendance"] },
  { label: "疗愈活动", keys: ["healing-records", "class-records", "daily-activities"] },
  { label: "付费项目", keys: ["payment", "membership-cards", "group-cases", "group-case-sessions", "emotional-releases", "emotional-release-sessions", "oh-card-readings", "energy-knots", "energy-knot-sessions", "internal-courses", "internal-course-sessions", "other-projects"] },
  { label: "信息配置", keys: ["member-identities", "healing-identities", "organizations", "spaces", "reminders"] },
  { label: "账号管理", keys: ["position-management", "change-password"] },
  { label: "系统配置", keys: ["agents", "chat-history", "system-logs", "operation-logs"] },
]

const CUSTOMER_FILTER_PAGES = [
  "healing-records", "consumption-records",
]

export default function PositionManagementPage() {
  const [activeTab, setActiveTab] = useState("accounts")
  const [positions, setPositions] = useState<Position[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [pagePermissions, setPagePermissions] = useState<Record<string, Record<string, string[]>>>({})
  const [memberIdentityNames, setMemberIdentityNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // 左侧选中
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null)
  // 权限 Tab 切换
  const [permTab, setPermTab] = useState<"page" | "customer">("page")

  // 权限编辑状态
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [formPagePermissions, setFormPagePermissions] = useState<Record<string, string[]>>({})
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
      const [p, a, perm, pagePerm, identities] = await Promise.all([
        positionApi.list(),
        accountApi.list(),
        positionPermissionApi.getAll(),
        positionPermissionApi.getPagePermissions(),
        memberIdentityApi.list(),
      ])
      setPositions(p)
      setAccounts(a)
      setPermissions(perm)
      setPagePermissions(pagePerm)
      setMemberIdentityNames(identities.map(i => i.name))
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // 选中角色变化时，加载权限到 form 状态
  useEffect(() => {
    if (!selectedPositionId) return
    const pos = positions.find(p => p.id === selectedPositionId)
    if (!pos) return
    setFormPermissions(permissions[pos.name] || [])
    // 加载按页面存储的权限
    const pagePerms: Record<string, string[]> = {}
    CUSTOMER_FILTER_PAGES.forEach(pageKey => {
      pagePerms[pageKey] = pagePermissions[pageKey]?.[pos.name] || []
    })
    setFormPagePermissions(pagePerms)
    setPermTab("page")
  }, [selectedPositionId, positions, permissions, pagePermissions])

  const selectedPosition = positions.find(p => p.id === selectedPositionId) || null
  const isSystemRole = selectedPosition?.is_system || false

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => a.role === positionName).length
  }

  const autoFillPagePerms = (pageKey: string) => {
    if (!formPagePermissions[pageKey] || formPagePermissions[pageKey].length === 0) {
      setFormPagePermissions(prev => ({ ...prev, [pageKey]: [...memberIdentityNames] }))
    }
  }

  const handleTogglePermission = (pageKey: string) => {
    if (isSystemRole) return
    setFormPermissions(prev => {
      const next = prev.includes(pageKey) ? prev.filter(k => k !== pageKey) : [...prev, pageKey]
      if (next.includes(pageKey) && CUSTOMER_FILTER_PAGES.includes(pageKey)) {
        autoFillPagePerms(pageKey)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!formName.trim()) return
    const created = await positionApi.create({ name: formName.trim(), description: formDescription })
    // 给新角色设置全选权限
    const pagePerms: Record<string, string[]> = {}
    CUSTOMER_FILTER_PAGES.forEach(pageKey => {
      pagePerms[pageKey] = [...memberIdentityNames]
    })
    await positionPermissionApi.setFull(
      created.name,
      ALL_PAGES.map(p => p.key),
      [], [], [],
      pagePerms
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
        formPagePermissions["healing-records"] || [],
        formPagePermissions["class-attendance"] || [],
        formPagePermissions["consumption-records"] || [],
        formPagePermissions
      )
      setSaveResult({ success: true, message: "权限保存成功" })
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
                  className={`relative px-1 pb-0.5 text-[13px] transition-colors ${permTab === "customer" ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
                  onClick={() => setPermTab("customer")}
                >
                  用户信息权限
                  {permTab === "customer" && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#3370ff] rounded-t-sm" />}
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
                  <p className="text-xs text-muted-foreground mt-1">选择后可编辑该角色的页面权限和用户信息权限</p>
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
                                      // 自动填充相关页面的用户信息权限
                                      group.keys.filter(k => CUSTOMER_FILTER_PAGES.includes(k)).forEach(k => autoFillPagePerms(k))
                                    } else {
                                      setFormPermissions(prev => prev.filter(k => !group.keys.includes(k)))
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

                  {/* 用户信息权限 */}
                  {permTab === "customer" && <div>
                    <div className="mb-3">
                      <span className="text-[12px] text-[#8f959e]">选择该角色有权限浏览的用户信息</span>
                    </div>
                    <div>
                      {CUSTOMER_FILTER_PAGES.map((pageKey) => {
                        const page = ALL_PAGES.find(p => p.key === pageKey)
                        if (!page) return null
                        // 只显示已启用页面权限的页面
                        if (!formPermissions.includes(pageKey)) return null

                        const perms = formPagePermissions[pageKey] || []
                        const checkedCount = memberIdentityNames.filter(n => perms.includes(n)).length

                        return (
                          <div key={pageKey} className="mb-4">
                            <div className="flex items-center justify-between px-3 py-2 bg-[#f7f8fa] rounded-md mb-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-medium text-[#2b2f36]">{page.label}</span>
                                <span className="text-[11px] text-[#8f959e]">({checkedCount}/{memberIdentityNames.length})</span>
                              </div>
                              {!isSystemRole && (
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={memberIdentityNames.length > 0 && memberIdentityNames.every(n => perms.includes(n))}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setFormPagePermissions(prev => ({ ...prev, [pageKey]: [...memberIdentityNames] }))
                                      } else {
                                        setFormPagePermissions(prev => ({ ...prev, [pageKey]: [] }))
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className="text-[11px] text-[#8f959e]">全选</span>
                                </label>
                              )}
                            </div>
                            <div className="px-3">
                              {memberIdentityNames.length === 0 ? (
                                <span className="text-[12px] text-[#b0b5bb]">暂无会员身份类型，请先在"会员身份"页面创建</span>
                              ) : (
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                  {memberIdentityNames.map((name) => (
                                    <label key={name} className={`flex items-center gap-3 py-1.5 rounded ${isSystemRole ? "" : "hover:bg-[#fafbfc] cursor-pointer"}`}>
                                      <input
                                        type="checkbox"
                                        checked={perms.includes(name)}
                                        onChange={() => {
                                          if (isSystemRole) return
                                          setFormPagePermissions(prev => ({
                                            ...prev,
                                            [pageKey]: prev[pageKey]?.includes(name)
                                              ? prev[pageKey].filter(n => n !== name)
                                              : [...(prev[pageKey] || []), name]
                                          }))
                                        }}
                                        disabled={isSystemRole}
                                        className="rounded"
                                      />
                                      <span className="text-[13px] text-[#2b2b2b]">{name}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {CUSTOMER_FILTER_PAGES.filter(k => formPermissions.includes(k)).length === 0 && (
                        <div className="text-center py-8 text-[12px] text-[#b0b5bb]">
                          请先在"页面权限"中启用相关页面
                        </div>
                      )}
                    </div>
                  </div>}
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
