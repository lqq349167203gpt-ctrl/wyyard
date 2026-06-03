import { memo, useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Users, FileUp, Edit, Trash2 } from "lucide-react"
import type {
  ClassRecord, GroupCaseSession, EmotionalReleaseSession,
  EnergyKnotSession, InternalCourseSession,
} from "@/lib/api"

interface DayVisit {
  id: string
  nickname: string
  member_type: string
}

interface UnifiedDetailRecord {
  type: "class" | "gcs" | "ers" | "eks" | "ics"
  data: any
  date: string
}

interface DropCustomer {
  customer_id: string
  nickname: string
}

interface ActivityCardListProps {
  records: UnifiedDetailRecord[]
  isActivitiesView: boolean
  standaloneTab: string | undefined
  dayVisits: DayVisit[]
  dragOverActivityId: string | null
  setDragOverActivityId: (id: string | null) => void
  onOpenMemberDialog: (type: string, record: any) => void
  setDeleteId: (id: string | null) => void
  setGcsDeleteId: (id: string | null) => void
  setErsDeleteId: (id: string | null) => void
  setEksDeleteId: (id: string | null) => void
  setIcsDeleteId: (id: string | null) => void
  handleOpenEdit: (record: ClassRecord) => void
  handleOpenMaterials: (record: ClassRecord) => void
  handleOpenGroups: (record: ClassRecord) => void
  handleDropToClass: (record: ClassRecord, customer: DropCustomer) => void
  handleOpenGcsEdit: (session: GroupCaseSession) => void
  handleOpenGcsMaterials: (session: GroupCaseSession) => void
  handleOpenGcsMembers: (session: GroupCaseSession) => void
  handleDropToGcs: (session: GroupCaseSession, customer: Pick<DropCustomer, "customer_id">) => void
  handleOpenErsEdit: (session: EmotionalReleaseSession) => void
  handleOpenErsMaterials: (session: EmotionalReleaseSession) => void
  handleOpenErsMembers: (session: EmotionalReleaseSession) => void
  handleDropToErs: (session: EmotionalReleaseSession, customer: Pick<DropCustomer, "customer_id">) => void
  handleOpenEksEdit: (session: EnergyKnotSession) => void
  handleDropToEks: (session: EnergyKnotSession, customer: Pick<DropCustomer, "customer_id">) => void
  handleOpenIcsEdit: (session: InternalCourseSession) => void
  handleOpenIcsMaterials: (session: InternalCourseSession) => void
  handleOpenIcsMembers: (session: InternalCourseSession) => void
  handleDropToIcs: (session: InternalCourseSession, customer: Pick<DropCustomer, "customer_id">) => void
  getTeacherNames: (teacherIds: string[]) => string[]
  getMemberName: (id: string) => string
  dailyGroups: { name: string; leader_id: string; deputy_id: string; member_ids: string[] }[]
}

