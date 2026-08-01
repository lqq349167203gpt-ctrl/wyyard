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
import { positionApi, positionPermissionApi, memberIdentityApi, accountApi } from "@/lib/api"
import type { Position, Account } from "@/lib/api"
import { normalizePagePermissions, removePagePermissions } from "@/lib/page-permissions"
import { AccountsContent } from "@/pages/accounts"

const ALL_PAGES = [
  // 数据
  { key: "business-reminders", label: "提醒" },
  { key: "referral-statistics", label: "引流统计" },
  { key: "member-statistics", label: "会员情况" },
  { key: "course-statistics", label: "课程" },
  { key: "product-sales", label: "产品销售" },
  { key: "statistics", label: "服务数据" },
  // 报表
  { key: "daily-report", label: "每日报表" },
  // 业务
  { key: "healing-records", label: "客户资料" },
  { key: "class-records", label: "邀约" },
  { key: "daily-activities", label: "课表" },
  { key: "communication-records", label: "沟通记录" },
  { key: "followup-records", label: "回访记录" },
  // 付费
  { key: "payment", label: "付费项目" },
  { key: "payment-deductions", label: "销卡" },
  { key: "payment-refunds", label: "退费" },
  // 信息配置
  { key: "member-identities", label: "会员身份" },
  { key: "healing-identities", label: "疗愈老师" },
  { key: "organizations", label: "组织信息" },
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
  { label: "数据", keys: ["business-reminders", "referral-statistics", "member-statistics", "course-statistics", "product-sales", "statistics"] },
  { label: "报表", keys: ["daily-report"] },
  { label: "业务", keys: ["healing-records", "class-records", "daily-activities", "communication-records", "followup-records"] },
  { label: "付费", keys: ["payment", "payment-deductions", "payment-refunds"] },
  { label: "信息配置", keys: ["member-identities", "healing-identities", "organizations", "spaces", "reminders"] },
  { label: "账号管理", keys: ["position-management", "change-password"] },
  { label: "系统配置", keys: ["agents", "chat-history", "system-logs", "operation-logs"] },
]

const CUSTOMER_FILTER_PAGES = [
  "healing-records",
  "class-records", "daily-activities",
  "payment", "payment-deductions", "payment-refunds",
]

const getSectionForPage = (pageKey: string): string | null => {
  if (pageKey === "healing-records") return "customers"
  if (["class-records", "daily-activities"].includes(pageKey)) return "class_records"
  if (["payment", "payment-deductions", "payment-refunds"].includes(pageKey)) return "payment"
  return null
}

// pageKey → 中文标签（用于"用户信息权限"分组渲染）
const PAGE_LABELS: Record<string, string> = {
  "healing-records": "客户资料",
  "class-records": "邀约",
  "daily-activities": "课表",
  payment: "付费项目",
  "payment-deductions": "销卡",
  "payment-refunds": "退费",
}

