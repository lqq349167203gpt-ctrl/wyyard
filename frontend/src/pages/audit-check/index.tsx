import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, Check, Info, Unlock } from "lucide-react"

import { AnalysisPeriodFilter } from "@/components/analysis-period-filter"
import { confirmDialog } from "@/components/confirm-dialog"
import { SelectDropdown } from "@/components/select-dropdown"
import { SpaceDropdown } from "@/components/space-dropdown"
import { Button } from "@/components/ui/button"
import { useEditPermissions } from "@/hooks/use-edit-permissions"
import {
  activityThemeApi, auditCheckApi, customerApi, spaceApi, visitVerificationApi,
} from "@/lib/api"
import type {
  AuditCheckCourseRow, AuditCheckDay, AuditCheckItem, AuditCheckResult, AuditCheckVisitRow, CustomerLight, Space,
} from "@/lib/api"
import { monthRange } from "@/lib/date-ranges"
import { AuditEditDrawer, type AuditEditTarget } from "@/pages/audit-check/edit-drawer"

type AuditCheckMode = "course" | "visit"

const MODE_META: Record<AuditCheckMode, { title: string; pageName: string; rules: string }> = {
  course: {
    title: "课表",
    pageName: "课表",
    rules: "核对信息默认从 2026-07-01 起算；以下信息不被锁定影响：课程复盘",
  },
  visit: {
    title: "邀约",
    pageName: "邀约",
    rules: "核对信息默认从 2026-07-01 起算；以下信息不被锁定影响：来访需求、客户信息、跟进点",
  },
}

const MODES: Array<{ mode: AuditCheckMode; title: string }> = [
  { mode: "course", title: "课表" },
  { mode: "visit", title: "邀约" },
]

/** 核对状态筛选：默认停在「未核对」，核对完的会从这个列表里走掉 */
const CHECK_FILTERS = [
  { value: "unchecked", label: "未核对" },
  { value: "checked", label: "已核对" },
]

const EMPTY_DASH = <span className="text-[#d0d3d6]">-</span>

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

function readStorage(key: string): string {
  try {
    return localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 存不了就按默认走 */
  }
}

function readSavedKinds(key: string): string[] | null {
  const raw = readStorage(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : null
  } catch {
    return null
  }
}

/** 核对状态筛选：只认 未核对 / 已核对，老的存档值一律按默认（未核对）处理 */
function readCheckFilter(key: string): string {
  const value = readStorage(key)
  return value === "checked" || value === "unchecked" ? value : "unchecked"
}

function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return `${value.slice(5)} 周${WEEKDAYS[date.getDay()]}`
}

function formatTime(time: string, endTime = ""): string {
  if (!time) return ""
  return endTime ? `${time}~${endTime}` : time
}

/** 缺失的字段：单元格浅红底 + 红字；没填的字段直接显示缺失项名称 */
function Cell({
  value,
  missing,
  label,
  width,
  clamp = 2,
  onEdit,
}: {
  value: string
  missing?: boolean
  label?: string
  /** 列宽按百分比走，保证整表不超出页面宽度 */
  width: string
  clamp?: number
  /** 传了就说明这格能改：点一下打开这一条的编辑抽屉 */
  onEdit?: () => void
}) {
  const shape = { display: "-webkit-box", WebkitLineClamp: clamp, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }
  const content = value ? (
    <span
      className={`break-words text-[12px] leading-5 ${missing ? "text-[#d4380d]" : "text-[#4e535a]"}`}
      style={shape}
      title={value}
    >
      {value}
    </span>
  ) : missing ? (
    // 缺失只用小标签标出来，整格不复底色
    <span className="inline-block rounded-[3px] bg-[#fff1f0] px-1.5 py-0.5 text-[11px] leading-4 text-[#d4380d]">{label || "缺失"}</span>
  ) : (
    EMPTY_DASH
  )
  return (
    <td className="px-2 py-2 align-top" style={{ width }}>
      {onEdit ? (
        <button type="button" onClick={onEdit} className="block w-full text-left hover:opacity-80" title="点一下编辑这一条">
          {content}
        </button>
      ) : content}
    </td>
  )
}

