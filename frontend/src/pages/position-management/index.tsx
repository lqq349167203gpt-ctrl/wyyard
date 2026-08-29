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
import { positionApi, positionPermissionApi, accountApi } from "@/lib/api"
import type {
  ContactAction,
  ContactField,
  CustomerDataScope,
  Position,
  Account,
  PositionEditPermissions,
  TransactionAccess,
} from "@/lib/api"
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
  { key: "payment-deductions", label: "销卡/退课" },
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
  customers: "all",
  visits: "own",
  activities: "own",
  contacts: {
    phone: { view: false, copy: false, edit: false },
    wechat: { view: false, copy: false, edit: false },
  },
  customer_access: {
    scope: "none",
    relations: { referrer: false, referrer_handler: false },
    sensitive_fields: {
      visit_purpose: false,
      trauma_history: false,
      current_block: false,
      work_info: false,
      other_info: false,
    },
    detail_tabs: {
      follow_up: false,
      communication: false,
      activities: false,
      customer_followups: false,
      card_statistics: false,
      offline_courses: false,
    },
    transaction_access: "none",
  },
}

const FULL_EDIT_PERMISSIONS: PositionEditPermissions = {
  customers: "all",
  visits: "all",
  activities: "all",
  contacts: {
    phone: { view: true, copy: true, edit: true },
    wechat: { view: true, copy: true, edit: true },
  },
  customer_access: {
    scope: "all",
    relations: { referrer: true, referrer_handler: true },
    sensitive_fields: {
      visit_purpose: true,
      trauma_history: true,
      current_block: true,
      work_info: true,
      other_info: true,
    },
    detail_tabs: {
      follow_up: true,
      communication: true,
      activities: true,
      customer_followups: true,
      card_statistics: true,
      offline_courses: true,
    },
    transaction_access: "detail",
  },
}

type PermissionSection = "pages" | "edit"
type PendingNavigation =
  | { type: "position"; positionId: string }
  | { type: "tab"; tab: string }

function permissionSnapshot(pages: string[], editPermissions: PositionEditPermissions) {
  return JSON.stringify({
    pages: [...pages].sort(),
    editPermissions,
  })
}