// 按 sidebar 顶层分组组织"用户信息权限"展示
const CUSTOMER_PERM_GROUPS = [
  {
    label: "业务",
    sections: [
      { section: "customers" as const, pages: ["healing-records"] },
      { section: "class_records" as const, pages: ["class-records", "daily-activities"] },
    ],
  },
  {
    label: "付费",
    sections: [
      { section: "payment" as const, pages: ["payment", "payment-deductions", "payment-refunds"] },
    ],
  },
]

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
  const [pagePermissions, setPagePermissions] = useState<Record<string, Record<string, string[]>>>({})
  const [memberIdentityNames, setMemberIdentityNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // 左侧选中
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(() => {
    try { return localStorage.getItem("selectedPositionId") || null } catch { return null }
  })
  // 权限 Tab 切换
  const [permTab, setPermTab] = useState<"page" | "customer">("page")

  // 权限编辑状态
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [formPagePermissions, setFormPagePermissions] = useState<Record<string, string[]>>({})
  const [formCustomerPermissions, setFormCustomerPermissions] = useState<string[]>([])
  const [formCustomerPermissionsCR, setFormCustomerPermissionsCR] = useState<string[]>([])
  const [formCustomerPermissionsPay, setFormCustomerPermissionsPay] = useState<string[]>([])
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
    setFormPermissions(normalizePagePermissions(permissions[pos.name] || []))
    // 加载按页面存储的权限
    const pagePerms: Record<string, string[]> = {}
    const legacyPageKeys: Record<string, string[]> = {
      "class-records": ["class-records-visitors", "class-records-activities", "class-records-arrival"],
      "daily-activities": ["class-records-activities"],
      payment: ["membership-cards", "group-cases", "emotional-releases", "oh-card-readings", "energy-knots", "internal-courses"],
      "payment-deductions": ["membership-cards", "group-cases", "emotional-releases", "oh-card-readings", "energy-knots", "internal-courses"],
      "payment-refunds": ["membership-cards", "group-cases", "emotional-releases", "oh-card-readings", "energy-knots", "internal-courses"],
    }
    CUSTOMER_FILTER_PAGES.forEach(pageKey => {
      const directPermissions = pagePermissions[pageKey]
      if (directPermissions && Object.prototype.hasOwnProperty.call(directPermissions, pos.name)) {
        pagePerms[pageKey] = directPermissions[pos.name] || []
        return
      }
      pagePerms[pageKey] = [
        ...new Set((legacyPageKeys[pageKey] || []).flatMap((legacyKey) => pagePermissions[legacyKey]?.[pos.name] || [])),
      ]
    })
    setFormPagePermissions(pagePerms)
    // 从 page_permissions 初始化 3 个 section state
    setFormCustomerPermissions(pagePerms["healing-records"] || [])
    setFormCustomerPermissionsCR([...new Set([
      ...(pagePerms["class-records"] || []),
      ...(pagePerms["daily-activities"] || []),
    ])])
    setFormCustomerPermissionsPay([...new Set([
      ...(pagePerms["payment"] || []),
      ...(pagePerms["payment-deductions"] || []),
      ...(pagePerms["payment-refunds"] || []),
    ])])
    // 仅当角色真正切换时才重置 permTab，避免保存后 loadData 刷新把用户拉回"页面权限"
    if (lastLoadedPositionId.current !== selectedPositionId) {
      lastLoadedPositionId.current = selectedPositionId
      setPermTab("page")
    }
  }, [selectedPositionId, positions, permissions, pagePermissions])

  const selectedPosition = positions.find(p => p.id === selectedPositionId) || null
  const isSystemRole = selectedPosition?.is_system || false

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => a.role === positionName).length
  }

  const autoFillPagePerms = (pageKey: string) => {
    if (!formPagePermissions[pageKey] || formPagePermissions[pageKey].length === 0) {
      setFormPagePermissions(prev => ({ ...prev, [pageKey]: [...memberIdentityNames] }))
      // 同步更新 section state
      const section = getSectionForPage(pageKey)
      if (section === "customers") setFormCustomerPermissions([...memberIdentityNames])
      else if (section === "class_records") setFormCustomerPermissionsCR(prev => [...new Set([...prev, ...memberIdentityNames])])
      else if (section === "payment") setFormCustomerPermissionsPay(prev => [...new Set([...prev, ...memberIdentityNames])])
    }
  }

  const handleTogglePermission = (pageKey: string) => {
    if (isSystemRole) return
    setFormPermissions(prev => {
      const next = prev.includes(pageKey) ? removePagePermissions(prev, [pageKey]) : [...prev, pageKey]
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
      [...memberIdentityNames],
      [...memberIdentityNames],
      [...memberIdentityNames],
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
        formCustomerPermissions,
        formCustomerPermissionsCR,
        formCustomerPermissionsPay,
        formPagePermissions
      )
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
                                      setFormPermissions(prev => removePagePermissions(prev, group.keys))
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
                    {CUSTOMER_PERM_GROUPS.map((group) => {
                      // 只显示分组中已启用页面权限的 section
                      const visibleSections = group.sections
                        .map((sec) => ({ section: sec.section, pages: sec.pages.filter((p) => formPermissions.includes(p)) }))
                        .filter((s) => s.pages.length > 0)
                      if (visibleSections.length === 0) return null
                      return (
                        <div key={group.label} className="mb-5">
                          <div className="px-3 py-2 bg-[#f7f8fa] rounded-md mb-2">
                            <span className="text-[12px] font-medium text-[#2b2f36]">{group.label}</span>
                          </div>
                          {visibleSections.map((sec) => {
                            const perms = sec.section === "customers" ? formCustomerPermissions
                              : sec.section === "class_records" ? formCustomerPermissionsCR
                              : formCustomerPermissionsPay
                            const setPerms = sec.section === "customers" ? setFormCustomerPermissions
                              : sec.section === "class_records" ? setFormCustomerPermissionsCR
                              : setFormCustomerPermissionsPay
                            // 同步更新 section state 与该 section 下所有 pageKey 的 formPagePermissions
                            const updateAll = (next: string[]) => {
                              setPerms(next)
                              setFormPagePermissions((prev) => {
                                const updated = { ...prev }
                                sec.pages.forEach((p) => { updated[p] = next })
                                return updated
                              })
                            }
                            const sectionLabel = sec.section === "customers" ? "客户资料"
                              : sec.section === "class_records" ? "邀约"
                              : "付费项目"
                            const pagesText = sec.pages.map((p) => PAGE_LABELS[p] || p).join("、")
                            const checkedCount = memberIdentityNames.filter((n) => perms.includes(n)).length
                            return (
                              <div key={sec.section} className="mb-4 ml-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[12px] font-medium text-[#2b2f36]">{sectionLabel}</span>
                                    <span className="text-[11px] text-[#8f959e]">（{pagesText}）</span>
                                    <span className="text-[11px] text-[#8f959e]">({checkedCount}/{memberIdentityNames.length})</span>
                                  </div>
                                  {!isSystemRole && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={memberIdentityNames.length > 0 && memberIdentityNames.every((n) => perms.includes(n))}
                                        onChange={(e) => {
                                          if (e.target.checked) updateAll([...memberIdentityNames])
                                          else updateAll([])
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
                                            disabled={isSystemRole}
                                            onChange={() => {
                                              if (isSystemRole) return
                                              const next = perms.includes(name) ? perms.filter((n) => n !== name) : [...perms, name]
                                              updateAll(next)
                                            }}
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
                        </div>
                      )
                    })}
                    {CUSTOMER_FILTER_PAGES.filter((k) => formPermissions.includes(k)).length === 0 && (
                      <div className="text-center py-8 text-[12px] text-[#b0b5bb]">
                        请先在"页面权限"中启用相关页面
                      </div>
                    )}
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
