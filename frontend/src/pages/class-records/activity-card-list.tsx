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
  memberDropdownId: string | null
  setMemberDropdownId: (id: string | null) => void
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
  handleMemberToggle: (type: string, record: any, visitorId: string) => void
  getTeacherNames: (teacherIds: string[]) => string[]
  getMemberName: (id: string) => string
  getCurrentParticipantIds: (type: string, record: any) => string[]
}

const ActivityCardList = memo((props: ActivityCardListProps) => {
  const {
    records: unifiedDetailRecords,
    isActivitiesView,
    standaloneTab,
    dayVisits,
    dragOverActivityId,
    setDragOverActivityId,
    memberDropdownId,
    setMemberDropdownId,
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
    handleMemberToggle,
    getTeacherNames,
    getMemberName,
    getCurrentParticipantIds,
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
<div className="divide-y divide-[#e8e8e8] border-y border-[#e8e8e8]">
                {visibleRecords.map((ur) => {
                  const typeLabel = ur.type === "class" ? "沙龙" : ur.type === "gcs" ? "觉醒" : ur.type === "ers" ? "情绪" : ur.type === "eks" ? "能量结" : "内部课"
                  const typeColor = ur.type === "class" ? "bg-blue-50 text-blue-600" : ur.type === "gcs" ? "bg-purple-50 text-purple-600" : ur.type === "ers" ? "bg-orange-50 text-orange-600" : ur.type === "eks" ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"

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
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0">{record.start_time ? `${record.start_time}~${record.end_time || ""}` : "未设置时间"}</span>
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>{typeLabel}</span>
                              {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e8f5e9] text-[#4caf50]">公益</span>}
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">{record.course_name}</span>
                              {getTeacherNames(record.teacher_ids).length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{getTeacherNames(record.teacher_ids).join("、")}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenMaterials(record)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEdit(record)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDeleteId(record.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                              {isActivitiesView && (
                                <div className="ml-auto relative">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMemberDropdownId(memberDropdownId === `class-${record.id}` ? null : `class-${record.id}`)}><Users className="h-3.5 w-3.5" /></Button>
                                  {memberDropdownId === `class-${record.id}` && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded shadow-sm w-44 max-h-56 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                                      {dayVisits.length === 0 ? (
                                        <p className="text-[11px] text-[#8f959e] text-center py-3">暂无到场人员</p>
                                      ) : (
                                        dayVisits.map(v => {
                                          const checked = getCurrentParticipantIds("class", record).includes(v.id)
                                          return (
                                            <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f7f8fa] cursor-pointer text-[12px]">
                                              <input type="checkbox" checked={checked} onChange={() => handleMemberToggle("class", record, v.id)} className="w-3.5 h-3.5 rounded border-[#d9d9d9]" />
                                              <span className="text-[#2b2f36]">{v.nickname}</span>
                                              {v.member_type && <span className="text-[10px] text-[#8f959e] ml-auto">{v.member_type}</span>}
                                            </label>
                                          )
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-5 pb-3 pt-0 -mt-1">
                            {(record.groups || []).length === 0 ? (
                              <span className="text-[11px] text-[#b0b5bb]">暂无分配</span>
                            ) : (
                              <div className="space-y-1">
                                {record.groups.map((group: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }, gi: number) => {
                                  const parts: { name: string; role?: string; present: boolean }[] = []
                                  const excludeIds = new Set([group.leader_id, group.deputy_id].filter(Boolean))
                                  if (group.leader_id) parts.push({ name: getMemberName(group.leader_id), role: "正", present: dayVisits.some(v => v.id === group.leader_id) })
                                  if (group.deputy_id) parts.push({ name: getMemberName(group.deputy_id), role: "副", present: dayVisits.some(v => v.id === group.deputy_id) })
                                  group.member_ids.filter((id: string) => !excludeIds.has(id)).forEach((id: string) => parts.push({ name: getMemberName(id), present: dayVisits.some(v => v.id === id) }))
                                  return parts.length > 0 ? (
                                    <div key={gi} className="text-[12px] text-[#4e535a] leading-relaxed">
                                      {record.groups.length > 1 && <span className="text-[10px] text-[#8f959e] mr-1.5">{group.name}</span>}
                                      {parts.map((m, i) => (
                                        <span key={i}>
                                          {i > 0 && "、"}
                                          <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                          {m.role && <span className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">{m.role}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  ) : null
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="flex">
                          <div className="shrink-0 w-16 flex flex-col items-center justify-center gap-1 px-2 py-3.5">
                            {record.start_time && <span className="text-[11px] text-[#8f959e] font-light">{record.start_time}</span>}
                            {record.start_time && record.end_time && <span className="text-[10px] text-[#c9cdd4]">~</span>}
                            {record.end_time && <span className="text-[11px] text-[#8f959e] font-light">{record.end_time}</span>}
                          </div>
                          <div className="flex-1 min-w-0 pl-3 pr-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>{typeLabel}</span>
                              {record.is_public_welfare && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#e8f5e9] text-[#4caf50]">公益</span>}
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">{record.course_name}</span>
                              {getTeacherNames(record.teacher_ids).length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{getTeacherNames(record.teacher_ids).join("、")}</span>}
                            </div>
                            {record.course_description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{record.course_description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            {(record.groups || []).length === 0 ? (
                              <div className="flex items-center justify-center py-4 flex-1"><span className="text-[12px] text-[#8f959e]">暂无分组</span></div>
                            ) : (
                              <div className="bg-gray-50 rounded p-[1px] flex-1">
                                <div className="space-y-1.5 bg-white rounded px-2 py-1.5 h-full">
                                  {record.groups.map((group: { name: string; member_ids: string[]; leader_id: string; deputy_id: string }, gi: number) => {
                                    const members: { name: string; role?: string; present: boolean }[] = []
                                    const excludeIds = new Set([group.leader_id, group.deputy_id].filter(Boolean))
                                    if (group.leader_id) members.push({ name: getMemberName(group.leader_id), role: "正", present: dayVisits.some(v => v.id === group.leader_id) })
                                    if (group.deputy_id) members.push({ name: getMemberName(group.deputy_id), role: "副", present: dayVisits.some(v => v.id === group.deputy_id) })
                                    group.member_ids.filter((id: string) => !excludeIds.has(id)).forEach((id: string) => members.push({ name: getMemberName(id), present: dayVisits.some(v => v.id === id) }))
                                    return members.length > 0 ? (
                                      <div key={gi} className="text-[12px] text-[#4e535a]">
                                        {record.groups.length > 1 && <span className="text-[10px] text-[#8f959e] mr-1">{group.name}</span>}
                                        {members.map((m, i) => (
                                          <span key={i}>
                                            {i > 0 && "、"}
                                            <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                            {m.role && <span className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">{m.role}</span>}
                                          </span>
                                        ))}
                                      </div>
                                    ) : null
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGroups(record)}><Users className="h-3.5 w-3.5" /></Button>
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
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600">觉醒</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">觉醒游戏</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{s.owner_name || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{s.achiever_name}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGcsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGcsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setGcsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                              {isActivitiesView && (
                                <div className="ml-auto relative">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMemberDropdownId(memberDropdownId === `gcs-${s.id}` ? null : `gcs-${s.id}`)}><Users className="h-3.5 w-3.5" /></Button>
                                  {memberDropdownId === `gcs-${s.id}` && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded shadow-sm w-44 max-h-56 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                                      {dayVisits.length === 0 ? (
                                        <p className="text-[11px] text-[#8f959e] text-center py-3">暂无到场人员</p>
                                      ) : (
                                        dayVisits.map(v => {
                                          const checked = getCurrentParticipantIds("gcs", s).includes(v.id)
                                          return (
                                            <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f7f8fa] cursor-pointer text-[12px]">
                                              <input type="checkbox" checked={checked} onChange={() => handleMemberToggle("gcs", s, v.id)} className="w-3.5 h-3.5 rounded border-[#d9d9d9]" />
                                              <span className="text-[#2b2f36]">{v.nickname}</span>
                                              {v.member_type && <span className="text-[10px] text-[#8f959e] ml-auto">{v.member_type}</span>}
                                            </label>
                                          )
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-5 pb-3 pt-0 -mt-1">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {(() => {
                                const parts: { name: string; roles: string[] }[] = []
                                const isOwnerHost = !!(s.owner_id && s.owner_id === s.host_id)
                                if (s.owner_name) parts.push({ name: s.owner_name, roles: isOwnerHost ? ["正", "主持人"] : ["正"] })
                                if (s.host_name && !isOwnerHost) parts.push({ name: s.host_name, roles: ["主持人"] })
                                ;(s.participant_ids || []).filter((id: string) => id !== s.owner_id && id !== s.host_id && id !== s.achiever_id).forEach((id: string) => parts.push({ name: getMemberName(id), roles: [] }))
                                if (parts.length === 0) return <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                                return parts.map((m, i) => (
                                  <span key={i}>
                                    {i > 0 && "、"}
                                    <span>{m.name}</span>
                                    {m.roles.map(r => (
                                      <span key={r} className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">{r}</span>
                                    ))}
                                  </span>
                                ))
                              })()}
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
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-600">觉醒</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">觉醒游戏</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{s.owner_name || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{s.achiever_name}</span>}
                            </div>
                            {s.description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {(() => {
                                  const parts: { name: string; roles: string[] }[] = []
                                  const isOwnerHost = !!(s.owner_id && s.owner_id === s.host_id)
                                  if (s.owner_name) parts.push({ name: s.owner_name, roles: isOwnerHost ? ["正", "主持人"] : ["正"] })
                                  if (s.host_name && !isOwnerHost) parts.push({ name: s.host_name, roles: ["主持人"] })
                                  ;(s.participant_ids || []).filter((id: string) => id !== s.owner_id && id !== s.host_id && id !== s.achiever_id).forEach((id: string) => parts.push({ name: getMemberName(id), roles: [] }))
                                  if (parts.length === 0) return <span className="text-[#8f959e]">暂无</span>
                                  return parts.map((m, i) => (
                                    <span key={i}>
                                      {i > 0 && "、"}
                                      <span>{m.name}</span>
                                      {m.roles.map(r => (
                                        <span key={r} className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">{r}</span>
                                      ))}
                                    </span>
                                  ))
                                })()}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenGcsMembers(s)}><Users className="h-3.5 w-3.5" /></Button>
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
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600">情绪</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">情绪释放</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{s.owner_name || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{s.achiever_name}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenErsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenErsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setErsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                              {isActivitiesView && (
                                <div className="ml-auto relative">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMemberDropdownId(memberDropdownId === `ers-${s.id}` ? null : `ers-${s.id}`)}><Users className="h-3.5 w-3.5" /></Button>
                                  {memberDropdownId === `ers-${s.id}` && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded shadow-sm w-44 max-h-56 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                                      {dayVisits.length === 0 ? (
                                        <p className="text-[11px] text-[#8f959e] text-center py-3">暂无到场人员</p>
                                      ) : (
                                        dayVisits.map(v => {
                                          const checked = getCurrentParticipantIds("ers", s).includes(v.id)
                                          return (
                                            <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f7f8fa] cursor-pointer text-[12px]">
                                              <input type="checkbox" checked={checked} onChange={() => handleMemberToggle("ers", s, v.id)} className="w-3.5 h-3.5 rounded border-[#d9d9d9]" />
                                              <span className="text-[#2b2f36]">{v.nickname}</span>
                                              {v.member_type && <span className="text-[10px] text-[#8f959e] ml-auto">{v.member_type}</span>}
                                            </label>
                                          )
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-5 pb-3 pt-0 -mt-1">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {(() => {
                                const parts: { name: string; role?: string; present: boolean }[] = []
                                if (s.host_name) parts.push({ name: s.host_name, role: "主持人", present: dayVisits.some(v => v.id === s.host_id) })
                                ;(s.participant_ids || []).filter((id: string) => id !== s.host_id && id !== s.achiever_id).forEach((id: string) => parts.push({ name: getMemberName(id), present: dayVisits.some(v => v.id === id) }))
                                if (parts.length === 0) return <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                                return parts.map((m, i) => (
                                  <span key={i}>
                                    {i > 0 && "、"}
                                    <span className={m.present ? "" : "text-[#b0b5bb]"}>{m.name}</span>
                                    {m.role && <span className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">{m.role}</span>}
                                  </span>
                                ))
                              })()}
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
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-50 text-orange-600">情绪</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">情绪释放</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{s.owner_name || "未分配"}</span>
                              {s.achiever_name && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">成就君：{s.achiever_name}</span>}
                            </div>
                            {s.description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {s.host_name && <span>{s.host_name}<span className="inline-block ml-1 px-1 py-0.5 rounded text-[10px] bg-gray-50 text-[#8f959e]">主持人</span></span>}
                                {s.host_name && s.participant_ids?.filter((id: string) => id !== s.host_id && id !== s.achiever_id).length > 0 && "、"}
                                {s.participant_ids?.filter((id: string) => id !== s.host_id && id !== s.achiever_id).length > 0 ? s.participant_ids.filter((id: string) => id !== s.host_id && id !== s.achiever_id).map((id: string) => getMemberName(id)).join("、") : (!s.host_name && <span className="text-[#8f959e]">暂无</span>)}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenErsMembers(s)}><Users className="h-3.5 w-3.5" /></Button>
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
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-600">能量</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">能量结</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : s.owner_name || "未分配"}</span>
                              {s.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{s.host_names.join("、")}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenEksEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEksDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                            </div>
                            {ownerDescs.filter(d => d.description).length > 0 && (
                              <div className="space-y-1">
                                {ownerDescs.filter(d => d.description).map((d, i) => (
                                  <p key={i} className="text-[11px] text-[#8f959e] font-light leading-relaxed">
                                    <span>{d.name || fallbackNames[i] || "未知"}：</span>{d.description}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="px-5 pb-3 pt-0 -mt-1">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {[...(s.host_names || []), ...(s.participant_ids || []).map((id: string) => getMemberName(id))].length > 0 ? (
                                [...(s.host_names || []), ...(s.participant_ids || []).map((id: string) => getMemberName(id))].join("、")
                              ) : (
                                <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                              )}
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
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-50 text-yellow-600">能量</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">能量结</span><span className="text-[14px] font-bold text-[#2b2f36] mx-0.5">·</span><span className="text-[14px] font-medium text-[#2b2f36]">{eksNames.length > 0 ? eksNames.join("、") : s.owner_name || "未分配"}</span>
                              {s.host_names?.length > 0 && <span className="inline-block ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-[#a0a5ac]">课程老师：{s.host_names.join("、")}</span>}
                            </div>
                            {ownerDescs.filter(d => d.description).length > 0 && (
                              <div className="space-y-1">
                                {ownerDescs.filter(d => d.description).map((d, i) => (
                                  <p key={i} className="text-[11px] text-[#8f959e] font-light leading-relaxed">
                                    <span>{d.name || fallbackNames[i] || "未知"}：</span>{d.description}
                                  </p>
                                ))}
                              </div>
                            )}
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
                      {isActivitiesView ? (
                        <>
                          <div className="px-5 py-3.5 space-y-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-[#8f959e] font-light shrink-0">{s.start_time ? `${s.start_time}~${s.end_time || ""}` : "未设置时间"}</span>
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">内部</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">{s.course_name}</span>
                              <span className="text-[14px] font-medium text-[#2b2f36]">丨课程老师：{s.host_names?.length > 0 ? s.host_names.join("、") : "暂无"}</span>
                              {s.course_type && <span className="text-[12px] text-[#4e535a]">{s.course_type}</span>}
                              {!isActivitiesView && (<div className="ml-auto flex items-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenIcsMaterials(s)}><FileUp className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenIcsEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setIcsDeleteId(s.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                              </div>)}
                              {isActivitiesView && (
                                <div className="ml-auto relative">
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setMemberDropdownId(memberDropdownId === `ics-${s.id}` ? null : `ics-${s.id}`)}><Users className="h-3.5 w-3.5" /></Button>
                                  {memberDropdownId === `ics-${s.id}` && (
                                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border rounded shadow-sm w-44 max-h-56 overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
                                      {dayVisits.length === 0 ? (
                                        <p className="text-[11px] text-[#8f959e] text-center py-3">暂无到场人员</p>
                                      ) : (
                                        dayVisits.map(v => {
                                          const checked = getCurrentParticipantIds("ics", s).includes(v.id)
                                          return (
                                            <label key={v.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-[#f7f8fa] cursor-pointer text-[12px]">
                                              <input type="checkbox" checked={checked} onChange={() => handleMemberToggle("ics", s, v.id)} className="w-3.5 h-3.5 rounded border-[#d9d9d9]" />
                                              <span className="text-[#2b2f36]">{v.nickname}</span>
                                              {v.member_type && <span className="text-[10px] text-[#8f959e] ml-auto">{v.member_type}</span>}
                                            </label>
                                          )
                                        })
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="px-5 pb-3 pt-0 -mt-1">
                            <div className="text-[12px] text-[#4e535a] leading-relaxed">
                              {s.participant_ids?.length > 0 ? (
                                s.participant_ids.map((id: string, i: number) => {
                                  const present = dayVisits.some(v => v.id === id)
                                  return (
                                    <span key={id}>
                                      {i > 0 && "、"}
                                      <span className={present ? "" : "text-[#b0b5bb]"}>{getMemberName(id)}</span>
                                    </span>
                                  )
                                })
                              ) : (
                                <span className="text-[11px] text-[#b0b5bb]">暂无参与者</span>
                              )}
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
                              <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600">内部</span>
                              <span className="text-[14px] font-medium text-[#2b2f36] truncate">{s.course_name}</span>
                              <span className="text-[14px] font-medium text-[#2b2f36]">丨课程老师：{s.host_names?.length > 0 ? s.host_names.join("、") : "暂无"}</span>
                              {s.course_type && <span className="text-[12px] text-[#4e535a]">{s.course_type}</span>}
                            </div>
                            {s.course_description && <p className="text-[11px] text-[#8f959e] font-light leading-relaxed">{s.course_description}</p>}
                          </div>
                          <div className="w-[470px] shrink-0 px-4 flex flex-col" style={{ paddingTop: 6, paddingBottom: 6 }}>
                            <div className="bg-gray-50 rounded p-[1px] flex-1">
                              <div className="text-[12px] text-[#4e535a] bg-white rounded px-2 py-1.5 h-full">
                                {s.participant_ids?.length > 0 ? s.participant_ids.map((id: string) => getMemberName(id)).join("、") : "暂无"}
                              </div>
                            </div>
                          </div>
                          <div className="shrink-0 grid grid-cols-1 items-center justify-items-center gap-1 px-2 py-3.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleOpenIcsMembers(s)}><Users className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }

                return null
              })}
              {visibleCount < unifiedDetailRecords.length && (
                <div ref={sentinelRef} className="h-4" />
              )}
            </div>
  )
})

export default ActivityCardList
