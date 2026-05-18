import { useState, useRef, useEffect } from "react"
import { Plus, Trash2, GripVertical, X } from "lucide-react"
import { Button } from "@/components/ui/button"
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
}

function RoleRow({ label, selectedId, candidates, getName, onSelect, onClear }: {
  label: string
  selectedId: string
  candidates: Visitor[]
  getName: (id: string) => string
  onSelect: (id: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <span className="text-[12px] text-[#8f959e] w-10 shrink-0">{label}</span>
      <div className="relative">
        {selectedId ? (
          <span
            className="inline-flex items-center gap-1 bg-[#f2f3f5] text-[#2b2f36] rounded px-2 py-1 text-[12px] cursor-pointer hover:bg-[#e5e6eb]"
            onClick={() => setOpen(!open)}
          >
            {getName(selectedId)}
            <button
              className="text-[#8f959e] hover:text-[#ff4d4f]"
              onClick={(e) => { e.stopPropagation(); onClear() }}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            className="inline-flex items-center gap-0.5 text-[12px] text-[#c0c4cc] hover:text-[#3370ff] hover:bg-[#f0f5ff] rounded px-2 py-1"
            onClick={() => setOpen(!open)}
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
        {open && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-[#e8e8e8] rounded-lg shadow-lg max-h-[160px] overflow-y-auto min-w-[120px]">
            {candidates.length === 0 ? (
              <div className="text-[11px] text-[#c0c4cc] px-3 py-2">无可用人员</div>
            ) : (
              candidates.map(v => (
                <div
                  key={v.id}
                  className="px-3 py-1.5 text-[12px] text-[#2b2f36] hover:bg-[#f0f5ff] cursor-pointer whitespace-nowrap"
                  onClick={() => { onSelect(v.id); setOpen(false) }}
                >
                  {v.nickname}
                  {v.member_type && <span className="text-[10px] text-[#8f959e] ml-1.5">{v.member_type}</span>}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function MemberAddBtn({ candidates, onSelect }: {
  candidates: Visitor[]
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (candidates.length === 0) return null

  return (
    <div className="relative inline-flex" ref={ref}>
      <button
        className="inline-flex items-center gap-0.5 text-[12px] text-[#c0c4cc] hover:text-[#3370ff] hover:bg-[#f0f5ff] rounded px-2 py-1"
        onClick={() => setOpen(!open)}
      >
        <Plus className="h-3 w-3" /> 添加
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-[#e8e8e8] rounded-lg shadow-lg max-h-[160px] overflow-y-auto min-w-[120px]">
          {candidates.map(v => (
            <div
              key={v.id}
              className="px-3 py-1.5 text-[12px] text-[#2b2f36] hover:bg-[#f0f5ff] cursor-pointer whitespace-nowrap"
              onClick={() => { onSelect(v.id); setOpen(false) }}
            >
              {v.nickname}
              {v.member_type && <span className="text-[10px] text-[#8f959e] ml-1.5">{v.member_type}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function GroupingView({ date, dayVisits, allCustomers, groups, setGroups, onSave }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropGroupIdx, setDropGroupIdx] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

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
        setSaved(true)
        setTimeout(() => setSaved(false), 1500)
      } catch (_) {}
    }, 600)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [groups, date])

  const getName = (id: string) => {
    const c = allCustomers.find(c => c.id === id)
    return c?.nickname || c?.name || id
  }

  const addGroup = () => {
    hasUserModified.current = true
    const name = `小组 ${groups.length + 1}`
    setGroups([...groups, { name, leader_id: "", deputy_id: "", member_ids: [] }])
  }

  const removeGroup = (idx: number) => {
    hasUserModified.current = true
    setGroups(groups.filter((_, i) => i !== idx))
  }

  const updateGroup = (idx: number, field: string, value: string) => {
    hasUserModified.current = true
    const updated = groups.map((g, i) => {
      if (i !== idx) return g
      return { ...g, [field]: value }
    })
    setGroups(updated)
  }

  const addMemberToGroup = (groupIdx: number, visitorId: string) => {
    hasUserModified.current = true
    const updated = groups.map((g, i) => {
      if (i !== groupIdx) return g
      return { ...g, member_ids: [...g.member_ids, visitorId] }
    })
    setGroups(updated)
  }

  const removeMemberFromGroup = (groupIdx: number, memberId: string) => {
    hasUserModified.current = true
    const updated = groups.map((g, i) => {
      if (i !== groupIdx) return g
      return { ...g, member_ids: g.member_ids.filter(id => id !== memberId) }
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
    <div className="flex-1 flex min-h-0">
      {/* 左栏：人员列表 */}
      <div className="w-[160px] shrink-0 border-r border-[#e8e8e8] overflow-y-auto py-2 px-0">
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
                  <span className={grouped ? "text-[#c0c4cc] truncate" : "text-[#2b2f36] truncate"}>{v.nickname}</span>
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
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#2b2f36]">分组</span>
            {saved && <span className="text-[11px] text-green-600">已保存</span>}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addGroup}>
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
              // 候选人：本组已选的人 + 未被其他组占用的访客
              const candidates = (id: string, excludeId: string): Visitor[] => {
                const own = id ? dayVisits.find(v => v.id === id) : null
                const avail = availableVisitors.filter(v => v.id !== excludeId)
                return own ? [own, ...avail] : avail
              }

              return (
              <div
                key={idx}
                className={`border rounded-lg transition-colors ${
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
                    <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#f0f0f0]" onClick={() => removeGroup(idx)}>
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
                    candidates={candidates(group.leader_id, group.deputy_id)}
                    getName={getName}
                    onSelect={(id) => updateGroup(idx, "leader_id", id)}
                    onClear={() => updateGroup(idx, "leader_id", "")}
                  />
                  {/* 副组长 */}
                  <RoleRow
                    label="副组长"
                    selectedId={group.deputy_id}
                    candidates={candidates(group.deputy_id, group.leader_id)}
                    getName={getName}
                    onSelect={(id) => updateGroup(idx, "deputy_id", id)}
                    onClear={() => updateGroup(idx, "deputy_id", "")}
                  />
                  {/* 组员 */}
                  <div className="flex items-start gap-2">
                    <span className="text-[12px] text-[#8f959e] w-10 shrink-0 pt-1.5">组员</span>
                    <div className="flex-1 flex flex-wrap gap-1.5 items-center">
                      {group.member_ids.map(mid => (
                        <span key={mid} className="inline-flex items-center gap-1 bg-[#f2f3f5] text-[#2b2f36] rounded px-2 py-1 text-[12px]">
                          {getName(mid)}
                          <button className="text-[#8f959e] hover:text-[#ff4d4f]" onClick={() => removeMemberFromGroup(idx, mid)}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <MemberAddBtn
                        candidates={availableVisitors}
                        onSelect={(id) => addMemberToGroup(idx, id)}
                      />
                    </div>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
