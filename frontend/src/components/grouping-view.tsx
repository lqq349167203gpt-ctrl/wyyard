import { useState, useRef, useEffect, useMemo } from "react"
import { Plus, Trash2, Edit, Download } from "lucide-react"
import * as XLSX from "xlsx-js-style"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { SelectDropdown } from "@/components/select-dropdown"
import type { Customer, VisitRecord, MembershipCard } from "@/lib/api"

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
  visits: VisitRecord[]
  membershipCards: MembershipCard[]
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

export default function GroupingView({ date, dayVisits, allCustomers, visits, membershipCards, groups, setGroups, onSave, onCustomerClick }: Props) {
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

  // 弹窗可选人员：只看当日到场人员 + 编辑时保留当前组成员
  const dialogCustomers = useMemo(() => {
    const visitIds = new Set(dayVisits.map(v => v.id))
    if (editGroupIdx !== null) {
      const currentGroup = groups[editGroupIdx]
      if (currentGroup.leader_id) visitIds.add(currentGroup.leader_id)
      if (currentGroup.deputy_id) visitIds.add(currentGroup.deputy_id)
      currentGroup.member_ids.forEach(id => visitIds.add(id))
    }
    return allCustomers.filter(c => visitIds.has(c.id))
  }, [dayVisits, allCustomers, editGroupIdx, groups])

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
    const result = c?.nickname || c?.name || id
    if (!c) console.log("[GroupingView] getName: customer NOT found for id:", id, "allCustomers count:", allCustomers.length)
    return result
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
    console.log("[GroupingView] drag start:", visitorId, "dayVisits:", dayVisits.map(v => v.id))
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
    console.log("[GroupingView] drop:", visitorId, "groupIdx:", groupIdx, "usedIds:", [...usedIds])
    if (visitorId && !usedIds.has(visitorId)) {
      addMemberToGroup(groupIdx, visitorId)
    }
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDropGroupIdx(null)
  }

  const handleExport = () => {
    // 构建客户 ID → 客户信息的映射
    const customerMap = new Map(allCustomers.map(c => [c.id, c]))
    // 构建客户 ID → 当日到访记录的映射
    const visitMap = new Map(visits.filter(v => v.visit_date === date).map(v => [v.customer_id, v]))
    // 构建客户 ID → 已到店次数的映射
    const arrivedCountMap = new Map<string, number>()
    visits.forEach(v => {
      if (v.arrived) {
        arrivedCountMap.set(v.customer_id, (arrivedCountMap.get(v.customer_id) || 0) + 1)
      }
    })
    // 构建客户 ID → 会员卡类型的映射（取最新的一张卡）
    const cardMap = new Map<string, string>()
    membershipCards.forEach(card => {
      if (!cardMap.has(card.customer_id)) {
        cardMap.set(card.customer_id, card.card_type)
      }
    })
    // 构建客户 ID → 角色的映射
    const roleMap = new Map<string, string>()
    groups.forEach(group => {
      if (group.leader_id) roleMap.set(group.leader_id, "组长")
      if (group.deputy_id) roleMap.set(group.deputy_id, "副组长")
    })

    const rows: any[] = []

    // 按分组遍历
    groups.forEach(group => {
      const allMemberIds = [group.leader_id, group.deputy_id, ...group.member_ids].filter(Boolean)
      const uniqueIds = [...new Set(allMemberIds)]
      uniqueIds.forEach(id => {
        const customer = customerMap.get(id)
        const visit = visitMap.get(id)
        const role = roleMap.get(id) || ""
        rows.push({
          "引流人": customer?.referrer || "",
          "客户昵称": customer?.nickname || getName(id),
          "预计时间": visit?.visit_time || "09:00",
          "参与次数": arrivedCountMap.get(id) || 0,
          "会员身份": cardMap.get(id) || customer?.member_type || "",
          "当日需求": visit?.needs || "",
          "组长情况": role || "-",
          "组长获得的信息": role === "组长" ? (visit?.needs || "") : "",
          "邀约人": visit?.referrer_handler || "",
        })
      })
    })

    // 未分组的人员
    const ungrouped = dayVisits.filter(v => !usedIds.has(v.id))
    ungrouped.forEach(v => {
      const customer = customerMap.get(v.id)
      const visit = visitMap.get(v.id)
      rows.push({
        "引流人": customer?.referrer || "",
        "客户昵称": customer?.nickname || v.nickname,
        "预计时间": visit?.visit_time || "09:00",
        "参与次数": arrivedCountMap.get(v.id) || 0,
        "会员身份": cardMap.get(v.id) || customer?.member_type || "",
        "当日需求": visit?.needs || "",
        "组长情况": "-",
        "组长获得的信息": "",
        "邀约人": visit?.referrer_handler || "",
      })
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    // 设置列宽
    ws['!cols'] = [
      { wch: 10 }, // 引流人
      { wch: 12 }, // 客户昵称
      { wch: 10 }, // 预计时间
      { wch: 10 }, // 参与次数
      { wch: 12 }, // 会员身份
      { wch: 40 }, // 当日需求
      { wch: 10 }, // 组长情况
      { wch: 30 }, // 组长获得的信息
      { wch: 10 }, // 邀约人
    ]
    // 设置表头字体加粗
    const headerStyle = { font: { bold: true } }
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col })
      if (ws[cellRef]) {
        ws[cellRef].s = headerStyle
      }
    }
    // 设置组长/副组长行背景色
    const leaderStyle = { fill: { fgColor: { rgb: "F0F5FF" } } }
    for (let row = 1; row <= range.e.r; row++) {
      const roleCellRef = XLSX.utils.encode_cell({ r: row, c: 6 }) // 组长情况列
      const roleCell = ws[roleCellRef]
      if (roleCell && (roleCell.v === "组长" || roleCell.v === "副组长")) {
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellRef = XLSX.utils.encode_cell({ r: row, c: col })
          if (ws[cellRef]) {
            ws[cellRef].s = leaderStyle
          }
        }
      }
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "人员分组")
    XLSX.writeFile(wb, `人员分组_${date}.xlsx`)
  }

  return (
    <div className="flex-1 flex min-h-0 overflow-hidden">
      {/* 左栏：人员列表 */}
      <div className="w-[160px] shrink-0 border-r border-[#f5f5f5] overflow-y-auto scrollbar-hide py-2 px-0">
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
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExport}>
              <Download className="mr-1 h-3 w-3" /> 导出
            </Button>
            <Button size="sm" className="h-7 text-xs bg-[#3370ff] hover:bg-[#2860e1] text-white" onClick={addGroup}>
              <Plus className="mr-1 h-3 w-3" /> 新增
            </Button>
          </div>
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
                <SelectDropdown
                  value={newGroupLeaderId}
                  options={dialogCustomers.filter(c => !dialogExcludeIds.includes(c.id) && c.id !== newGroupDeputyId && !newGroupMemberIds.includes(c.id)).map(c => ({ value: c.id, label: c.nickname || c.name || c.id }))}
                  placeholder="选择组长"
                  onChange={(v) => {
                    setNewGroupLeaderId(v)
                    if (v && v === newGroupDeputyId) setNewGroupDeputyId("")
                    if (v) setNewGroupMemberIds(newGroupMemberIds.filter(id => id !== v))
                  }}
                  clearable
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10">副组长</span>
              <div className="flex-1">
                <SelectDropdown
                  value={newGroupDeputyId}
                  options={dialogCustomers.filter(c => !dialogExcludeIds.includes(c.id) && c.id !== newGroupLeaderId && !newGroupMemberIds.includes(c.id)).map(c => ({ value: c.id, label: c.nickname || c.name || c.id }))}
                  placeholder="选择副组长"
                  onChange={(v) => {
                    setNewGroupDeputyId(v)
                    if (v && v === newGroupLeaderId) setNewGroupLeaderId("")
                    if (v) setNewGroupMemberIds(newGroupMemberIds.filter(id => id !== v))
                  }}
                  clearable
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[12px] text-[#4e535a] shrink-0 w-10 pt-1.5">组员</span>
              <div className="flex-1 space-y-2">
                <SelectDropdown
                  value=""
                  options={dialogCustomers.filter(c => !dialogExcludeIds.includes(c.id) && c.id !== newGroupLeaderId && c.id !== newGroupDeputyId && !newGroupMemberIds.includes(c.id)).map(c => ({ value: c.id, label: c.nickname || c.name || c.id }))}
                  placeholder="添加组员"
                  onChange={(v) => { if (v) setNewGroupMemberIds([...newGroupMemberIds, v]) }}
                />
                {newGroupMemberIds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {newGroupMemberIds.map(id => (
                      <span key={id} className="inline-flex items-center gap-1 text-[11px] bg-[#f0f1f2] text-[#646a73] px-1.5 py-0.5 rounded">
                        {getName(id)}
                        <button className="hover:text-[#f54a45]" onClick={() => setNewGroupMemberIds(newGroupMemberIds.filter(mid => mid !== id))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
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
