import { useEffect, useMemo, useState } from "react"

import { CustomerSearchInput } from "@/components/customer-search-input"
import { SelectDropdown } from "@/components/select-dropdown"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  classRecordApi,
  courseTypeApi,
  emotionalReleaseSessionApi,
  energyKnotSessionApi,
  groupCaseSessionApi,
  internalCourseSessionApi,
  visitApi,
} from "@/lib/api"
import type { AuditCheckCourseRow, AuditCheckVisitRow, CustomerLight } from "@/lib/api"

/** 内部课程的类型选项，与课表页保持一致 */
const ICS_COURSE_TYPES = ["疗愈师课程", "商业框架陪跑", "落地赋能班"]

export type AuditEditTarget =
  | { mode: "visit"; date: string; spaceId: string; locked: boolean; visit: AuditCheckVisitRow }
  | { mode: "course"; date: string; spaceId: string; locked: boolean; course: AuditCheckCourseRow }

type Draft = Record<string, string | boolean | string[]>

function Field({
  label,
  hint,
  disabledReason,
  children,
}: {
  label: string
  hint?: string
  disabledReason?: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[76px_1fr] items-start gap-3 py-2">
      {/* 32px 行高 + 垂直居中，和右侧 h-8 的输入框/下拉框/只读值在中线上对齐 */}
      <div className="flex h-8 items-center text-[12px] text-[#646a73]">{label}</div>
      <div className="min-w-0">
        {children}
        {disabledReason && <div className="mt-1 text-[11px] text-[#c9cdd4]">{disabledReason}</div>}
        {!disabledReason && hint && <div className="mt-1 text-[11px] text-[#8f959e]">{hint}</div>}
      </div>
    </div>
  )
}

const inputClass = "h-8 w-full rounded-[4px] border-[0.5px] border-[#e1e4e7] px-2 text-[12px] text-[#2b2f36] outline-none focus:border-[#b9cdf8]"

