import { useState, useRef, useEffect, useMemo } from "react"
import { Plus, Trash2, GripVertical, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { CustomerSearchInput } from "@/components/customer-search-input"
import type { Customer } from "@/lib/api"

interface Visitor {
  id: string
  nickname: string
  member_type: string
}

interface Group {
  name: string
  leader_id: string
  deputy_id: string
  member_ids: string[]
}

interface Props {
  date: string
  dayVisits: Visitor[]
  allCustomers: Customer[]
  groups: Group[]
  setGroups: (groups: Group[]) => void
  onSave: (groups: Group[]) => Promise<void>
  onCustomerClick?: (customerId: string) => void
}

function RoleRow({ label, selectedId, getName, onCustomerClick }: {
  label: string
  selectedId: string
  getName: (id: string) => string
  onCustomerClick?: (customerId: string) => void
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[12px] text-[#8f959e] shrink-0 w-12">{label}</span>
      {selectedId && (
        <span
          className="text-[12px] text-[#2b2f36] truncate cursor-pointer hover:text-[#3370ff]"
          onClick={() => onCustomerClick?.(selectedId)}
        >
          {getName(selectedId)}
        </span>
      )}
    </div>
  )
}

export default function GroupingView({ date, dayVisits, allCustomers, groups, setGroups, onSave, onCustomerClick }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropGroupIdx, setDropGroupIdx] = useState<number | null>(null)
  const [addGroupOpen, setAddGroupOpen] = useState(false)
  const [editGroupIdx, setEditGroupIdx] = useState<number | null>(null)
  const [deleteGroupIdx, setDeleteGroupIdx] = useState<number | null>(null)
  const [newGroupName, setNewGroupName] = useState("")
  const [newGroupLeaderId, setNewGroupLeaderId] = useState("")
  const [newGroupDeputyId, setNewGroupDeputyId] = useState("")
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<string[]>([])

  const prevDate = useRef(date)
  const hasUserModified = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 每组已占用的人员 ID 集合
  const usedIds = new Set<string>()
  groups.forEach(g => {
    if (g.leader_id) usedIds.add(g.leader_id)
    if (g.deputy_id) usedIds.add(g.deputy_id)
    g.member_ids.forEach(id => usedIds.add(id))
  })

  // 未分组的人员（供 RoleRow 和 MemberAddBtn 使用）
  const availableVisitors = dayVisits.filter(v => !usedIds.has(v.id))

  // 弹窗中需要排除的人员 ID（编辑时保留当前组的人可选）
  const dialogExcludeIds = useMemo(() => {
    if (editGroupIdx !== null) {
      const currentGroup = groups[editGroupIdx]
      const currentIds = new Set([currentGroup.leader_id, currentGroup.deputy_id, ...currentGroup.member_ids].filter(Boolean))
      return [...usedIds].filter(id => !currentIds.has(id))
    }
    return [...usedIds]
  }, [editGroupIdx, groups])

  // 自动保存：用户手动修改后 600ms 自动保存，日期/数据加载不触发
  useEffect(() => {
    if (prevDate.current !== date) {
      prevDate.current = date
      hasUserModified.current = false
      return
    }
    if (!hasUserModified.current) return
    hasUserModified.current = false

    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await onSave(groups)
      } catch (_) {}
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [groups, date])

  const getName = (id: string) => {
    const c = allCustomers.find(c => c.id === id)
    return c?.nickname || c?.name || id
  }

  const addGroup = () => {
    setEditGroupIdx(null)
    setNewGroupName(`小组 ${groups.length + 1}`)
    setNewGroupLeaderId("")
    setNewGroupDeputyId("")
    setNewGroupMemberIds([])
    setAddGroupOpen(true)
  }

  const openEditGroup = (idx: number) => {
    const g = groups[idx]
    setEditGroupIdx(idx)
    setNewGroupName(g.name)
    setNewGroupLeaderId(g.leader_id)
    setNewGroupDeputyId(g.deputy_id)
    setNewGroupMemberIds([...g.member_ids])
    setAddGroupOpen(true)
  }

  const confirmAddGroup = () => {
    hasUserModified.current = true
    const excludeFromMembers = new Set([newGroupLeaderId, newGroupDeputyId].filter(Boolean))
    const cleanMemberIds = newGroupMemberIds.filter(id => !excludeFromMembers.has(id))
    if (editGroupIdx !== null) {
      const updated = groups.map((g, i) => i === editGroupIdx ? { name: newGroupName || g.name, leader_id: newGroupLeaderId, deputy_id: newGroupDeputyId, member_ids: cleanMemberIds } : g)
      setGroups(updated)
    } else {
      setGroups([...groups, { name: newGroupName || `小组 ${groups.length + 1}`, leader_id: newGroupLeaderId, deputy_id: newGroupDeputyId, member_ids: cleanMemberIds }])
    }
    setAddGroupOpen(false)
  }

  const removeGroup = (idx: number) => {
    hasUserModified.current = true
    setGroups(groups.filter((_, i) => i !== idx))
  }

  const addMemberToGroup = (groupIdx: number, visitorId: string) => {
    hasUserModified.current = true
    const updated = groups.map((g, i) => {
      if (i !== groupIdx) return g
      if (visitorId === g.leader_id || visitorId === g.deputy_id || g.member_ids.includes(visitorId)) return g
      return { ...g, member_ids: [...g.member_ids, visitorId] }
    })
    setGroups(updated)
  }

  const handleDragStart = (e: React.DragEvent, visitorId: string) => {
    if (usedIds.has(visitorId)) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData("text/plain", visitorId)
    e.dataTransfer.effectAllowed = "copy"
    setDraggingId(visitorId)
  }

  const handleDragOver = (e: React.DragEvent, groupIdx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "copy"
    setDropGroupIdx(groupIdx)
  }

  const handleDrop = (e: React.DragEvent, groupIdx: number) => {
    e.preventDefault()
    setDropGroupIdx(null)
    setDraggingId(null)
    const visitorId = e.dataTransfer.getData("text/plain")
    if (visitorId && !usedIds.has(visitorId)) {
      addMemberToGroup(groupIdx, visitorId)
    }
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropGroupIdx(null)
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* 左栏：人员列表 */}
      <div className="w-[160px] shrink-0 border-r border-[#e8e8e8] overflow-y-auto scrollbar-hide py-2 px-0">
        <div className="text-[11px] text-[#8f959e] tracking-widest mb-2 px-2">待分组 ({availableVisitors.length})</div>
        <div className="space-y-1">
          {dayVisits.map((v) => {
            const grouped = usedIds.has(v.id)
            return (
              <div
                key={v.id}
                draggable={!grouped}
                onDragStart={(e) => handleDragStart(e, v.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between px-2 py-1.5 rounded text-[12px] transition-colors ${
                  grouped
                    ? "cursor-default"
                    : draggingId === v.id
                      ? "opacity-50"
                      : "cursor-grab bg-white hover:bg-[#f7f8fa]"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <GripVertical className={`h-3 w-3 shrink-0 ${grouped ? "text-[#e0e0e0]" : "text-[#c0c4cc]"}`} />
                  <span
                    className={`truncate ${grouped ? "text-[#c0c4cc]" : "text-[#2b2f36] cursor-pointer hover:text-[#3370ff]"}`}
                    onClick={() => onCustomerClick?.(v.id)}
                  >{v.nickname}</span>
                </div>
                {v.member_type && (
                  <span className={`text-[10px] shrink-0 ml-1 ${grouped ? "text-[#d0d0d0]" : "text-[#8f959e]"}`}>{v.member_type}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 右栏：分组管理 */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#2b2f36]">分组</span>
          </div>
          <Button size="sm" className="h-7 text-xs bg-[#3370ff] hover:bg-[#2860e1] text-white" onClick={addGroup}>
            <Plus className="mr-1 h-3 w-3" /> 新增
          </Button>
        </div>

        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">暂无分组</p>
            <p className="text-xs text-muted-foreground mt-1">点击"新增"创建分组，拖拽左侧人员加入</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group, idx) => {
              return (
              <div
                key={idx}
                className={`border rounded-lg transition-colors overflow-hidden ${
                  dropGroupIdx === idx ? "border-[#3370ff] bg-[#f0f5ff]" : "border-[#f0f0f0]"
                }`}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragLeave={() => setDropGroupIdx(null)}
                onDrop={(e) => handleDrop(e, idx)}
              >
                {/* 头部 */}
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f0f0f0]">
                  <span className="text-[13px] font-medium text-[#2b2f36]">{group.name}</span>
                  <div className="flex items-center gap-1">
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => openEditGroup(idx)}>
                      <Edit className="h-3.5 w-3.5 text-[#8f959e]" />
                    </button>
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => setDeleteGroupIdx(idx)}>
                      <Trash2 className="h-3.5 w-3.5 text-[#8f959e]" />
                    </button>
                  </div>
                </div>
                {/* 角色行 */}
                <div className="px-4 py-3 space-y-3">
                  {/* 组长 */}
                  <RoleRow
                    label="组长"
                    selectedId={group.leader_id}
                    getName={getName}
                    onCustomerClick={onCustomerClick}
                  />
                  {/* 副组长 */}
                  <RoleRow
                    label="副组长"
                    selectedId={group.deputy_id}
                    getName={getName}
                    onCustomerClick={onCustomerClick}
                  />
                  {/* 组员 */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12px] text-[#8f959e] shrink-0 w-12">组员</span>
                    {[...new Set(group.member_ids)].filter(mid => mid !== group.leader_id && mid !== group.deputy_id).length > 0 && (
                      <span className="text-[12px] text-[#2b2f36] inline-flex gap-[6px] min-w-0 flex-wrap">{[...new Set(group.member_ids)].filter(mid => mid !== group.leader_id && mid !== group.deputy_id).map(mid => <span key={mid} className="cursor-pointer hover:text-[#3370ff]" onClick={() => onCustomerClick?.(mid)}>{getName(mid)}</span>)}</span>
                    )}
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 新增分组弹窗 */}
      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent className="max-w-sm p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-4 border-b">
            <DialogTitle className="text-base">{editGroupIdx !== null ? "编辑分组" : "新增分组"}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10">名称</span>
              <input
                className="flex-1 h-8 text-xs px-3 border border-[#e0e0e0] rounded focus:outline-none focus:border-[#3370ff]"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="小组名称"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10">组长</span>
              <div className="flex-1">
                <CustomerSearchInput
                  customers={allCustomers}
                  value={newGroupLeaderId ? getName(newGroupLeaderId) : ""}
                  onChange={() => {}}
                  onSelectItem={(c) => setNewGroupLeaderId(c.id)}
                  placeholder="选择组长"
                  excludeIds={[newGroupDeputyId, ...dialogExcludeIds].filter(Boolean)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10">副组长</span>
              <div className="flex-1">
                <CustomerSearchInput
                  customers={allCustomers}
                  value={newGroupDeputyId ? getName(newGroupDeputyId) : ""}
                  onChange={() => {}}
                  onSelectItem={(c) => setNewGroupDeputyId(c.id)}
                  placeholder="选择副组长"
                  excludeIds={[newGroupLeaderId, ...dialogExcludeIds].filter(Boolean)}
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10 pt-1.5">组员</span>
              <div className="flex-1">
                <CustomerSearchInput
                  customers={allCustomers}
                  value={newGroupMemberIds.map(id => getName(id))}
                  onChange={(v) => {
                    const names = Array.isArray(v) ? v : []
                    const newIds: string[] = []
                    names.forEach((name: string) => {
                      const c = allCustomers.find(c => (c.nickname || c.name) === name)
                      if (c) newIds.push(c.id)
                    })
                    setNewGroupMemberIds(newIds)
                  }}
                  placeholder="搜索添加组员"
                  multi
                  excludeIds={[newGroupLeaderId, newGroupDeputyId, ...newGroupMemberIds, ...dialogExcludeIds].filter(Boolean)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" className="h-8 text-xs px-4" onClick={() => setAddGroupOpen(false)}>取消</Button>
              <Button size="sm" className="h-8 text-xs px-4" onClick={confirmAddGroup}>确定</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <AlertDialog open={deleteGroupIdx !== null} onOpenChange={(open) => { if (!open) setDeleteGroupIdx(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除"{deleteGroupIdx !== null ? groups[deleteGroupIdx]?.name : ""}"分组吗？删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteGroupIdx !== null) { removeGroup(deleteGroupIdx); setDeleteGroupIdx(null) } }}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