const ActivityCardList = memo((props: ActivityCardListProps) => {
  const {
    records: unifiedDetailRecords,
    isActivitiesView,
    standaloneTab,
    dayVisits,
    dragOverActivityId,
    setDragOverActivityId,
    onOpenMemberDialog,
    setDeleteId,
    setGcsDeleteId,
    setErsDeleteId,
    setEksDeleteId,
    setIcsDeleteId,
    handleOpenEdit,
    handleOpenMaterials,
    handleOpenGroups,
    handleDropToClass,
    handleOpenGcsEdit,
    handleOpenGcsMaterials,
    handleOpenGcsMembers,
    handleDropToGcs,
    handleOpenErsEdit,
    handleOpenErsMaterials,
    handleOpenErsMembers,
    handleDropToErs,
    handleOpenEksEdit,
    handleDropToEks,
    handleOpenIcsEdit,
    handleOpenIcsMaterials,
    handleOpenIcsMembers,
    handleDropToIcs,
    getTeacherNames,
    getMemberName,
    dailyGroups,
  } = props

  const [visibleCount, setVisibleCount] = useState(15)
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || visibleCount >= unifiedDetailRecords.length) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => Math.min(prev + 15, unifiedDetailRecords.length))
        }
      },
      { rootMargin: "200px" }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [visibleCount, unifiedDetailRecords.length])

  const visibleRecords = unifiedDetailRecords.slice(0, visibleCount)

  return (
<div className="space-y-3">
                {visibleRecords.map((ur, idx) => {


                // ===== 活动日历卡片 =====
                if (ur.type === "class") {
                  const record = ur.data
                  return (
                    <div
                      key={`class-${record.id}`}
                      className={`bg-white transition-shadow ${!standaloneTab && dragOverActivityId === `class-${record.id}` ? "ring-2 ring-[#3370ff] ring-inset" : ""}`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
                      onDragOver={!standaloneTab ? (e) => { e.preventDefault(); setDragOverActivityId(`class-${record.id}`) } : undefined}
                      onDragLeave={!standaloneTab ? () => setDragOverActivityId(null) : undefined}
                      onDrop={!standaloneTab ? (e) => {
                        e.preventDefault()
                        setDragOverActivityId(null)
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                          handleDropToClass(record, data)
                        } catch {}
                      } : undefined}
                    >
                      {idx > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
                      {isActivitiesView ? (
                        <div className="flex px-5 py-3 gap-4">
                          {/* 左栏：时间 */}
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-0.5 pt-1">
                            {record.start_time && <span className="text-[11px] text-[#8f959e] font-light">{record.start_time}</span>}
                            {record.start_time && record.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {record.end_time && <span className="text-[11px] text-[#8f959e] font-light">{record.end_time}</span>}
                          </div>
                          {/* 右栏：内容 */}
                          <div className="flex-1 min-w-0 space-y-1">
                            {/* 标签行 + 管理成员 */}
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8faff] text-[#3370ff]">沙龙</span>
                              {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8fdf8] text-[#4caf50]">公益</span>}
                              {getTeacherNames(record.teacher_ids).length > 0 && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{getTeacherNames(record.teacher_ids).join("、")}</span>}
                              <button className="ml-auto text-[11px] text-[#8f959e] hover:text-[#3370ff] transition-colors" onClick={() => onOpenMemberDialog("class", record)}>成员 ›</button>
                            </div>
                            {/* 活动名称 */}
                            <div>
                              <span className="text-[13px] font-medium text-[#2b2f36]">{record.course_name}</span>
                            </div>
                            {/* 成员列表 */}
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                                {((record.groups || []).length === 0 && (record.participant_ids || []).length === 0) ? null : (
                                  (() => {
                                    const dailyGroupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean)))
                                    const getDailyRole = (id: string) => {
                                      for (const g of dailyGroups) {
                                        if (g.leader_id === id) return "组长"
                                        if (g.deputy_id === id) return "副组长"
                                      }
                                      return ""
                                    }
                                    const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = (record.groups || []).map((group: any) => {
                                      const parts: { name: string; roles: string[]; present: boolean }[] = []
                                      const excludeIds = new Set([group.leader_id, group.deputy_id].filter(Boolean))
                                      if (group.leader_id) parts.push({ name: getMemberName(group.leader_id), roles: ["组长"], present: dayVisits.some(v => v.id === group.leader_id) })
                                      if (group.deputy_id) parts.push({ name: getMemberName(group.deputy_id), roles: ["副组长"], present: dayVisits.some(v => v.id === group.deputy_id) })
                                      group.member_ids.filter((id: string) => !excludeIds.has(id)).forEach((id: string) => {
                                        parts.push({ name: getMemberName(id), roles: [], present: dayVisits.some(v => v.id === id) })
                                      })
                                      return parts.length > 0 ? parts : null
                                    }).filter(Boolean)
                                    const groupedIds = new Set((record.groups || []).flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                    const ungrouped = (record.participant_ids || []).filter((id: string) => id && !groupedIds.has(id))
                                    if (ungrouped.length > 0) {
                                      nonEmpty.push(ungrouped.map((id: string) => {
                                        const daily = getDailyRole(id)
                                        return { name: getMemberName(id), roles: daily ? [daily] : [], present: dayVisits.some(v => v.id === id) }
                                      }))
                                    }
                                    return nonEmpty.map((parts: any, gi: number) => (
                                      <span key={gi}>
                                        {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                        {parts.map((m: any, i: number) => (
                                          <span key={i}>
                                            {i > 0 && <span className="inline-block w-[4px]" />}
                                            <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                            {m.roles.map((r: string, ri: number) => <span key={ri} className="inline-block ml-[-1px] pl-1 pr-[-1px] py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                          </span>
                                        ))}
                                      </span>
                                    ))
                                  })()
                                )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {record.start_time && <span className="text-[11px] text-[#8f959e] font-light">{record.start_time}</span>}
                            {record.start_time && record.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {record.end_time && <span className="text-[11px] text-[#8f959e] font-light">{record.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8faff] text-[#3370ff]">沙龙</span>
                              {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8fdf8] text-[#4caf50]">公益</span>}
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">{record.course_name}</span>
                              {getTeacherNames(record.teacher_ids).length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{getTeacherNames(record.teacher_ids).join("、")}</span>}
                            </div>
                            {record.course_description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{record.course_description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            {((record.groups || []).length === 0 && (record.participant_ids || []).length === 0) ? null : (
                              <div className="bg-gray-50 rounded p-[1px] flex-1">
                                <div className="bg-white rounded px-2 py-1.5 h-full flex items-center">
                                  <div className="text-[12px] text-[#4e535a]">
                                    {(() => {
                                      const dailyGroupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter(Boolean)))
                                      const getDailyRole = (id: string) => {
                                        for (const g of dailyGroups) {
                                          if (g.leader_id === id) return "组长"
                                          if (g.deputy_id === id) return "副组长"
                                        }
                                        return ""
                                      }
                                      const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = (record.groups || []).map((group: any) => {
                                        const members: { name: string; roles: string[]; present: boolean }[] = []
                                        const excludeIds = new Set([group.leader_id, group.deputy_id].filter(Boolean))
                                        if (group.leader_id) members.push({ name: getMemberName(group.leader_id), roles: ["组长"], present: dayVisits.some(v => v.id === group.leader_id) })
                                        if (group.deputy_id) members.push({ name: getMemberName(group.deputy_id), roles: ["副组长"], present: dayVisits.some(v => v.id === group.deputy_id) })
                                        group.member_ids.filter((id: string) => !excludeIds.has(id)).forEach((id: string) => {
                                          members.push({ name: getMemberName(id), roles: [], present: dayVisits.some(v => v.id === id) })
                                        })
                                        return members.length > 0 ? members : null
                                      }).filter(Boolean)
                                      const groupedIds = new Set((record.groups || []).flatMap((g: any) => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                      const ungrouped = (record.participant_ids || []).filter((id: string) => id && !groupedIds.has(id))
                                      if (ungrouped.length > 0) {
                                        nonEmpty.push(ungrouped.map((id: string) => {
                                          const daily = getDailyRole(id)
                                          return { name: getMemberName(id), roles: daily ? [daily] : [], present: dayVisits.some(v => v.id === id) }
                                        }))
                                      }
                                      return nonEmpty.map((members: any, gi: number) => (
                                        <span key={gi}>
                                          {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                          {members.map((m: any, i: number) => (
                                            <span key={i}>
                                              {i > 0 && <span className="inline-block w-[4px]" />}
                                              <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                              {m.roles.map((r: string, ri: number) => <span key={ri} className="inline-block ml-[-1px] pl-1 pr-[-1px] py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                            </span>
                                          ))}
                                        </span>
                                      ))
                                    })()}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenMemberDialog("class", record)}><Users className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                // ===== 觉醒游戏卡片 =====
                if (ur.type === "gcs") {
                  const s = ur.data
                  return (
                    <div
                      key={`gcs-${s.id}`}
                      className={`bg-white transition-shadow ${!standaloneTab && dragOverActivityId === `gcs-${s.id}` ? "ring-2 ring-[#3370ff] ring-inset" : ""}`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
                      onDragOver={!standaloneTab ? (e) => { e.preventDefault(); setDragOverActivityId(`gcs-${s.id}`) } : undefined}
                      onDragLeave={!standaloneTab ? () => setDragOverActivityId(null) : undefined}
                      onDrop={!standaloneTab ? (e) => {
                        e.preventDefault()
                        setDragOverActivityId(null)
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                          handleDropToGcs(s, data)
                        } catch {}
                      } : undefined}
                    >
                      {idx > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 pt-[12px] pb-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0 w-20">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8f5ff] text-[#7c5cfc] -ml-[11px]">觉醒</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">觉醒游戏</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{s.owner_name || getMemberName(s.owner_id) || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{s.achiever_name}</span>}
                              {isActivitiesView && <button className="ml-auto text-[11px] text-[#8f959e] hover:text-[#3370ff] transition-colors" onClick={() => onOpenMemberDialog("gcs", s)}>成员 ›</button>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGcsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGcsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setGcsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                            </div>
                          </div>
                          <div className="pl-[40px] pr-5 pb-[1px] pt-2.5 -mt-1">
                            <div className="flex items-start gap-1">
                              <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {(() => {
                                const allIds = new Set([s.host_id, s.achiever_id, ...(s.participant_ids || [])].filter((id: string) => id && id !== s.owner_id))
                                const getRoles = (id: string): string[] => {
                                  const roles: string[] = []
                                  if (id === s.host_id) roles.push("主持人")
                                  if (id === s.achiever_id) roles.push("达成者")
                                  for (const g of dailyGroups) {
                                    if (g.leader_id === id) { roles.push("组长"); break }
                                    if (g.deputy_id === id) { roles.push("副组长"); break }
                                  }
                                  return roles
                                }
                                const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = []
                                for (const g of dailyGroups) {
                                  const ids = [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter((id: string) => id && allIds.has(id))
                                  if (ids.length > 0) {
                                    nonEmpty.push(ids.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                  }
                                }
                                const groupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                const ungrouped = [...allIds].filter((id: string) => !groupedIds.has(id))
                                if (ungrouped.length > 0) {
                                  nonEmpty.push(ungrouped.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                }
                                if (nonEmpty.length === 0) return <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                                return nonEmpty.map((parts, gi) => (
                                  <span key={gi}>
                                    {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                    {parts.map((m, i) => (
                                      <span key={i}>
                                        {i > 0 && <span className="inline-block w-[4px]" />}
                                        <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                        {m.roles.map((r, ri) => <span key={ri} className="inline-block ml-[1px] px-1 py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                      </span>
                                    ))}
                                  </span>
                                ))
                              })()}
                            </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {s.start_time && <span className="text-[11px] text-[#8f959e] font-light">{s.start_time}</span>}
                            {s.start_time && s.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {s.end_time && <span className="text-[11px] text-[#8f959e] font-light">{s.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f8f5ff] text-[#7c5cfc]">觉醒</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">觉醒游戏</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{s.owner_name || getMemberName(s.owner_id) || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{s.achiever_name}</span>}
                            </div>
                            {s.description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {(() => {
                                  const allIds = new Set([s.host_id, s.achiever_id, ...(s.participant_ids || [])].filter((id: string) => id && id !== s.owner_id))
                                  const getRoles = (id: string): string[] => {
                                    const roles: string[] = []
                                    if (id === s.host_id) roles.push("主持人")
                                    if (id === s.achiever_id) roles.push("达成者")
                                    for (const g of dailyGroups) {
                                      if (g.leader_id === id) { roles.push("组长"); break }
                                      if (g.deputy_id === id) { roles.push("副组长"); break }
                                    }
                                    return roles
                                  }
                                  const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = []
                                  for (const g of dailyGroups) {
                                    const ids = [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter((id: string) => id && allIds.has(id))
                                    if (ids.length > 0) {
                                      nonEmpty.push(ids.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                    }
                                  }
                                  const groupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                  const ungrouped = [...allIds].filter((id: string) => !groupedIds.has(id))
                                  if (ungrouped.length > 0) {
                                    nonEmpty.push(ungrouped.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                  }
                                  if (nonEmpty.length === 0) return <span className="text-[#8f959e]">暂无</span>
                                  return nonEmpty.map((parts, gi) => (
                                    <span key={gi}>
                                      {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                      {parts.map((m, i) => (
                                        <span key={i}>
                                          {i > 0 && <span className="inline-block w-[4px]" />}
                                          <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                          {m.roles.map((r, ri) => <span key={ri} className="inline-block ml-[1px] px-1 py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                        </span>
                                      ))}
                                    </span>
                                  ))
                                })()}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenMemberDialog("gcs", s)}><Users className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                // ===== 情绪释放卡片 =====
                if (ur.type === "ers") {
                  const s = ur.data
                  return (
                    <div
                      key={`ers-${s.id}`}
                      className={`bg-white transition-shadow ${!standaloneTab && dragOverActivityId === `ers-${s.id}` ? "ring-2 ring-[#3370ff] ring-inset" : ""}`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
                      onDragOver={!standaloneTab ? (e) => { e.preventDefault(); setDragOverActivityId(`ers-${s.id}`) } : undefined}
                      onDragLeave={!standaloneTab ? () => setDragOverActivityId(null) : undefined}
                      onDrop={!standaloneTab ? (e) => {
                        e.preventDefault()
                        setDragOverActivityId(null)
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                          handleDropToErs(s, data)
                        } catch {}
                      } : undefined}
                    >
                      {idx > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 pt-[12px] pb-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0 w-20">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fff8f0] text-[#f59e0b] -ml-[11px]">情绪</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">情绪释放</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{s.owner_name || getMemberName(s.owner_id) || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">成就君：{s.achiever_name}</span>}
                              {isActivitiesView && <button className="ml-auto text-[11px] text-[#8f959e] hover:text-[#3370ff] transition-colors" onClick={() => onOpenMemberDialog("ers", s)}>成员 ›</button>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenErsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenErsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setErsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                            </div>
                          </div>
                          <div className="pl-[40px] pr-5 pb-[1px] pt-2.5 -mt-1">
                            <div className="flex items-start gap-1">
                              <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {(() => {
                                const allIds = new Set([s.host_id, ...(s.participant_ids || [])].filter((id: string) => id && id !== s.owner_id))
                                const getRoles = (id: string): string[] => {
                                  const roles: string[] = []
                                  if (id === s.host_id) roles.push("主持人")
                                  for (const g of dailyGroups) {
                                    if (g.leader_id === id) { roles.push("组长"); break }
                                    if (g.deputy_id === id) { roles.push("副组长"); break }
                                  }
                                  return roles
                                }
                                const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = []
                                for (const g of dailyGroups) {
                                  const ids = [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter((id: string) => id && allIds.has(id))
                                  if (ids.length > 0) {
                                    nonEmpty.push(ids.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                  }
                                }
                                const groupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                const ungrouped = [...allIds].filter((id: string) => !groupedIds.has(id))
                                if (ungrouped.length > 0) {
                                  nonEmpty.push(ungrouped.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                }
                                if (nonEmpty.length === 0) return <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                                return nonEmpty.map((parts, gi) => (
                                  <span key={gi}>
                                    {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                    {parts.map((m, i) => (
                                      <span key={i}>
                                        {i > 0 && <span className="inline-block w-[4px]" />}
                                        <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                        {m.roles.map((r, ri) => <span key={ri} className="inline-block ml-[1px] px-1 py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                      </span>
                                    ))}
                                  </span>
                                ))
                              })()}
                            </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {s.start_time && <span className="text-[11px] text-[#8f959e] font-light">{s.start_time}</span>}
                            {s.start_time && s.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {s.end_time && <span className="text-[11px] text-[#8f959e] font-light">{s.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fff8f0] text-[#f59e0b]">情绪</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">情绪释放</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{s.owner_name || getMemberName(s.owner_id) || "未分配"}</span>
                            </div>
                            {s.description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {(() => {
                                  const allIds = new Set([s.host_id, ...(s.participant_ids || [])].filter((id: string) => id && id !== s.owner_id))
                                  const getRoles = (id: string): string[] => {
                                    const roles: string[] = []
                                    if (id === s.host_id) roles.push("主持人")
                                    for (const g of dailyGroups) {
                                      if (g.leader_id === id) { roles.push("组长"); break }
                                      if (g.deputy_id === id) { roles.push("副组长"); break }
                                    }
                                    return roles
                                  }
                                  const nonEmpty: { name: string; roles: string[]; present: boolean }[][] = []
                                  for (const g of dailyGroups) {
                                    const ids = [g.leader_id, g.deputy_id, ...(g.member_ids || [])].filter((id: string) => id && allIds.has(id))
                                    if (ids.length > 0) {
                                      nonEmpty.push(ids.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                    }
                                  }
                                  const groupedIds = new Set(dailyGroups.flatMap(g => [g.leader_id, g.deputy_id, ...(g.member_ids || [])]).filter(Boolean))
                                  const ungrouped = [...allIds].filter((id: string) => !groupedIds.has(id))
                                  if (ungrouped.length > 0) {
                                    nonEmpty.push(ungrouped.map((id: string) => ({ name: getMemberName(id), roles: getRoles(id), present: dayVisits.some(v => v.id === id) })))
                                  }
                                  if (nonEmpty.length === 0) return <span className="text-[#8f959e]">暂无</span>
                                  return nonEmpty.map((parts, gi) => (
                                    <span key={gi}>
                                      {gi > 0 && <span className="inline-block w-[1.5px] h-[8px] bg-[#e8eaed] mx-[7px]" />}
                                      {parts.map((m, i) => (
                                        <span key={i}>
                                          {i > 0 && <span className="inline-block w-[4px]" />}
                                          <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                          {m.roles.map((r, ri) => <span key={ri} className="inline-block ml-[1px] px-1 py-0.5 rounded text-[10px] text-[#b0b5bb]">{r}</span>)}
                                        </span>
                                      ))}
                                    </span>
                                  ))
                                })()}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenMemberDialog("ers", s)}><Users className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                // ===== 能量结卡片 =====
                if (ur.type === "eks") {
                  const s = ur.data
                  let eksNames: string[] = []
                  let ownerDescs: {id: string; name: string; description: string}[] = []
                  try {
                    const items = JSON.parse(s.description || "[]")
                    if (Array.isArray(items)) {
                      ownerDescs = items
                      eksNames = items.map((d: any) => d.name).filter(Boolean)
                    }
                  } catch { /* empty */ }
                  const fallbackNames = (s.owner_name || "").split("、")
                  return (
                    <div
                      key={`eks-${s.id}`}
                      className={`bg-white transition-shadow ${!standaloneTab && dragOverActivityId === `eks-${s.id}` ? "ring-2 ring-[#3370ff] ring-inset" : ""}`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
                      onDragOver={!standaloneTab ? (e) => { e.preventDefault(); setDragOverActivityId(`eks-${s.id}`) } : undefined}
                      onDragLeave={!standaloneTab ? () => setDragOverActivityId(null) : undefined}
                      onDrop={!standaloneTab ? (e) => {
                        e.preventDefault()
                        setDragOverActivityId(null)
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                          handleDropToEks(s, data)
                        } catch {}
                      } : undefined}
                    >
                      {idx > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 pt-[12px] pb-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0 w-20">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fefce8] text-[#ca8a04] -ml-[11px]">能量</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">能量结</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : s.owner_name || "未分配"}</span>
                              {s.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{s.host_names.join("、")}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEksEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEksDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {s.start_time && <span className="text-[11px] text-[#8f959e] font-light">{s.start_time}</span>}
                            {s.start_time && s.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {s.end_time && <span className="text-[11px] text-[#8f959e] font-light">{s.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fefce8] text-[#ca8a04]">能量</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate ml-[3px]">能量结</span><span className="text-[12px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[12px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : s.owner_name || "未分配"}</span>
                              {s.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#fafbfc] text-[#787f88]">课程老师：{s.host_names.join("、")}</span>}
                            </div>
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }} />
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5" />
                        </div>
                      )}
                    </div>
                  )
                }

                // ===== 内部课程卡片 =====
                if (ur.type === "ics") {
                  const s = ur.data
                  return (
                    <div
                      key={`ics-${s.id}`}
                      className={`bg-white transition-shadow ${!standaloneTab && dragOverActivityId === `ics-${s.id}` ? "ring-2 ring-[#3370ff] ring-inset" : ""}`}
                      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
                      onDragOver={!standaloneTab ? (e) => { e.preventDefault(); setDragOverActivityId(`ics-${s.id}`) } : undefined}
                      onDragLeave={!standaloneTab ? () => setDragOverActivityId(null) : undefined}
                      onDrop={!standaloneTab ? (e) => {
                        e.preventDefault()
                        setDragOverActivityId(null)
                        try {
                          const data = JSON.parse(e.dataTransfer.getData("text/plain"))
                          handleDropToIcs(s, data)
                        } catch {}
                      } : undefined}
                    >
                      {idx > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 pt-[12px] pb-1 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0 w-20">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f0fdf4] text-[#22c55e]">内部</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate">{s.course_name}</span>
                              <span className="text-[12px] font-normal text-[#2b2f36]">丨课程老师：{s.host_names?.length > 0 ? s.host_names.join("、") : "暂无"}</span>
                              {s.course_type && <span className="text-[12px] text-[#4e535a]">{s.course_type}</span>}
                              {isActivitiesView && <button className="ml-auto text-[11px] text-[#8f959e] hover:text-[#3370ff] transition-colors" onClick={() => onOpenMemberDialog("ics", s)}>成员 ›</button>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenIcsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenIcsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIcsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                            </div>
                          </div>
                          <div className="pl-[40px] pr-5 pb-[1px] pt-2.5 -mt-1">
                            <div className="flex items-start gap-1">
                              <div className="flex-1 min-w-0">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {(() => {
                                const allIds = (s.participant_ids || []).filter((id: string) => id)
                                if (allIds.length === 0) return <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                                return allIds.map((id: string, i: number) => (
                                  <span key={id}>
                                    {i > 0 && <span className="inline-block w-[4px]" />}
                                    <span className={dayVisits.some(v => v.id === id) ? "" : "text-[#b0b5bb]"}>{getMemberName(id)}</span>
                                  </span>
                                ))
                              })()}
                            </div>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {s.start_time && <span className="text-[11px] text-[#8f959e] font-light">{s.start_time}</span>}
                            {s.start_time && s.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {s.end_time && <span className="text-[11px] text-[#8f959e] font-light">{s.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-normal bg-[#f0fdf4] text-[#22c55e]">内部</span>
                              <span className="text-[12px] font-medium text-[#2b2f36] truncate">{s.course_name}</span>
                              <span className="text-[12px] font-normal text-[#2b2f36]">丨课程老师：{s.host_names?.length > 0 ? s.host_names.join("、") : "暂无"}</span>
                              {s.course_type && <span className="text-[12px] text-[#4e535a]">{s.course_type}</span>}
                            </div>
                            {s.course_description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.course_description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {(() => {
                                  const allIds = (s.participant_ids || []).filter((id: string) => id)
                                  if (allIds.length === 0) return <span className="text-[#8f959e]">暂无</span>
                                  return allIds.map((id: string, i: number) => (
                                    <span key={id}>
                                      {i > 0 && <span className="inline-block w-[4px]" />}
                                      <span className={dayVisits.some(v => v.id === id) ? "" : "text-[#b0b5bb]"}>{getMemberName(id)}</span>
                                    </span>
                                  ))
                                })()}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onOpenMemberDialog("ics", s)}><Users className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                return null
              })}
              {visibleRecords.length > 0 && <div className="border-t border-[#f5f5f5] mx-5" />}
              {visibleCount < unifiedDetailRecords.length && (
                <div ref={sentinelRef} className="h-4" />
              )}
            </div>
  )
})

export default ActivityCardList
