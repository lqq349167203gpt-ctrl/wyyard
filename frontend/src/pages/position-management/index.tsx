import { useEffect, useRef, useState } from "react"
import { Edit, GripVertical, Trash2 } from "lucide-react"
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
  Position,
  Account,
  PositionEditPermissions,
} from "@/lib/api"
import { normalizePagePermissions, removePagePermissions } from "@/lib/page-permissions"
import { refreshAccountPermissions } from "@/hooks/use-edit-permissions"
import { PermissionWorkspace } from "./permission-workspace"
import { AccountsContent } from "@/pages/accounts"

import { PAGE_PERMISSIONS as ALL_PAGES } from "@/lib/page-registry"

const DEFAULT_EDIT_PERMISSIONS: PositionEditPermissions = {
  principal_scope: "own",
  principal_views: { organization: true, person: true },
  principal_person_scope: "all",
  customers: "all",
  visits: "own",
  activities: "own",
  activity_teachers: "own",
  activity_participants: "all",
  activity_lock: false,
  visit_lock: false,
  payments: "all",
  course_records: "all",
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
      visit_need_tags: false, visit_need_detail: false, customer_info: false, customer_feedback: false,
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
  principal_scope: "all",
  principal_views: { organization: true, person: true },
  principal_person_scope: "all",
  customers: "all",
  visits: "all",
  activities: "all",
  activity_teachers: "own",
  activity_participants: "all",
  activity_lock: true,
  visit_lock: true,
  payments: "all",
  course_records: "all",
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
      visit_need_tags: true, visit_need_detail: true, customer_info: true, customer_feedback: true,
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
  const [loadError, setLoadError] = useState("")
  const loadSequence = useRef(0)

  // 当前选中角色
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(() => {
    try { return localStorage.getItem("selectedPositionId") || null } catch { return null }
  })
  const [roleManagementOpen, setRoleManagementOpen] = useState(false)

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
  const [reorderingPositions, setReorderingPositions] = useState(false)
  const [draggingPositionId, setDraggingPositionId] = useState<string | null>(null)
  const [positionDropTarget, setPositionDropTarget] = useState<{ id: string; edge: "before" | "after" } | null>(null)
  const draggingPositionIdRef = useRef<string | null>(null)

  const loadData = async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setLoadError("")
    try {
      const [p, a, perm, editPerm] = await Promise.all([
        positionApi.list(),
        accountApi.list(),
        positionPermissionApi.getAll(),
        positionPermissionApi.getEditPermissions(),
      ])
      if (sequence !== loadSequence.current) return
      setPositions(p)
      setSelectedPositionId(current => current && p.some(position => position.id === current)
        ? current
        : p[0]?.id || null)
      setAccounts(a)
      setPermissions(perm)
      setEditPermissions(editPerm)
    } catch (error) {
      if (sequence === loadSequence.current) setLoadError(error instanceof Error ? error.message : "账号及权限加载失败")
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }

  useEffect(() => { loadData(); return () => { loadSequence.current++ } }, [])

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

  const getPersonCount = (positionName: string) => {
    return accounts.filter(a => (a.roles?.length ? a.roles : [a.role]).includes(positionName)).length
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
    let next = formPermissions.includes(pageKey) ? removePagePermissions(formPermissions, [pageKey]) : [...formPermissions, pageKey]
    if (pageKey === "offline-course-records" && !next.includes(pageKey)) next = removePagePermissions(next, ["offline-course-types"])
    setFormPermissions(next)
    if (!next.includes(pageKey)) {
      // 与原保存接口的关闭联动保持一致，共用权限和独立核销入口不跟随关闭。
      const resets: Record<string, Partial<PositionEditPermissions>> = {
        "healing-records": { customers: "all" },
        "class-records": { visits: "own", visit_lock: false },
        "daily-activities": { activities: "own", activity_teachers: "view", activity_participants: "view", activity_lock: false },
        "payment": { payments: "own" },
        "course-statistics": { course_records: "own" },
      }
      if (resets[pageKey]) setFormEditPermissions(current => ({ ...current, ...resets[pageKey] }))
    }
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
        // 保存的是某一角色，当前账号应重新读取所有角色合并后的权限。
        await refreshAccountPermissions(true)
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

  const resetPositionDrag = () => {
    draggingPositionIdRef.current = null
    setDraggingPositionId(null)
    setPositionDropTarget(null)
  }

  const handlePositionDragStart = (event: React.DragEvent, positionId: string) => {
    if (reorderingPositions) {
      event.preventDefault()
      return
    }
    draggingPositionIdRef.current = positionId
    setDraggingPositionId(positionId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", `position:${positionId}`)
  }

  const handlePositionDragOver = (event: React.DragEvent<HTMLDivElement>, positionId: string) => {
    const sourceId = draggingPositionIdRef.current
    if (!sourceId || sourceId === positionId) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const rect = event.currentTarget.getBoundingClientRect()
    const edge = event.clientY < rect.top + rect.height / 2 ? "before" : "after"
    setPositionDropTarget({ id: positionId, edge })
  }

  const handlePositionDrop = async (event: React.DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggingPositionIdRef.current
    const edge = positionDropTarget?.id === targetId ? positionDropTarget.edge : "before"
    if (!sourceId || sourceId === targetId) {
      resetPositionDrag()
      return
    }

    const previous = positions
    const sourceIndex = previous.findIndex(position => position.id === sourceId)
    if (sourceIndex < 0) {
      resetPositionDrag()
      return
    }
    const next = [...previous]
    const [moved] = next.splice(sourceIndex, 1)
    const targetIndex = next.findIndex(position => position.id === targetId)
    if (targetIndex < 0) {
      resetPositionDrag()
      return
    }
    next.splice(targetIndex + (edge === "after" ? 1 : 0), 0, moved)
    const toPosition = next.findIndex(position => position.id === sourceId) + 1
    if (toPosition === sourceIndex + 1) {
      resetPositionDrag()
      return
    }

    setPositions(next)
    setReorderingPositions(true)
    resetPositionDrag()
    try {
      const saved = await positionApi.reorder(next.map(position => position.id), {
        movedId: sourceId,
        fromPosition: sourceIndex + 1,
        toPosition,
      })
      setPositions(saved)
    } catch (error) {
      setPositions(previous)
      alert(error instanceof Error ? error.message : "角色排序保存失败")
    } finally {
      setReorderingPositions(false)
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

      {loadError && <div role="alert" className="px-4 py-3 text-[12px] text-destructive">{loadError}<button className="ml-3 text-[#3370ff]" onClick={loadData}>重试</button></div>}
      {loading && <div className="py-8 text-center text-[12px] text-[#8f959e]">加载中…</div>}
      {!loading && !loadError && activeTab === "accounts" && <AccountsContent embedded sharedAccounts={accounts} sharedPositions={positions} onAccountsChange={setAccounts} />}

      {!loading && !loadError && activeTab === "roles" && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#e8eaee] bg-white px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <label className="flex min-w-0 items-center gap-3 text-[13px]">
                <span className="shrink-0">角色身份</span>
                <select aria-label="角色身份" value={selectedPositionId || ""} onChange={event => handlePositionChange(event.target.value)} disabled={saving || !positions.length}
                  className="h-8 min-w-0 max-w-full rounded-[4px] border border-[#dee0e3] bg-white px-2 text-[13px] sm:min-w-[160px] sm:max-w-[240px]">
                  {!positions.length && <option value="">暂无角色</option>}
                  {positions.map(position => <option key={position.id} value={position.id}>{position.name}</option>)}
                </select>
              </label>
              {selectedPosition && <span className="text-[12px] text-[#646a73]">{getPersonCount(selectedPosition.name)} 人{isSystemRole ? " · 系统角色" : ""}</span>}
              <Button variant="ghost" size="sm" disabled={saving || hasUnsavedChanges} title={hasUnsavedChanges ? "请先保存或放弃当前权限修改" : "新增、改名、排序和删除角色"} onClick={() => setRoleManagementOpen(true)}>管理角色</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3" aria-live="polite">
              {hasUnsavedChanges && <span className="text-[12px] text-[#646a73]">有未保存修改</span>}
              {saveMessage && (saveError || !hasUnsavedChanges) && <span className={`text-[12px] ${saveError ? "text-destructive" : "text-[#646a73]"}`}>{saveMessage}</span>}
              {selectedPosition && !isSystemRole && <>
                {hasUnsavedChanges && <Button variant="outline" size="sm" disabled={saving} onClick={resetCurrentPermissions}>放弃修改</Button>}
                <Button size="sm" onClick={handleSave} disabled={saving || !hasUnsavedChanges}>{saving ? "保存中…" : "保存修改"}</Button>
              </>}
            </div>
          </div>
          {selectedPosition?.description && <p className="px-1 text-[12px] text-[#646a73]">{selectedPosition.description}</p>}
          {selectedPosition ? <fieldset disabled={saving} className="min-w-0">
            <PermissionWorkspace roleName={selectedPosition.name} system={isSystemRole} pages={formPermissions} edit={formEditPermissions}
              setEdit={setFormEditPermissions} togglePage={handleTogglePermission} savedSnapshot={savedPermissionSnapshot} emptyAccess={DEFAULT_EDIT_PERMISSIONS.customer_access} />
          </fieldset> : <p className="py-10 text-center text-[13px] text-[#646a73]">暂无角色，可在“管理角色”中新增。</p>}
        </div>
      )}

      <Dialog open={roleManagementOpen} onOpenChange={setRoleManagementOpen}>
        <DialogContent className="max-w-md gap-0 p-0" initialFocus={false}>
          <DialogHeader className="border-b border-[#f0f0f0] px-4 py-3"><DialogTitle className="text-[14px] font-normal">管理角色</DialogTitle></DialogHeader>
          {/* 保留角色排序、改名和删除入口 */}
          <div className="flex w-full flex-col overflow-hidden rounded-[4px] border border-[#f0f0f0] bg-white">
            <div className="flex h-12 items-center justify-between border-b border-[#f0f0f0] px-4">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-medium text-[#1f2329]">角色</span>
                <span className="text-[12px] text-[#8f959e]">{positions.length} 个</span>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-[#3370ff] hover:bg-[#f5f6f7] hover:text-[#3370ff]" onClick={() => setCreateDialogOpen(true)}>
                新增角色
              </Button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
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
                      className={`group flex h-12 cursor-pointer items-center justify-between border-l-2 px-2.5 transition-colors ${
                        isSelected ? "bg-[#f7f8fa] text-[#1f2329]" : "text-[#2b2f36] hover:bg-[#f7f8fa]"
                      } ${isSelected ? "border-l-[#3370ff]" : "border-l-transparent"} ${
                        positionDropTarget?.id === pos.id && positionDropTarget.edge === "before" ? "shadow-[inset_0_2px_0_#3370ff]" : ""
                      } ${positionDropTarget?.id === pos.id && positionDropTarget.edge === "after" ? "shadow-[inset_0_-2px_0_#3370ff]" : ""} ${
                        draggingPositionId === pos.id ? "opacity-50" : ""
                      }`}
                      onClick={() => handlePositionChange(pos.id)}
                      onDragOver={(event) => handlePositionDragOver(event, pos.id)}
                      onDrop={(event) => void handlePositionDrop(event, pos.id)}
                    >
                      <div className="flex min-w-0 items-center">
                        <button
                          type="button"
                          draggable={!reorderingPositions}
                          className="mr-1 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded-[4px] text-[#c9cdd4] hover:bg-[#f0f1f2] hover:text-[#8f959e] active:cursor-grabbing"
                          onClick={(event) => event.stopPropagation()}
                          onDragStart={(event) => handlePositionDragStart(event, pos.id)}
                          onDragEnd={resetPositionDrag}
                          title="拖动调整角色顺序"
                        >
                          <GripVertical className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" className={`min-w-0 truncate text-left text-[13px] ${isSelected ? "font-medium" : ""}`} onClick={event => { event.stopPropagation(); handlePositionChange(pos.id) }}>{pos.name}</button>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="mr-1 text-[12px] text-[#8f959e]">
                          {getPersonCount(pos.name)} 人
                        </span>
                        {!pos.is_system && (
                          <div className="flex items-center gap-0.5">
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-[4px] hover:bg-[#f5f6f7] disabled:cursor-default disabled:text-[#c9cdd4]"
                              aria-label={`编辑${pos.name}角色名称`}
                              onClick={(e) => { e.stopPropagation(); setEditingPosition(pos); setEditName(pos.name) }}
                              disabled={isSelected && hasUnsavedChanges}
                              title={isSelected && hasUnsavedChanges ? "请先保存权限修改" : "编辑角色名称"}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-[4px] hover:bg-[#f5f6f7] disabled:cursor-default disabled:opacity-40"
                              aria-label={`删除${pos.name}角色`}
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
        </DialogContent>
      </Dialog>

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