function AuditCheckView({ mode, onModeChange }: { mode: AuditCheckMode; onModeChange: (mode: AuditCheckMode) => void }) {
  const meta = MODE_META[mode]
  const editPermissions = useEditPermissions()
  const initialRange = useMemo(() => monthRange(), [])
  const kindsKey = `audit-check-kinds-${mode}`
  const dayFilterKey = `audit-check-filter-${mode}`

  const [spaces, setSpaces] = useState<Space[]>([])
  const [spaceId, setSpaceId] = useState(() => readStorage("selected-space-id"))
  const [items, setItems] = useState<AuditCheckItem[]>([])
  const [checkedKeys, setCheckedKeys] = useState<string[]>([])
  // 两个页签各自记住自己的筛选（切换页签不用重新挑）
  const [filters, setFilters] = useState<Record<AuditCheckMode, { check: string }>>(() => ({
    course: { check: readCheckFilter("audit-check-filter-course") },
    visit: { check: readCheckFilter("audit-check-filter-visit") },
  }))
  const checkFilter = filters[mode].check
  const [dateFrom, setDateFrom] = useState(initialRange.date_from)
  const [dateTo, setDateTo] = useState(initialRange.date_to)
  const [keyword, setKeyword] = useState("")
  const [result, setResult] = useState<AuditCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [customers, setCustomers] = useState<CustomerLight[]>([])
  const [editTarget, setEditTarget] = useState<AuditEditTarget | null>(null)
  const requestSeq = useRef(0)

  // 核对页的编辑不再看「仅创建人」这类限制（后端对持有信息核对权限的账号同样放行），
  // 只看两点：当天是否已核对锁定、邀约是否已取消
  // 核对页是负责人审核用的：不管邀约是不是已取消，这一条的所有信息都能改（只受核对锁限制）
  const canEditVisitRow = (_row: AuditCheckVisitRow, locked: boolean) => !locked
  const canEditCourseRow = (_row: AuditCheckCourseRow, locked: boolean) => !locked

  useEffect(() => {
    customerApi.light().then(setCustomers).catch(() => { /* 选人下拉没有数据时仍可看列表 */ })
  }, [])

  const canLock = mode === "course" ? editPermissions.activity_lock : editPermissions.visit_lock

  const kindOptions = useMemo(
    () => items.map(item => ({ value: item.key, label: item.label })),
    [items],
  )

  // 检查项目录（含默认勾选项）来自后端；两个页签各自记住自己改过的勾选
  useEffect(() => {
    let alive = true
    auditCheckApi.catalog(mode)
      .then(response => {
        if (!alive) return
        setItems(response.items)
        setCheckedKeys(readSavedKinds(kindsKey) ?? response.defaults)
      })
      .catch(() => { /* 目录拿不到时按空处理，页面仍可看核对状态 */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    spaceApi.list()
      .then(list => {
        setSpaces(list)
        setSpaceId(current => {
          const next = current && list.some(item => item.id === current) ? current : (list[0]?.id || "")
          if (next) writeStorage("selected-space-id", next)
          return next
        })
      })
      .catch(() => { /* 空间列表失败时保持当前选择 */ })
  }, [])

  const setCheckFilter = (value: string) => {
    writeStorage(dayFilterKey, value)
    setFilters(current => ({ ...current, [mode]: { check: value } }))
  }

  const load = useCallback(async () => {
    if (!spaceId || !dateFrom || !dateTo) return
    const seq = ++requestSeq.current
    setLoading(true)
    setError("")
    try {
      const response = await auditCheckApi.list({
        start_date: dateFrom,
        end_date: dateTo,
        space_id: spaceId,
        scope: mode,
        kinds: checkedKeys,
      })
      if (seq !== requestSeq.current) return
      setResult(response)
    } catch (e) {
      if (seq !== requestSeq.current) return
      setResult(null)
      setError(e instanceof Error ? e.message : "加载失败")
    } finally {
      if (seq === requestSeq.current) setLoading(false)
    }
  }, [spaceId, dateFrom, dateTo, mode, checkedKeys])

  useEffect(() => { void load() }, [load])

  const handleSpaceSelect = (id: string) => {
    setSpaceId(id)
    writeStorage("selected-space-id", id)
  }

  const handleToggleKind = (keys: string[]) => {
    setCheckedKeys(keys)
    writeStorage(kindsKey, JSON.stringify(keys))
  }

  const toggleLock = async (day: AuditCheckDay) => {
    const block = mode === "course" ? day.course : day.visit
    if (!block || !spaceId || busy) return
    const locked = mode === "course" ? (day.course?.locked ?? false) : (day.visit?.verified ?? false)
    const confirmed = await confirmDialog(locked ? {
      title: `解锁 ${day.date} 的${meta.pageName}？`,
      description: `解锁后当天该空间的${meta.pageName}可以继续修改。`,
      hint: "是否继续解锁？",
      confirmText: "解锁",
    } : {
      title: `确认核对 ${day.date} 的${meta.pageName}？`,
      hint: mode === "course"
        ? "锁定后当天该空间的活动将不能修改（课程复盘除外）"
        : "锁定后当天该空间的邀约资料将不能修改（来访需求、客户信息、跟进点除外）",
      confirmText: "确认核对",
    })
    if (!confirmed) return
    setBusy(true)
    try {
      if (mode === "course") {
        const response = locked
          ? await activityThemeApi.unlock(day.date, spaceId)
          : await activityThemeApi.lock(day.date, spaceId)
        patchDay(day.date, { locked: response.is_locked === true, operator: response.locked_by || "" })
      } else {
        const response = locked
          ? await visitVerificationApi.unverify(day.date, spaceId)
          : await visitVerificationApi.verify(day.date, spaceId)
        patchDay(day.date, { locked: response.is_verified === true, operator: response.verified_by || "" })
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "操作失败")
    } finally {
      setBusy(false)
    }
  }

  const patchDay = (date: string, patch: { locked: boolean; operator: string }) => {
    setResult(previous => {
      if (!previous) return previous
      const days = previous.days.map(day => {
        if (day.date !== date) return day
        if (mode === "course" && day.course) {
          const course = { ...day.course, locked: patch.locked, locked_by: patch.operator }
          return { ...day, course, unchecked: !course.locked }
        }
        if (mode === "visit" && day.visit) {
          const visit = { ...day.visit, verified: patch.locked, verified_by: patch.operator }
          return { ...day, visit, unchecked: !visit.verified }
        }
        return day
      })
      return {
        ...previous,
        days,
        summary: { ...previous.summary, unchecked_day_count: days.filter(day => day.unchecked).length },
      }
    })
  }

  const visibleDays = useMemo(() => {
    const days = result?.days ?? []
    const needle = keyword.trim().toLowerCase()
    return days.filter(day => {
      if (checkFilter === "unchecked" ? !day.unchecked : day.unchecked) return false
      if (!needle) return true
      const rows = mode === "course" ? (day.course?.rows ?? []) : (day.visit?.rows ?? [])
      return rows.some(row => {
        const text = mode === "course"
          ? `${(row as AuditCheckCourseRow).title} ${(row as AuditCheckCourseRow).teacher_names.join(" ")} ${(row as AuditCheckCourseRow).owner_name} ${(row as AuditCheckCourseRow).participant_names.join(" ")}`
          : `${(row as AuditCheckVisitRow).nickname} ${(row as AuditCheckVisitRow).inviter} ${(row as AuditCheckVisitRow).receptionist} ${(row as AuditCheckVisitRow).goal}`
        return text.toLowerCase().includes(needle)
      })
    })
  }, [result, checkFilter, keyword, mode])

  const summary = result?.summary

  const courseColumns = [
    // 时间加宽一点，19:30~21:00 这种能一行放下；短内容的列收窄，省下来的都给参与人
    { key: "time", label: "时间", width: "9%" },
    { key: "type", label: "类型", width: "7%" },
    { key: "title", label: "活动名称", width: "13%" },
    { key: "teacher", label: "老师", width: "9%" },
    { key: "owner", label: "案主", width: "7%" },
    { key: "body_parts", label: "部位", width: "4.5%" },
    { key: "mode", label: "方式", width: "4.5%" },
    { key: "deduction", label: "扣卡", width: "5.5%" },
    { key: "intro", label: "简介", width: "14%" },
    { key: "participants", label: "参与人", width: "16.5%" },
    { key: "publish", label: "发布", width: "5%" },
    { key: "action", label: "操作", width: "5%" },
  ]

  const visitColumns = [
    { key: "time", label: "时间", width: "7%" },
    { key: "nickname", label: "昵称", width: "12%" },
    { key: "leader", label: "组长", width: "5%" },
    { key: "arrived", label: "到店", width: "10%" },
    { key: "inviter", label: "邀约人", width: "10%" },
    { key: "receptionist", label: "接待人", width: "10%" },
    { key: "goal", label: "目标", width: "18%" },
    { key: "group_leader", label: "所属组长", width: "10%" },
    { key: "creator", label: "创建人", width: "9%" },
    { key: "action", label: "操作", width: "9%" },
  ]

  const columns = mode === "course" ? courseColumns : visitColumns

  const renderCourseRow = (row: AuditCheckCourseRow, date: string, locked: boolean) => {
    const has = (key: string) => row.kinds.includes(key)
    const canEditRow = canEditCourseRow(row, locked)
    const openDrawer = () => setEditTarget({ mode: "course", date, spaceId, locked, course: row })
    // 统一走编辑抽屉：点任意一格都是打开这一条的编辑，不在格子里弹输入框
    const cellEdit = canEditRow ? openDrawer : undefined
    return (
      <tr key={row.id} className="border-t border-[#f5f6f7]" onDoubleClick={() => canEditRow && openDrawer()}>
        <Cell
          width="6.5%"
          value={formatTime(row.time, row.end_time)}
          missing={has("course_time")}
          label="缺时间"
          onEdit={cellEdit}
        />
        <Cell width="7%" value={row.type_label} missing={has("course_type")} label="缺类型" onEdit={cellEdit} />
        <Cell width="11%" value={row.title} missing={has("course_name")} label="缺名称" onEdit={cellEdit} />
        <Cell width="8%" value={row.teacher_names.join("、")} missing={has("course_teacher")} label="缺老师" onEdit={cellEdit} />
        <Cell width="8%" value={row.owner_name} missing={has("course_owner")} label="缺案主" onEdit={cellEdit} />
        <Cell width="4%" value={row.body_parts ? `${row.body_parts}` : ""} missing={has("course_body_parts")} label="缺部位" />
        <Cell width="4.5%" value={row.activity_mode} />
        <Cell
          width="5%"
          value={row.public_welfare ? "公益" : (row.deduction_count ? `${row.deduction_count} 次` : "")}
          missing={has("course_zero_deduction")}
          label="0 次"
          // 扣卡次数统一在编辑抽屉里改，不在格子里弹输入框
          onEdit={canEditRow ? openDrawer : undefined}
        />
        <Cell width="12%" value={row.intro} missing={has("course_intro")} label="缺简介" onEdit={cellEdit} />
        <Cell
          width="12%"
          value={row.participant_names.length > 0 ? `${row.participant_names.length} 人：${row.participant_names.join("、")}` : ""}
          missing={has("course_no_participant")}
          label="无参与人"
          onEdit={canEditRow ? openDrawer : undefined}
        />
        <td className="px-2 py-2 align-top" style={{ width: "6%" }}>
          <span className={`text-[12px] ${row.published ? "text-[#4e535a]" : has("course_publish") ? "text-[#d4380d]" : "text-[#8f959e]"}`}>
            {row.published ? "已发布" : "未发布"}
          </span>
        </td>
        <td className="px-2 py-2 align-top" style={{ width: "5%" }}>
          {canEditRow && (
            <button type="button" onClick={openDrawer} className="whitespace-nowrap text-[12px] text-[#3370ff] hover:underline">编辑</button>
          )}
        </td>
      </tr>
    )
  }

  const renderVisitRow = (row: AuditCheckVisitRow, date: string, locked: boolean) => {
    const has = (key: string) => row.kinds.includes(key)
    const canEditRow = canEditVisitRow(row, locked)
    const openDrawer = () => setEditTarget({ mode: "visit", date, spaceId, locked, visit: row })
    // 统一走编辑抽屉：点任意一格都是打开这一条的编辑，不在格子里弹输入框
    const cellEdit = canEditRow ? openDrawer : undefined
    return (
      <tr
        key={row.id}
        // 已取消的行只把内容淡化，操作列的「编辑」保持正常颜色（和邀约页一致）
        className={`border-t border-[#f5f6f7] ${row.cancelled ? "[&>td:not(:last-child)]:opacity-55" : ""}`}
        onDoubleClick={() => canEditRow && openDrawer()}
      >
        <Cell
          width="7%"
          value={row.time}
          missing={has("visit_time")}
          label="缺时间"
          onEdit={cellEdit}
        />
        <Cell width="12%" value={row.nickname} missing={has("visit_nickname")} label="缺昵称" onEdit={cellEdit} />
        <Cell width="5%" value={row.is_leader ? "组长" : ""} onEdit={cellEdit} />
        <Cell
          width="10%"
          value={row.cancelled ? "已取消" : (row.arrived ? `已到店${row.arrival_time ? ` ${row.arrival_time}` : ""}` : "未到店")}
          missing={has("visit_not_arrived")}
          label="未确认到店"
          onEdit={cellEdit}
        />
        <Cell width="10%" value={row.inviter} missing={has("visit_inviter")} label="缺邀约人" onEdit={cellEdit} />
        <Cell width="10%" value={row.receptionist} missing={has("visit_receptionist")} label="缺接待人" onEdit={cellEdit} />
        <Cell
          width="18%"
          value={row.goal}
          missing={has("visit_goal")}
          label="缺目标"
          onEdit={cellEdit}
        />
        <Cell width="10%" value={row.leader_name} missing={has("visit_leader")} label="缺组长" />
        <Cell width="9%" value={row.creator} />
        <td className="px-2 py-2 align-top" style={{ width: "9%" }}>
          {(canEditRow || row.cancelled) && (
            <button type="button" onClick={openDrawer} className="whitespace-nowrap text-[12px] text-[#3370ff] hover:underline">编辑</button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="min-h-full bg-[#f4f5f6] p-4 pb-6">
      {/* tab 栏：样式与付费项目页一致，最右边选空间 */}
      <div className="mb-3 flex h-[52px] items-center rounded-xl bg-white px-5 shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        <div className="flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {MODES.map(tab => {
            const active = tab.mode === mode
            return (
              <button
                key={tab.mode}
                type="button"
                onClick={() => onModeChange(tab.mode)}
                className={`relative whitespace-nowrap px-1 pb-0 text-[14px] transition-colors ${active ? "text-[#3370ff]" : "text-[#2b2f36] hover:text-[#4e535a]"}`}
              >
                {tab.title}
                {active && <span className="absolute bottom-[-16px] left-0 right-0 h-[3px] rounded-t-sm bg-[#3370ff]" />}
              </button>
            )
          })}
        </div>
        <div className="ml-4 shrink-0">
          <SpaceDropdown spaces={spaces} selectedSpaceId={spaceId} onSelect={handleSpaceSelect} />
        </div>
      </div>

      {/* 不加 overflow-hidden：筛选栏里的下拉要能盖在下面的列表上 */}
      <div className="mb-3 rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
        {/* 第一行：只看时间范围 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-2.5">
          <span className="w-[52px] shrink-0 text-[12px] text-[#8f959e]">统计周期</span>
          <AnalysisPeriodFilter
            variant="inline"
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={range => { setDateFrom(range.date_from); setDateTo(range.date_to) }}
          />
        </div>

        {/* 第二行：其它筛选条件 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[#f0f0f0] px-4 py-2.5">
          <span className="w-[52px] shrink-0 text-[12px] text-[#8f959e]">筛选</span>
          <SelectDropdown
            multi
            singleLineMulti
            value={checkedKeys}
            options={kindOptions}
            onChange={handleToggleKind}
            placeholder="选择缺失项"
            size="sm"
            className="w-[220px]"
            dropdownWidth={240}
          />
          <input
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
            placeholder={mode === "course" ? "搜索活动、老师" : "搜索昵称、邀约人"}
            className="h-7 w-[150px] rounded-[4px] border-[0.5px] border-[#e1e4e7] px-2 text-[12px] text-[#2b2f36] outline-none placeholder:text-[#b0b5bb] focus:border-[#b9cdf8]"
          />
          <div className="flex-1" />
          <div className="flex items-center gap-0.5 rounded-[4px] border border-[#dee0e3] bg-white p-0.5">
            {CHECK_FILTERS.map(option => {
              const selected = checkFilter === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setCheckFilter(option.value)}
                  className={`h-6 rounded-[3px] px-2 text-[12px] transition-colors ${selected ? "bg-[#1f2329] text-white" : "text-[#646a73] hover:bg-[#f5f6f7]"}`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 统计结果和锁定说明同一行 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#f0f0f0] px-4 py-2 text-[12px] text-[#8f959e]">
          {/* 锁定说明在左 */}
          <span className="flex min-w-0 items-center gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate" title={meta.rules}>{meta.rules}</span>
          </span>
          {/* 统计值在右 */}
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
          {loading && <span>加载中...</span>}
          {!loading && error && (
            <span className="flex items-center gap-2 text-[#d4380d]">
              <AlertCircle className="h-3.5 w-3.5" />{error}
              <Button variant="outline" size="sm" className="h-6 rounded-[3px] px-2 text-[12px] font-normal" onClick={() => void load()}>重试</Button>
            </span>
          )}
          {!loading && !error && summary && (
            <>
              <span>缺失 {summary.missing_count} 条 / 涉及 {summary.missing_day_count} 天</span>
              {result && (result.start_date !== dateFrom || result.end_date !== dateTo) && (
                <span className="rounded-[3px] bg-[#f2f3f5] px-1.5 py-0.5 text-[11px] text-[#646a73]">
                  实际核对 {result.start_date} ~ {result.end_date}
                </span>
              )}
              {summary.unchecked_day_count > 0 && (
                <span className="flex items-center gap-1 rounded-[3px] bg-[#fff7e6] px-1.5 py-0.5 text-[11px] text-[#d46b08]">
                  <AlertCircle className="h-3 w-3" />{summary.unchecked_day_count} 天未核对
                </span>
              )}
            </>
          )}
          </div>
        </div>
      </div>

      {!loading && !error && visibleDays.length === 0 && (
        <div className="rounded-xl bg-white py-16 text-center text-[13px] text-[#8f959e] shadow-[0_1px_3px_rgba(33,38,49,.06)]">
          {result && result.days.length > 0
            ? (checkFilter === "unchecked" ? "所选范围内没有未核对的天了" : "所选范围内还没有已核对的天")
            : "所选范围在核对起算日（2026-07-01）之前，没有需要核对的天"}
        </div>
      )}

      <div className="space-y-3">
        {visibleDays.map(day => {
          const block = mode === "course" ? day.course : day.visit
          if (!block) return null
          const locked = mode === "course" ? (day.course?.locked ?? false) : (day.visit?.verified ?? false)
          const operator = mode === "course" ? (day.course?.locked_by || "") : (day.visit?.verified_by || "")
          const rows = (mode === "course" ? (day.course?.rows ?? []) : (day.visit?.rows ?? [])) as
            | AuditCheckCourseRow[]
            | AuditCheckVisitRow[]
          return (
            <div key={day.date} className="overflow-hidden rounded-xl bg-white shadow-[0_1px_3px_rgba(33,38,49,.06)]">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-[#f0f0f0] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-[12.5px] font-medium text-[#2b2f36]">{formatDay(day.date)}</span>
                  {day.unchecked
                    ? <span className="shrink-0 rounded-[3px] bg-[#fff7e6] px-1.5 py-0.5 text-[11px] text-[#d46b08]">未核对</span>
                    : <span className="shrink-0 rounded-[3px] bg-[#f0f5ff] px-1.5 py-0.5 text-[11px] text-[#3370ff]">已核对{operator ? ` · ${operator}` : ""}</span>}
                  {block.missing_count > 0
                    ? <span className="shrink-0 rounded-[3px] bg-[#fff1f0] px-1.5 py-0.5 text-[11px] text-[#d4380d]">缺失 {block.missing_count}</span>
                    : <span className="shrink-0 text-[11px] text-[#9aa1a9]">无缺失</span>}
                  <span className="shrink-0 text-[11px] text-[#9aa1a9]">共 {block.total} 条</span>
                </div>
                {canLock && (
                  <button
                    type="button"
                    onClick={() => void toggleLock(day)}
                    disabled={busy}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[4px] border border-[#dee0e3] bg-white px-2 text-[12px] text-[#4e535a] transition-colors hover:bg-[#f5f6f7] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {locked ? <Unlock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {locked ? "解锁" : "确认核对"}
                  </button>
                )}
              </div>

              {block.total === 0 ? (
                <div className="flex items-center gap-2 px-3 py-3 text-[12px] text-[#c0c4cc]">
                  {mode === "course" ? "当天没有活动" : "当天没有邀约记录"}
                </div>
              ) : (
                <div>
                  <table className="w-full border-collapse text-[12px]" style={{ tableLayout: "fixed" }}>
                    <colgroup>
                      {columns.map(column => <col key={column.key} style={{ width: column.width }} />)}
                    </colgroup>
                    <thead>
                      <tr className="bg-[#fafbfc] text-[11px] text-[#8f959e]">
                        {columns.map(column => (
                          <th key={column.key} className="px-2 py-1.5 text-left font-normal">{column.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mode === "course"
                        ? (rows as AuditCheckCourseRow[]).map(row => renderCourseRow(row, day.date, locked))
                        : (rows as AuditCheckVisitRow[]).map(row => renderVisitRow(row, day.date, locked))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editTarget && (
        <AuditEditDrawer
          target={editTarget}
          customers={customers}
          canEdit={() => (
            editTarget.mode === "visit"
              // 已取消也照样能改（保存时后端会自动先恢复、改完再取消回去）
              ? !editTarget.locked
              : !editTarget.locked
          )}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); void load() }}
        />
      )}
    </div>
  )
}

export default function AuditCheckPage() {
  // 两个页签共用一个页面：切换时共用的筛选（周期、空间、搜索）保留，各自的缺失项勾选单独记
  const [mode, setMode] = useState<AuditCheckMode>("course")
  return <AuditCheckView mode={mode} onModeChange={setMode} />
}