/** 核对页的单条编辑抽屉：只看一条，改完这一条就保存 */
export function AuditEditDrawer({
  target,
  customers,
  canEdit,
  onClose,
  onSaved,
}: {
  target: AuditEditTarget
  customers: CustomerLight[]
  canEdit: (field: string) => boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // 参与人候选：已选的人 + 当天有邀约的人（不是把全部客户都堆进去），并带上当天到店状态
  const [visitMap, setVisitMap] = useState<Record<string, { arrived: boolean; cancelled: boolean }> | null>(null)
  // 沙龙类型选项和课表页同一份（课程类型里去掉「其他」）
  const [salonTypes, setSalonTypes] = useState<string[]>([])
  // 下拉挂到抽屉内部渲染，避免浮层跑到抽屉外面去
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null)
  const visit = target.mode === "visit" ? target.visit : null
  const course = target.mode === "course" ? target.course : null

  useEffect(() => {
    if (!course) return
    let alive = true
    visitApi.list(target.date, undefined, target.spaceId || undefined)
      .then(rows => {
        if (!alive) return
        const map: Record<string, { arrived: boolean; cancelled: boolean }> = {}
        rows.forEach(row => {
          if (!row.customer_id) return
          const current = map[row.customer_id]
          map[row.customer_id] = {
            // 同一天有多条邀约时：到过场就算到场，全部取消才算取消
            arrived: Boolean(current?.arrived) || Boolean(row.arrived),
            cancelled: current ? current.cancelled && Boolean(row.cancelled) : Boolean(row.cancelled),
          }
        })
        setVisitMap(map)
      })
      .catch(() => { if (alive) setVisitMap(null) })
    return () => { alive = false }
  }, [course, target.date, target.spaceId])

  useEffect(() => {
    if (!course || course.activity_type !== "class") return
    courseTypeApi.list()
      .then(list => setSalonTypes(list.filter(item => item.category !== "other").map(item => item.name)))
      .catch(() => { /* 拿不到类型时下拉为空，仍可用名称字段 */ })
  }, [course])

  const buildDraft = (): Draft => {
    if (visit) {
      return {
        visit_time: visit.time,
        arrived: visit.arrived,
        is_leader: visit.is_leader,
        referrer_handler: visit.inviter,
        receptionist: visit.receptionist,
        goal: visit.goal,
        cancelled: visit.cancelled,
      }
    }
    return {
      start_time: course?.time || "",
      end_time: course?.end_time || "",
      activity_mode: course?.activity_mode || "线下",
      public_welfare: Boolean(course?.public_welfare),
      teacher_names: course?.teacher_names || [],
      participant_ids: course?.participant_ids || [],
      owner_name: course?.owner_name || "",
      name: course?.title || "",
      type_label: course?.type_label || "",
      body_parts: String(course?.body_parts || 0),
      deduction_count: String(course?.deduction_count ?? 0),
      intro: course?.intro || "",
      published: Boolean(course?.published),
    }
  }
  const [draft, setDraft] = useState<Draft>(buildDraft)

  const set = (field: string, value: string | boolean | string[]) => {
    setDraft(current => ({ ...current, [field]: value }))
  }

  const disabledReason = (field: string) => (canEdit(field) ? "" : (target.locked ? "当日已核对锁定，先解锁再改" : "当前账号不能修改这项"))

  const participantOptions = useMemo(() => {
    const selected = (draft.participant_ids as string[]) || []
    const selectedSet = new Set(selected)
    const nameOf = (id: string) => customers.find(item => item.id === id)?.nickname || id
    // 当天到店状态：已到场 / 未到场（当天没邀约记录就不标）
    const statusOf = (id: string) => {
      const entry = visitMap?.[id]
      if (!entry) return undefined
      if (entry.arrived) return "当天已到场"
      return entry.cancelled ? "当天已取消" : "当天未到场"
    }
    const options: Array<{ value: string; label: string; rightLabel?: string; groupLabel?: string }> = []
    selected.forEach((id, index) => {
      options.push({ value: id, label: nameOf(id), rightLabel: statusOf(id), groupLabel: index === 0 ? "已选" : undefined })
    })
    // 当天有邀约的人优先；这天没有任何邀约时退回全部客户，保证还能选人
    const invitedIds = visitMap ? Object.keys(visitMap) : []
    const pool = invitedIds.length > 0 ? invitedIds : customers.map(item => item.id)
    const poolLabel = invitedIds.length > 0 ? "当天有邀约的人" : "全部客户"
    let first = true
    pool.forEach(id => {
      if (selectedSet.has(id)) return
      options.push({ value: id, label: nameOf(id), rightLabel: statusOf(id), groupLabel: first ? poolLabel : undefined })
      first = false
    })
    return options
  }, [customers, visitMap, draft.participant_ids])

  const changed = useMemo(() => {
    if (visit) {
      return {
        visit_time: String(draft.visit_time || ""),
        arrived: Boolean(draft.arrived),
        is_leader: Boolean(draft.is_leader),
        referrer_handler: String(draft.referrer_handler || ""),
        receptionist: String(draft.receptionist || ""),
        goal: String(draft.goal || ""),
      }
    }
    const teacherNames = (draft.teacher_names as string[]) || []
    const teacherIds = teacherNames
      .map(name => customers.find(item => (item.nickname || "") === name || (item.name || "") === name)?.id || "")
      .filter(Boolean)
    const type = course?.activity_type || "class"
    const ownerId = customers.find(item => (item.nickname || "") === String(draft.owner_name || ""))?.id || ""
    const publicWelfare = Boolean(draft.public_welfare)
    // 和课表页同一套规则：能量结/内部课程/公益都不扣卡
    const deduction = (type === "eks" || type === "ics" || publicWelfare)
      ? 0
      : Math.max(0, Number(draft.deduction_count) || 0)
    const base: Record<string, unknown> = {
      start_time: String(draft.start_time || "") || null,
      end_time: String(draft.end_time || "") || null,
      activity_mode: String(draft.activity_mode || "线下"),
      is_published: Boolean(draft.published),
      teacher_ids: teacherIds,
      membership_deduction_count: deduction,
    }
    if (type === "class") {
      base.course_type = String(draft.type_label || "")
      base.course_name = String(draft.type_label || "")
      base.course_id = String(draft.type_label || "")
      base.activity_name = String(draft.name || "") === String(draft.type_label || "") ? "" : String(draft.name || "")
      base.course_description = String(draft.intro || "")
      base.is_public_welfare = publicWelfare
    } else if (type === "ics") {
      base.course_name = String(draft.name || "")
      base.course_type = String(draft.type_label || "")
      base.course_description = String(draft.intro || "")
    } else {
      base.name = String(draft.name || "")
      base.owner_id = ownerId
      base.owner_name = String(draft.owner_name || "")
      if (type === "eks") {
        base.course_description = String(draft.intro || "")
        // 能量结的部位数存在 description 的 JSON 里（和课表页同一种写法）
        base.description = JSON.stringify([{
          id: ownerId,
          name: String(draft.owner_name || ""),
          count: Math.max(1, Number(draft.body_parts) || 1),
        }])
      } else {
        base.description = String(draft.intro || "")
      }
    }
    return base
  }, [visit, course, draft, customers])

  const save = async () => {
    setSaving(true)
    setError("")
    try {
      if (visit) {
        const payload: Record<string, unknown> = {}
        if (String(draft.visit_time || "") !== visit.time) {
          payload.visit_time = String(draft.visit_time || "")
          if (draft.arrived) payload.arrival_time = String(draft.visit_time || "")
        }
        if (Boolean(draft.arrived) !== visit.arrived) {
          payload.arrived = Boolean(draft.arrived)
          payload.arrival_time = draft.arrived ? String(draft.visit_time || visit.time) : ""
        }
        if (Boolean(draft.is_leader) !== visit.is_leader) payload.is_leader = Boolean(draft.is_leader)
        if (String(draft.referrer_handler || "") !== visit.inviter) payload.referrer_handler = String(draft.referrer_handler || "")
        if (String(draft.receptionist || "") !== visit.receptionist) payload.receptionist = String(draft.receptionist || "")
        if (String(draft.goal || "") !== visit.goal) payload.goal = String(draft.goal || "")
        // 取消/恢复也是表单里的一个字段：同样要点保存才生效。
        // 后端要求取消/恢复必须单独提交，所以按方向决定先后顺序。
        const wantsCancelled = Boolean(draft.cancelled)
        const cancelledChanged = wantsCancelled !== visit.cancelled
        const applyFields = async () => {
          if (Object.keys(payload).length > 0) await visitApi.update(visit.id, payload)
        }
        if (visit.cancelled) {
          // 已取消的记录：先恢复 → 改内容 → 用户还要保持取消就再取消回去
          // （后端规定已取消的记录只允许「恢复」这一个动作）
          await visitApi.update(visit.id, { cancelled: false })
          await applyFields()
          if (wantsCancelled) await visitApi.update(visit.id, { cancelled: true })
        } else {
          await applyFields()
          if (cancelledChanged) await visitApi.update(visit.id, { cancelled: wantsCancelled })
        }
      } else if (course) {
        const recordId = course.id.split(":")[1] || ""
        const payload = { ...(changed as Record<string, unknown>) }
        const participantIds = (draft.participant_ids as string[]) || []
        if (course.activity_type === "class") {
          // 沙龙：参与者名单走专门接口（会同步分组、退课和报名记录）
          if (participantIds.join(",") !== (course.participant_ids || []).join(",")) {
            await classRecordApi.updateParticipants(recordId, participantIds)
          }
        } else {
          payload.participant_ids = participantIds
        }
        if (course.activity_type === "class") await classRecordApi.update(recordId, payload as never)
        else if (course.activity_type === "gcs") await groupCaseSessionApi.update(recordId, payload as never)
        else if (course.activity_type === "ers") await emotionalReleaseSessionApi.update(recordId, payload as never)
        else if (course.activity_type === "eks") await energyKnotSessionApi.update(recordId, payload as never)
        else await internalCourseSessionApi.update(recordId, payload as never)
      }
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-[440px] gap-0 p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b-[0.5px] border-[#f0f0f0] px-5 py-3">
          <SheetTitle className="text-[14px] font-normal text-[#1f2329]">
            {visit ? "编辑邀约" : `编辑${course?.activity_type_label || "活动"}`}
          </SheetTitle>
          <div className="text-[12px] text-[#8f959e]">
            {target.date}
            {visit ? ` · ${visit.nickname || "未填昵称"} · ${visit.time || "未填时间"}` : ` · ${course?.time || "未填时间"} · ${course?.title || ""}`}
            {target.locked && <span className="ml-2 text-[#d46b08]">当日已核对锁定</span>}
          </div>
        </SheetHeader>

        <div ref={setPortalEl} className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {visit ? (
            <>
              <Field label="时间" disabledReason={disabledReason("visit_time")}>
                <input type="time" value={String(draft.visit_time || "")} disabled={!canEdit("visit_time")} onChange={e => set("visit_time", e.target.value)} className={inputClass} />
              </Field>
              <Field label="昵称">
                <span className="inline-flex h-8 items-center text-[12px] text-[#4e535a]">{visit.nickname || "-"}</span>
              </Field>
              {/* 已取消的邀约不能确认到店：要确认就先取消「已取消邀约」那个勾 */}
              <Field
                label="到店"
                disabledReason={draft.cancelled ? "已取消邀约，先取消下面的勾选再确认到店" : disabledReason("arrived")}
              >
                <label className="inline-flex h-8 items-center gap-2 text-[12px] text-[#4e535a]">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.arrived)}
                    disabled={!canEdit("arrived") || Boolean(draft.cancelled)}
                    onChange={e => set("arrived", e.target.checked)}
                    className="h-4 w-4 accent-[#3370ff]"
                  />
                  已到店
                </label>
              </Field>
              <Field label="组长" disabledReason={disabledReason("is_leader")}>
                <SelectDropdown
                  value={draft.is_leader ? "1" : "0"}
                  options={[{ value: "0", label: "不是组长" }, { value: "1", label: "组长" }]}
                  onChange={value => set("is_leader", value === "1")}
                  size="sm"
                  disabled={!canEdit("is_leader")}
                  className="w-full"
                />
              </Field>
              <Field label="邀约人" disabledReason={disabledReason("referrer_handler")}>
                <CustomerSearchInput
                  customers={customers}
                  value={String(draft.referrer_handler || "")}
                  onChange={value => set("referrer_handler", typeof value === "string" ? value : value[0] || "")}
                  disabled={!canEdit("referrer_handler")}
                  placeholder="选择邀约人"
                  className="h-8"
                />
              </Field>
              <Field label="接待人" disabledReason={disabledReason("receptionist")}>
                <CustomerSearchInput
                  customers={customers}
                  value={String(draft.receptionist || "")}
                  onChange={value => set("receptionist", typeof value === "string" ? value : value[0] || "")}
                  disabled={!canEdit("receptionist")}
                  selectionOnly
                  placeholder="选择接待人"
                  className="h-8"
                />
              </Field>
              <Field label="目标" disabledReason={disabledReason("goal")}>
                <textarea
                  value={String(draft.goal || "")}
                  disabled={!canEdit("goal")}
                  onChange={e => set("goal", e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-[4px] border-[0.5px] border-[#e1e4e7] px-2 py-1.5 text-[12px] leading-5 text-[#2b2f36] outline-none focus:border-[#b9cdf8]"
                />
              </Field>
              <Field
                label="邀约状态"
                disabledReason={draft.arrived && !draft.cancelled ? "已到店，不能再取消" : disabledReason("cancelled")}
              >
                <label className="inline-flex h-8 items-center gap-2 text-[12px] text-[#4e535a]">
                  <input
                    type="checkbox"
                    checked={Boolean(draft.cancelled)}
                    disabled={!canEdit("cancelled") || (!draft.cancelled && Boolean(draft.arrived))}
                    onChange={event => set("cancelled", event.target.checked)}
                    className="h-4 w-4 accent-[#3370ff]"
                  />
                  已取消邀约
                </label>
              </Field>
            </>
          ) : course ? (
            <>
              <Field label="时间" disabledReason={disabledReason("start_time")}>
                <div className="flex items-center gap-2">
                  <input type="time" value={String(draft.start_time || "")} disabled={!canEdit("start_time")} onChange={e => set("start_time", e.target.value)} className={inputClass} />
                  <span className="text-[12px] text-[#8f959e]">至</span>
                  <input type="time" value={String(draft.end_time || "")} disabled={!canEdit("end_time")} onChange={e => set("end_time", e.target.value)} className={inputClass} />
                </div>
              </Field>
              <Field label="名称" disabledReason={disabledReason("name")}>
                <input value={String(draft.name || "")} disabled={!canEdit("name")} onChange={e => set("name", e.target.value)} className={inputClass} />
              </Field>
              {(course.activity_type === "class" || course.activity_type === "ics") && (
                <Field label="类型" disabledReason={disabledReason("course_type")}>
                  <SelectDropdown
                    value={String(draft.type_label || "")}
                    options={(course.activity_type === "class"
                      ? salonTypes
                      : ICS_COURSE_TYPES
                    ).map(name => ({ value: name, label: name }))}
                    onChange={value => set("type_label", value)}
                    disabled={!canEdit("course_type")}
                    placeholder="选择类型"
                    size="sm"
                    className="w-full"
                    dropdownWidth={180}
                  />
                </Field>
              )}
              <Field label="方式" disabledReason={disabledReason("activity_mode")}>
                <SelectDropdown
                  value={String(draft.activity_mode || "线下")}
                  options={[{ value: "线下", label: "线下" }, { value: "线上", label: "线上" }]}
                  onChange={value => set("activity_mode", value)}
                  disabled={!canEdit("activity_mode")}
                  size="sm"
                  className="w-full"
                  dropdownWidth={120}
                />
              </Field>
              <Field label="老师" disabledReason={disabledReason("teacher_ids")}>
                <CustomerSearchInput
                  customers={customers}
                  value={(draft.teacher_names as string[]) || []}
                  onChange={value => set("teacher_names", Array.isArray(value) ? value : [value])}
                  disabled={!canEdit("teacher_ids")}
                  multi
                  placeholder="选择老师"
                  className="h-8"
                />
              </Field>
              {course.activity_type !== "class" && course.activity_type !== "ics" && (
                <Field label="案主" disabledReason={disabledReason("owner_id")}>
                  <CustomerSearchInput
                    customers={customers}
                    value={String(draft.owner_name || "")}
                    onChange={value => set("owner_name", typeof value === "string" ? value : value[0] || "")}
                    disabled={!canEdit("owner_id")}
                    selectionOnly
                    placeholder="选择案主"
                    className="h-8"
                  />
                </Field>
              )}
              {course.activity_type === "eks" && (
                <Field label="部位数" hint="能量结按部位数销卡" disabledReason={disabledReason("deduction_count")}>
                  <input
                    type="number"
                    min={1}
                    value={String(draft.body_parts || "1")}
                    disabled={!canEdit("deduction_count")}
                    onChange={e => set("body_parts", e.target.value)}
                    className={inputClass}
                  />
                </Field>
              )}
              {course.activity_type === "class" && (
                <Field label="公益" hint="公益课不扣卡" disabledReason={disabledReason("is_public_welfare")}>
                  <label className="inline-flex h-8 items-center gap-2 text-[12px] text-[#4e535a]">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.public_welfare)}
                      disabled={!canEdit("is_public_welfare")}
                      onChange={e => set("public_welfare", e.target.checked)}
                      className="h-4 w-4 accent-[#3370ff]"
                    />
                    公益活动
                  </label>
                </Field>
              )}
              <Field
                label="扣卡次数"
                hint={course.activity_type === "eks" || course.activity_type === "ics" ? "这类活动不扣卡" : undefined}
                disabledReason={course.activity_type === "eks" || course.activity_type === "ics"
                  ? "能量结/内部课程不扣卡"
                  : disabledReason("membership_deduction_count")}
              >
                <input
                  type="number"
                  min={0}
                  value={course.activity_type === "eks" || course.activity_type === "ics" || draft.public_welfare ? "0" : String(draft.deduction_count || "0")}
                  disabled={course.activity_type === "eks" || course.activity_type === "ics" || Boolean(draft.public_welfare) || !canEdit("membership_deduction_count")}
                  onChange={e => set("deduction_count", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="参与人"
                hint={course.activity_type === "class" ? "改动会同步到课表的分组和报名记录" : undefined}
                disabledReason={disabledReason("participant_ids")}
              >
                <SelectDropdown
                  multi
                  value={(draft.participant_ids as string[]) || []}
                  options={participantOptions}
                  onChange={value => set("participant_ids", Array.isArray(value) ? value : [value])}
                  disabled={!canEdit("participant_ids")}
                  placeholder="选择参与人（可多选）"
                  // 不用 size="sm"：那个尺寸按钮是固定高度，选中的人一多会溢出
                  className="w-full"
                  dropdownWidth={260}
                  menuMaxHeight={260}
                  portalContainer={portalEl}
                />
              </Field>
              <Field label="简介" disabledReason={disabledReason("description")}>
                <textarea
                  value={String(draft.intro || "")}
                  disabled={!canEdit("description")}
                  onChange={e => set("intro", e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-[4px] border-[0.5px] border-[#e1e4e7] px-2 py-1.5 text-[12px] leading-5 text-[#2b2f36] outline-none focus:border-[#b9cdf8]"
                />
              </Field>
              <Field label="发布" hint="发布后客户端能看到这场活动" disabledReason={disabledReason("is_published")}>
                <label className="inline-flex h-8 items-center gap-2 text-[12px] text-[#4e535a]">
                  <input type="checkbox" checked={Boolean(draft.published)} disabled={!canEdit("is_published")} onChange={e => set("published", e.target.checked)} className="h-4 w-4 accent-[#3370ff]" />
                  已发布
                </label>
              </Field>
            </>
          ) : null}
        </div>

        {error && <div className="px-5 pb-1 text-[12px] text-[#d4380d]">{error}</div>}

        <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-[#f0f0f0] px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="h-8 w-[88px] rounded-[4px] border-[0.5px] border-[#e1e4e7] bg-white text-[12px] font-normal text-[#646a73] shadow-none hover:bg-[#f7f8fa]">取消</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving} className="h-8 w-[96px] rounded-[4px] border border-[#3370ff] bg-[#3370ff] text-[12px] font-normal text-white shadow-none hover:border-[#285dcc] hover:bg-[#285dcc]">
            {saving ? "保存中" : "保存"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