export default function PositionManagementPage() {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem("tab_position-management") || "accounts" } catch { return "accounts" }
  })

  const [positions, setPositions] = useState<Position[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [permissions, setPermissions] = useState<Record<string, string[]>>({})
  const [editPermissions, setEditPermissions] = useState<Record<string, PositionEditPermissions>>({})
  const [loading, setLoading] = useState(true)

  // 左侧选中
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(() => {
    try { return localStorage.getItem("selectedPositionId") || null } catch { return null }
  })
  const [permissionSection, setPermissionSection] = useState<PermissionSection>(() => {
    try {
      const stored = localStorage.getItem("role_permission_section")
      return stored === "edit" || stored === "business" || stored === "privacy" ? "edit" : "pages"
    } catch {
      return "pages"
    }
  })

  // 权限编辑状态
  const [formPermissions, setFormPermissions] = useState<string[]>([])
  const [formEditPermissions, setFormEditPermissions] = useState<PositionEditPermissions>(DEFAULT_EDIT_PERMISSIONS)
  const [savedPermissionSnapshot, setSavedPermissionSnapshot] = useState("")
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState("")
  const [saveError, setSaveError] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null)

  // 新增角色 Dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formDescription, setFormDescription] = useState("")

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
      setSelectedPositionId(current => current && p.some(position => position.id === current)
        ? current
        : p[0]?.id || null)
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

  // 选中角色变化时，加载权限到表单状态
  useEffect(() => {
    if (!selectedPositionId) return
    const pos = positions.find(p => p.id === selectedPositionId)
    if (!pos) return
    const nextPages = (
      pos.name === "超级管理员"
        ? ALL_PAGES.map(page => page.key)
        : normalizePagePermissions(permissions[pos.name] || [])
    )
    const nextEditPermissions = (
      pos.name === "超级管理员"
        ? FULL_EDIT_PERMISSIONS
        : editPermissions[pos.name] || DEFAULT_EDIT_PERMISSIONS
    )
    setFormPermissions(nextPages)
    setFormEditPermissions(nextEditPermissions)
    setSavedPermissionSnapshot(permissionSnapshot(nextPages, nextEditPermissions))
  }, [selectedPositionId, positions, permissions, editPermissions])

  const selectedPosition = positions.find(p => p.id === selectedPositionId) || null
  const isSystemRole = selectedPosition?.is_system || false
  const hasUnsavedChanges = Boolean(
    selectedPosition
      && !isSystemRole
      && savedPermissionSnapshot
      && permissionSnapshot(formPermissions, formEditPermissions) !== savedPermissionSnapshot
  )
  const enabledContactPermissionCount = (["phone", "wechat"] as ContactField[]).reduce(
    (total, field) => total + (["view", "copy", "edit"] as ContactAction[])
      .filter(action => formEditPermissions.contacts[field][action]).length,
    0,
  )

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => a.role === positionName).length
  }

  const selectPermissionSection = (section: PermissionSection) => {
    setPermissionSection(section)
    try { localStorage.setItem("role_permission_section", section) } catch {}
  }

  const performNavigation = (navigation: PendingNavigation) => {
    setSaveMessage("")
    setSaveError(false)
    if (navigation.type === "position") {
      setSelectedPositionId(navigation.positionId)
      return
    }
    setActiveTab(navigation.tab)
    try { localStorage.setItem("tab_position-management", navigation.tab) } catch {}
  }

  const resetCurrentPermissions = () => {
    if (!selectedPosition) return
    const nextPages = selectedPosition.name === "超级管理员"
      ? ALL_PAGES.map(page => page.key)
      : normalizePagePermissions(permissions[selectedPosition.name] || [])
    const nextEditPermissions = selectedPosition.name === "超级管理员"
      ? FULL_EDIT_PERMISSIONS
      : editPermissions[selectedPosition.name] || DEFAULT_EDIT_PERMISSIONS
    setFormPermissions(nextPages)
    setFormEditPermissions(nextEditPermissions)
    setSavedPermissionSnapshot(permissionSnapshot(nextPages, nextEditPermissions))
  }

  const requestNavigation = (navigation: PendingNavigation) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(navigation)
      return
    }
    performNavigation(navigation)
  }

  const handleTabChange = (key: string) => {
    if (key === activeTab) return
    if (key === "roles" && !selectedPositionId && positions.length > 0) {
      setSelectedPositionId(positions[0].id)
    }
    requestNavigation({ type: "tab", tab: key })
  }

  const handlePositionChange = (positionId: string) => {
    if (positionId === selectedPositionId) return
    requestNavigation({ type: "position", positionId })
  }

  const handleTogglePermission = (pageKey: string) => {
    if (isSystemRole) return
    setFormPermissions(prev => {
      const next = prev.includes(pageKey) ? removePagePermissions(prev, [pageKey]) : [...prev, pageKey]
      if (!next.includes(pageKey)) {
        if (pageKey === "healing-records") {
          setFormEditPermissions(current => ({ ...current, customers: "all" }))
        }
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

  const handleToggleContactPermission = (field: ContactField, action: ContactAction) => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      contacts: {
        ...current.contacts,
        [field]: {
          ...current.contacts[field],
          [action]: !current.contacts[field][action],
        },
      },
    }))
  }

  const handleCustomerScopeChange = (scope: CustomerDataScope) => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      customer_access: { ...current.customer_access, scope },
    }))
  }

  const handleToggleCustomerRelation = (key: "referrer" | "referrer_handler") => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      customer_access: {
        ...current.customer_access,
        relations: {
          ...current.customer_access.relations,
          [key]: !current.customer_access.relations[key],
        },
      },
    }))
  }

  const handleToggleSensitiveField = (key: keyof PositionEditPermissions["customer_access"]["sensitive_fields"]) => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      customer_access: {
        ...current.customer_access,
        sensitive_fields: {
          ...current.customer_access.sensitive_fields,
          [key]: !current.customer_access.sensitive_fields[key],
        },
      },
    }))
  }

  const handleToggleDetailTab = (key: keyof PositionEditPermissions["customer_access"]["detail_tabs"]) => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      customer_access: {
        ...current.customer_access,
        detail_tabs: {
          ...current.customer_access.detail_tabs,
          [key]: !current.customer_access.detail_tabs[key],
        },
      },
    }))
  }

  const handleTransactionAccessChange = (transactionAccess: TransactionAccess) => {
    if (isSystemRole) return
    setFormEditPermissions(current => ({
      ...current,
      customer_access: { ...current.customer_access, transaction_access: transactionAccess },
    }))
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

  const savePermissions = async () => {
    if (!selectedPosition || isSystemRole || saving) return false
    setSaving(true)
    setSaveMessage("")
    setSaveError(false)
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
      setSavedPermissionSnapshot(permissionSnapshot(formPermissions, formEditPermissions))
      setSaveMessage("已保存")
      // 保存后立即重新拉取最新数据，确保切角色回来后 UI 状态正确
      await loadData()
      return true
    } catch (e: any) {
      setSaveMessage(e?.message || "保存失败")
      setSaveError(true)
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    void savePermissions()
  }

  const discardAndNavigate = () => {
    if (!pendingNavigation) return
    const navigation = pendingNavigation
    resetCurrentPermissions()
    setPendingNavigation(null)
    performNavigation(navigation)
  }

  const saveAndNavigate = async () => {
    if (!pendingNavigation) return
    const navigation = pendingNavigation
    const saved = await savePermissions()
    if (!saved) return
    setPendingNavigation(null)
    performNavigation(navigation)
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
        <div className="flex gap-3" style={{ height: "calc(100vh - 180px)" }}>
          {/* 左侧角色列表 */}
          <div className="flex w-[232px] shrink-0 flex-col overflow-hidden rounded-[4px] border border-[#f0f0f0] bg-white">
            <div className="flex h-12 items-center justify-between border-b border-[#f0f0f0] px-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-[#1f2329]">角色</span>
                <span className="text-[12px] text-[#8f959e]">{positions.length} 个</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[#3370ff] hover:bg-[#f5f6f7] hover:text-[#3370ff]" onClick={() => setCreateDialogOpen(true)}>
                新增角色
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="py-8 text-center text-[12px] text-[#8f959e]">加载中...</div>
              ) : positions.length === 0 ? (
                <div className="py-8 text-center text-[12px] text-[#8f959e]">暂无角色</div>
              ) : (
                positions.map((pos) => {
                  const isSelected = selectedPositionId === pos.id
                  return (
                    <div
                      key={pos.id}
                      className={`group flex h-12 cursor-pointer items-center justify-between border-l-2 px-3.5 transition-colors ${
                        isSelected ? "bg-[#f7f8fa] text-[#1f2329]" : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                      } ${isSelected ? "border-l-[#3370ff]" : "border-l-transparent"}`}
                      onClick={() => handlePositionChange(pos.id)}
                    >
                      <div className={`min-w-0 truncate text-[13px] ${isSelected ? "font-medium" : ""}`}>{pos.name}</div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className={`mr-1 text-[12px] text-[#8f959e] ${!pos.is_system ? "group-hover:hidden" : ""}`}>
                          {getPersonCount(pos.name)} 人
                        </span>
                        {!pos.is_system && (
                          <div className="hidden items-center gap-0.5 group-hover:flex">
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-[4px] opacity-0 transition-opacity hover:bg-[#f5f6f7] disabled:cursor-default disabled:text-[#c9cdd4] group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); setEditingPosition(pos); setEditName(pos.name) }}
                              disabled={isSelected && hasUnsavedChanges}
                              title={isSelected && hasUnsavedChanges ? "请先保存权限修改" : "编辑角色名称"}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-[4px] opacity-0 transition-opacity hover:bg-[#f5f6f7] disabled:cursor-default disabled:opacity-40 group-hover:opacity-100"
                              onClick={(e) => { e.stopPropagation(); setDeletePosition(pos); setDeleteConfirmName("") }}
                              disabled={isSelected && hasUnsavedChanges}
                              title={isSelected && hasUnsavedChanges ? "请先保存权限修改" : "删除角色"}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* 右侧权限工作区 */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[4px] border border-[#f0f0f0] bg-white">
            <div className="flex min-h-[60px] items-center justify-between px-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[#1f2329]">{selectedPosition?.name || "角色权限"}</span>
                  {selectedPosition && <span className="text-[12px] text-[#8f959e]">{getPersonCount(selectedPosition.name)} 人</span>}
                  {selectedPosition && isSystemRole && (
                    <span className="rounded-[4px] bg-[#f0f1f2] px-1.5 py-0.5 text-[12px] text-[#8f959e]">系统角色</span>
                  )}
                </div>
                {selectedPosition && (
                  <div className="mt-1 truncate text-[12px] text-[#8f959e]">
                    {selectedPosition.description || "配置该角色可访问的页面和可操作的信息范围"}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {hasUnsavedChanges && <span className="text-[12px] text-[#8f959e]">有未保存修改</span>}
                {saveMessage && (saveError || !hasUnsavedChanges) && (
                  <span className={`text-[12px] ${saveError ? "text-[#c4506a]" : "text-[#8f959e]"}`}>{saveMessage}</span>
                )}
                {selectedPosition && !isSystemRole && (
                  <Button size="sm" className="h-8 text-[12px]" onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
                    {saving ? "保存中..." : "保存修改"}
                  </Button>
                )}
              </div>
            </div>
            {selectedPosition && (
              <div className="flex h-10 shrink-0 items-end gap-6 border-b border-[#e8e8e8] px-5">
                {([
                  { key: "pages" as PermissionSection, label: "页面权限", summary: `${formPermissions.length}/${ALL_PAGES.length}` },
                  { key: "edit" as PermissionSection, label: "信息权限", summary: "5 类" },
                ]).map(section => {
                  const selected = permissionSection === section.key
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => selectPermissionSection(section.key)}
                      className={`relative flex h-10 items-center gap-1.5 px-1 text-[14px] transition-colors ${
                        selected ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"
                      }`}
                    >
                      <span>{section.label}</span>
                      <span className={`text-[12px] tabular-nums ${selected ? "text-[#3370ff]" : "text-[#8f959e]"}`}>{section.summary}</span>
                      {selected && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
                    </button>
                  )
                })}
              </div>
            )}
            {!selectedPosition ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[13px] text-[#8f959e]">请从左侧选择角色</p>
                  <p className="mt-1 text-[12px] text-[#c9cdd4]">选择后可配置页面访问和信息权限</p>
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
                {permissionSection === "pages" && (
                  <div className="max-w-[980px]">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[14px] font-medium text-[#1f2329]">页面权限</div>
                        <div className="mt-1 text-[12px] text-[#8f959e]">勾选该角色可以进入的页面，页面分组全部展开显示。</div>
                      </div>
                      <span className="shrink-0 text-[12px] text-[#8f959e]">已开启 {formPermissions.length} / {ALL_PAGES.length}</span>
                    </div>
                    <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
                      {PERMISSION_GROUPS.map((group) => {
                        const checkedCount = group.keys.filter(k => formPermissions.includes(k)).length
                        return (
                          <div key={group.label} className="overflow-hidden rounded-[4px] border border-[#f0f0f0]">
                            <div className="flex h-10 items-center justify-between border-b border-[#f0f0f0] bg-[#f7f8fa] px-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-medium text-[#2b2f36]">{group.label}</span>
                                <span className="text-[12px] text-[#8f959e]">{checkedCount}/{group.keys.length}</span>
                              </div>
                              {!isSystemRole && (
                                <label className="flex cursor-pointer items-center gap-2">
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
                                      if (group.keys.includes("healing-records")) {
                                        setFormEditPermissions(current => ({ ...current, customers: "all" }))
                                      }
                                    }
                                  }}
                                  className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                                />
                                <span className="text-[12px] text-[#8f959e]">全选</span>
                                </label>
                              )}
                            </div>
                            <div className="grid min-h-[52px] grid-cols-2 content-start gap-x-4 gap-y-1 px-3 py-2.5">
                              {group.keys.map((key) => {
                                const page = ALL_PAGES.find(p => p.key === key)
                                return (
                                  <label key={key} className={`flex items-center gap-3 rounded-[4px] py-1.5 ${isSystemRole ? "" : "cursor-pointer hover:bg-[#f7f8fa]"}`}>
                                    <input
                                      type="checkbox"
                                      checked={formPermissions.includes(key)}
                                      onChange={() => handleTogglePermission(key)}
                                      disabled={isSystemRole}
                                      className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                                    />
                                    <span className="text-[13px] text-[#2b2f36]">{page?.label || key}</span>
                                  </label>
                                )
                              })}
                          </div>
                            </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {permissionSection === "edit" && (
                  <div className="max-w-[860px] space-y-7">
                    <section>
                      <div className="mb-3">
                        <div className="text-[14px] font-medium text-[#1f2329]">客户资料可见范围</div>
                        <div className="mt-1 text-[12px] text-[#8f959e]">先限制能看到哪些客户，再决定可查看的信息内容。</div>
                      </div>
                      <div className="overflow-hidden rounded-[4px] border border-[#f0f0f0]">
                        <div className="flex min-h-[64px] items-center justify-between gap-6 px-4 py-3">
                          <div>
                            <div className="text-[13px] text-[#2b2f36]">数据范围</div>
                            <div className="mt-1 text-[12px] text-[#8f959e]">“与本人相关”可按引流关系和承接关系组合。</div>
                          </div>
                          <div className="flex shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                            {([
                              { value: "all" as CustomerDataScope, label: "全部客户" },
                              { value: "related" as CustomerDataScope, label: "与本人相关" },
                              { value: "none" as CustomerDataScope, label: "不可查看" },
                            ]).map(option => {
                              const selected = formEditPermissions.customer_access.scope === option.value
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={isSystemRole}
                                  onClick={() => handleCustomerScopeChange(option.value)}
                                  className={`h-7 rounded-[3px] px-3 text-[12px] transition-colors ${selected ? "bg-[#1f2329] text-white" : "text-[#646a73] hover:bg-[#f5f6f7]"}`}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        {formEditPermissions.customer_access.scope === "related" && (
                          <div className="flex min-h-[52px] items-center gap-8 border-t border-[#f0f0f0] bg-[#fafbfc] px-4">
                            {([
                              { key: "referrer" as const, label: "本人是引流人" },
                              { key: "referrer_handler" as const, label: "本人是承接人" },
                            ]).map(item => (
                              <label key={item.key} className="flex cursor-pointer items-center gap-2 text-[13px] text-[#2b2f36]">
                                <input
                                  type="checkbox"
                                  checked={formEditPermissions.customer_access.relations[item.key]}
                                  disabled={isSystemRole}
                                  onChange={() => handleToggleCustomerRelation(item.key)}
                                  className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                                />
                                {item.label}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <div className="text-[14px] font-medium text-[#1f2329]">业务操作范围</div>
                          <div className="mt-1 text-[12px] text-[#8f959e]">分别设置客户资料、邀约和课表能否操作；仅浏览时所有写入入口都会关闭。</div>
                        </div>
                        <span className="shrink-0 text-[12px] text-[#8f959e]">页面权限控制入口，操作范围控制写入</span>
                      </div>
                      <div className="divide-y divide-[#f0f0f0] overflow-hidden rounded-[4px] border border-[#f0f0f0]">
                        {([
                          {
                            key: "customers" as const,
                            pageKey: "healing-records",
                            label: "客户资料",
                            description: "新增、编辑、停用、标签、跟进点及沟通记录",
                            options: [
                              { value: "view" as const, label: "仅浏览" },
                              { value: "all" as const, label: "可编辑" },
                            ],
                          },
                          {
                            key: "visits" as const,
                            pageKey: "class-records",
                            label: "邀约",
                            description: "客户、邀约人、时间及删除受创建人限制；取消/恢复可由非只读员工操作",
                            options: [
                              { value: "view" as const, label: "仅浏览" },
                              { value: "own" as const, label: "仅本人录入" },
                              { value: "all" as const, label: "全部记录" },
                            ],
                          },
                          {
                            key: "activities" as const,
                            pageKey: "daily-activities",
                            label: "课表",
                            description: "课程、老师、时间、扣卡、案主、简介及删除",
                            options: [
                              { value: "view" as const, label: "仅浏览" },
                              { value: "own" as const, label: "仅本人录入" },
                              { value: "all" as const, label: "全部记录" },
                            ],
                          },
                        ]).map((item) => {
                          const pageEnabled = formPermissions.includes(item.pageKey)
                          return (
                            <div key={item.key} className="flex min-h-[76px] items-center justify-between gap-6 px-4 py-3">
                              <div className="min-w-0">
                                <div className="text-[13px] font-medium text-[#2b2f36]">{item.label}</div>
                                <div className="mt-1 text-[12px] text-[#8f959e]">{item.description}</div>
                                {!pageEnabled && (
                                  <div className="mt-1 text-[12px] text-[#c9cdd4]">请先开启“{item.label}”页面权限</div>
                                )}
                              </div>
                              <div className="flex shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                                {item.options.map((option) => {
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
                      <p className="mt-2.5 text-[12px] text-[#8f959e]">“仅浏览”会同时由后端拦截写操作；邀约和课表的“仅本人录入”仍按创建人控制受保护内容。</p>
                    </section>

                    <section>
                      <div className="mb-3">
                        <div className="text-[14px] font-medium text-[#1f2329]">隐私信息查看</div>
                        <div className="mt-1 text-[12px] text-[#8f959e]">未勾选的字段在客户列表、详情页和管理端小程序中都不返回内容。</div>
                      </div>
                      <div className="grid grid-cols-2 overflow-hidden rounded-[4px] border border-[#f0f0f0] md:grid-cols-3">
                        {([
                          { key: "visit_purpose" as const, label: "到访目的" },
                          { key: "trauma_history" as const, label: "创伤经历" },
                          { key: "current_block" as const, label: "当下卡点" },
                          { key: "work_info" as const, label: "工作情况" },
                          { key: "other_info" as const, label: "其他信息" },
                        ]).map(item => (
                          <label key={item.key} className="flex min-h-[48px] cursor-pointer items-center gap-2 border-b border-r border-[#f0f0f0] px-4 text-[13px] text-[#2b2f36] last:border-b-0">
                            <input
                              type="checkbox"
                              checked={formEditPermissions.customer_access.sensitive_fields[item.key]}
                              disabled={isSystemRole}
                              onChange={() => handleToggleSensitiveField(item.key)}
                              className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="mb-3">
                        <div className="text-[14px] font-medium text-[#1f2329]">详情内容查看</div>
                        <div className="mt-1 text-[12px] text-[#8f959e]">控制客户详情页下方各类记录；无权限的栏目不显示。</div>
                      </div>
                      <div className="grid grid-cols-2 overflow-hidden rounded-[4px] border border-[#f0f0f0] md:grid-cols-3">
                        {([
                          { key: "follow_up" as const, label: "跟进点" },
                          { key: "communication" as const, label: "沟通记录" },
                          { key: "activities" as const, label: "活动记录" },
                          { key: "customer_followups" as const, label: "客户回访" },
                          { key: "card_statistics" as const, label: "卡次统计" },
                          { key: "offline_courses" as const, label: "线下落地课程" },
                        ]).map(item => (
                          <label key={item.key} className="flex min-h-[48px] cursor-pointer items-center gap-2 border-b border-r border-[#f0f0f0] px-4 text-[13px] text-[#2b2f36]">
                            <input
                              type="checkbox"
                              checked={formEditPermissions.customer_access.detail_tabs[item.key]}
                              disabled={isSystemRole}
                              onChange={() => handleToggleDetailTab(item.key)}
                              className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                            />
                            {item.label}
                          </label>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="mb-3">
                        <div className="text-[14px] font-medium text-[#1f2329]">交易数据查看</div>
                        <div className="mt-1 text-[12px] text-[#8f959e]">与客户消费金额、产品销售和客户详情交易记录使用同一权限。</div>
                      </div>
                      <div className="flex min-h-[64px] items-center justify-between gap-6 rounded-[4px] border border-[#f0f0f0] px-4 py-3">
                        <div className="text-[13px] text-[#2b2f36]">交易信息层级</div>
                        <div className="flex shrink-0 items-center rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
                          {([
                            { value: "none" as TransactionAccess, label: "不可查看" },
                            { value: "summary" as TransactionAccess, label: "仅汇总" },
                            { value: "detail" as TransactionAccess, label: "汇总与明细" },
                          ]).map(option => {
                            const selected = formEditPermissions.customer_access.transaction_access === option.value
                            return (
                              <button
                                key={option.value}
                                type="button"
                                disabled={isSystemRole}
                                onClick={() => handleTransactionAccessChange(option.value)}
                                className={`h-7 rounded-[3px] px-3 text-[12px] transition-colors ${selected ? "bg-[#1f2329] text-white" : "text-[#646a73] hover:bg-[#f5f6f7]"}`}
                              >
                                {option.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="mb-3 flex items-end justify-between gap-4">
                        <div>
                          <div className="text-[14px] font-medium text-[#1f2329]">联系方式权限</div>
                          <div className="mt-1 text-[12px] text-[#8f959e]">控制已有客户手机号和微信号的查看、复制与修改权限。</div>
                        </div>
                        <span className="shrink-0 text-[12px] text-[#8f959e]">已开启 {enabledContactPermissionCount} / 6</span>
                      </div>
                      <div className="overflow-hidden rounded-[4px] border border-[#f0f0f0]">
                        <div className="grid grid-cols-[minmax(120px,1fr)_96px_96px_96px] items-center bg-[#f7f8fa] px-4 py-2.5 text-[13px] text-[#8f959e]">
                          <span>联系方式</span>
                          <span className="text-center">查看明文</span>
                          <span className="text-center">复制</span>
                          <span className="text-center">修改</span>
                        </div>
                        {([
                          { field: "phone" as ContactField, label: "手机号" },
                          { field: "wechat" as ContactField, label: "微信号" },
                        ]).map(item => (
                          <div key={item.field} className="grid min-h-[52px] grid-cols-[minmax(120px,1fr)_96px_96px_96px] items-center border-t border-[#f0f0f0] px-4">
                            <span className="text-[13px] text-[#2b2f36]">{item.label}</span>
                            {(["view", "copy", "edit"] as ContactAction[]).map(action => (
                              <label key={action} className={`flex h-full items-center justify-center ${isSystemRole ? "" : "cursor-pointer"}`}>
                                <input
                                  type="checkbox"
                                  checked={formEditPermissions.contacts[item.field][action]}
                                  disabled={isSystemRole}
                                  onChange={() => handleToggleContactPermission(item.field, action)}
                                  className="h-4 w-4 rounded border-[#dee0e3] accent-[#3370ff]"
                                />
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                      <div className="mt-2.5 text-[12px] leading-5 text-[#8f959e]">
                        新建客户时可正常录入。查看、复制和修改已有联系方式都会进入操作日志，日志不会保存联系方式明文。
                      </div>
                    </section>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 新增角色 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-sm p-0 gap-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="text-[14px] font-normal">新增角色</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-right text-[12px] text-[#4e535a]">名称</span>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="输入角色名称" />
            </div>
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-right text-[12px] text-[#4e535a]">简介</span>
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
          <DialogHeader className="border-b border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="text-[14px] font-normal">编辑角色名称</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5">
            <div className="grid grid-cols-[70px_1fr] items-center gap-2">
              <span className="text-right text-[12px] text-[#4e535a]">名称</span>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="输入角色名称" />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t">
            <Button variant="outline" size="sm" onClick={() => { setEditingPosition(null); setEditName("") }}>取消</Button>
            <Button size="sm" onClick={handleEditName} disabled={!editName.trim()}>保存</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 未保存修改确认 */}
      <Dialog open={!!pendingNavigation} onOpenChange={(open) => { if (!open && !saving) setPendingNavigation(null) }}>
        <DialogContent className="w-[400px] max-w-[90vw] gap-0 p-0">
          <DialogHeader className="border-b border-[#f0f0f0] px-5 py-3">
            <DialogTitle className="text-[14px] font-normal">权限尚未保存</DialogTitle>
          </DialogHeader>
          <div className="px-5 py-5 text-[13px] text-[#2b2f36]">
            当前角色有未保存的权限修改，是否先保存再离开？
            {saveError && saveMessage && <div className="mt-2 text-[12px] text-[#c4506a]">{saveMessage}</div>}
          </div>
          <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-5 py-3">
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={() => setPendingNavigation(null)} disabled={saving}>继续编辑</Button>
            <Button variant="outline" size="sm" className="h-8 text-[12px]" onClick={discardAndNavigate} disabled={saving}>放弃修改</Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={() => { void saveAndNavigate() }} disabled={saving}>
              {saving ? "保存中..." : "保存并离开"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认 Dialog */}
      <AlertDialog open={!!deletePosition} onOpenChange={() => { setDeletePosition(null); setDeleteConfirmName("") }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[14px] font-normal">删除角色</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px]">
              确定要删除「{deletePosition?.name}」吗？该角色下的人员不会被删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <label className="mb-1 block text-[12px] text-[#8f959e]">请输入角色名称确认删除</label>
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
