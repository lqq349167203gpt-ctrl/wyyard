import type { CustomerAccessPermissions, PositionEditPermissions } from "@/lib/api"
import { NOTE_PERMISSION_OPTIONS } from "@/lib/note-permissions"
import { PAGE_PERMISSIONS, PERMISSION_GROUPS } from "@/lib/page-registry"

export const SENSITIVE_OPTIONS = [
  { key: "visit_purpose", label: "到访目的" },
  { key: "trauma_history", label: "创伤经历" },
  { key: "current_block", label: "当下卡点" },
  { key: "work_info", label: "工作情况" },
  { key: "other_info", label: "其他信息" },
] as const

export const DETAIL_OPTIONS = [
  ...NOTE_PERMISSION_OPTIONS,
  { key: "communication", label: "沟通记录" },
  { key: "activities", label: "活动记录" },
  { key: "customer_followups", label: "回访记录" },
  { key: "card_statistics", label: "卡次统计" },
  { key: "offline_courses", label: "技能训练课程" },
] as const

// 名单按现有接口的实际使用范围整理；这里只描述用途，不参与鉴权。
export const SHARED_IMPACTS = {
  scope: ["healing-records", "class-records", "daily-activities", "offline-course-records", "custom-analysis", "service-teacher", "daily-report", "communication-records", "followup-records", "payment", "payment-deductions", "payment-refunds", "audit-check", "debt-records", "agreement-signings", "disabled-customers"],
  notes: ["healing-records", "class-records", "daily-activities", "daily-report", "service-teacher", "principal", "course-statistics", "audit-check", "custom-analysis", "debt-records"],
  sensitive: ["healing-records", "class-records", "daily-report", "custom-analysis", "service-teacher", "principal", "course-statistics", "debt-records"],
  details: ["healing-records", "class-records", "daily-report", "custom-analysis", "service-teacher", "principal", "course-statistics", "debt-records"],
  transactions: ["healing-records", "class-records", "daily-report", "custom-analysis", "service-teacher", "principal", "course-statistics", "payment", "payment-deductions", "payment-refunds", "debt-records", "agreement-signings"],
  contacts: ["healing-records", "class-records", "daily-report", "custom-analysis", "service-teacher", "principal", "course-statistics", "debt-records"],
} as const
export type SharedImpact = keyof typeof SHARED_IMPACTS

export function pageLabel(key: string): string {
  const label = PAGE_PERMISSIONS.find(page => page.key === key)?.label || key
  if (["audit-check", "debt-records", "agreement-signings"].includes(key)) return `监管 · ${label}`
  if (key === "activity-checkin") return "活动核销（小程序）"
  if (key === "chat-history") return "沟通记录（系统）"
  return label
}

export const DIRECTORY_GROUPS = PERMISSION_GROUPS

export const EDIT_OPTIONS = [
  { key: "customers", page: "healing-records", label: "客户资料编辑", description: "新增、编辑、停用、标签、跟进点及沟通记录。", options: [["view", "仅浏览"], ["all", "可编辑"]] },
  { key: "visits", page: "class-records", label: "邀约记录编辑", description: "客户、邀约人、时间及删除按创建人范围限制；取消和恢复沿用现有协作规则。", options: [["view", "仅浏览"], ["own", "仅本人录入"], ["all", "全部记录"]] },
  { key: "activities", page: "daily-activities", label: "课程内容编辑", description: "课程、老师、时间、扣卡、案主、简介及删除。", options: [["view", "仅浏览"], ["own", "仅本人录入"], ["all", "全部记录"]] },
  { key: "activity_teachers", page: "daily-activities", label: "授课老师编辑", description: "允许该课已选择的老师修改课程内容；删除仍按创建人范围限制。", options: [["view", "不允许"], ["own", "允许"]] },
  { key: "activity_participants", page: "daily-activities", label: "参与人员配置", description: "老人、新人参与名单的拖入与移除，与课程内容编辑分别控制。", options: [["view", "不可配置"], ["own", "仅本人课表"], ["all", "全部课表"]] },
  { key: "payments", page: "payment", label: "已有记录修改 / 删除", description: "控制已有付费记录；新增记录沿用现有规则。", options: [["own", "仅本人录入"], ["all", "全部记录"]] },
] as const

export const SCOPE_LABELS = { none: "不可查看", related: "与本人相关", all: "全部客户" }
export const TRANSACTION_OPTIONS = [["none", "不可查看"], ["summary", "仅汇总"], ["detail", "汇总与明细"]] as const

export function pageSearchText(key: string): string {
  const words = [pageLabel(key), ...EDIT_OPTIONS.filter(item => item.page === key).flatMap(item => [item.label, item.description])]
  const has = (kind: SharedImpact) => (SHARED_IMPACTS[kind] as readonly string[]).includes(key)
  if (has("scope")) words.push("客户范围", "引流人", "承接人", ...Object.values(SCOPE_LABELS))
  if (has("notes")) words.push(...NOTE_PERMISSION_OPTIONS.map(item => item.label))
  if (has("sensitive")) words.push(...SENSITIVE_OPTIONS.map(item => item.label))
  if (has("details")) words.push(...DETAIL_OPTIONS.map(item => item.label))
  if (has("contacts")) words.push("联系方式", "手机号", "微信号", "查看", "复制", "修改")
  if (has("transactions")) words.push("交易信息", "消费金额", "汇总", "明细")
  if (key === "principal") words.push("组织范围", "个人范围", "可选范围", "仅自己", "所有人", "俱乐部", "外部人员", "内部人员")
  if (key === "course-statistics") words.push("课程范围", "老师", "成就君")
  if (key === "offline-course-records") words.push("课程类型管理")
  if (["class-records", "daily-activities"].includes(key)) words.push("核对", "锁定", "解锁")
  return words.join(" ")
}

export function detailAllowed(access: CustomerAccessPermissions, key: typeof DETAIL_OPTIONS[number]["key"]) {
  return access.detail_tabs[key] ?? access.detail_tabs.follow_up
}

export function pageSummary(key: string, pages: string[], edit: PositionEditPermissions, system = false): string[] {
  const lines: string[] = EDIT_OPTIONS.filter(item => item.page === key).map(item => {
    const value = edit[item.key]
    // 兼容现存 activity_teachers=all，展示时不把它改写成 own。
    const label = item.key === "activity_teachers" && value === "all" ? "允许（历史配置：全部）"
      : item.options.find(option => option[0] === value)?.[1] || value
    return `${item.label}：${label}`
  })
  if (key === "class-records") lines.push(`核对与解锁：${edit.visit_lock ? "允许" : "不允许"}`)
  if (key === "daily-activities") lines.push(`核对与解锁：${edit.activity_lock ? "允许" : "不允许"}`, `小程序核销：${pages.includes("activity-checkin") || system ? "已开启" : "未开启"}`)
  if (key === "principal") {
    const views = edit.principal_views || { organization: true, person: true }
    lines.push(`可选范围：${[views.organization && "组织／俱乐部", views.person && "个人"].filter(Boolean).join("、") || "均未开启"}`)
    lines.push(`组织范围：${edit.principal_scope === "all" ? "所有组织" : "本人所属组织"}`)
    if (views.person) lines.push(`个人范围：${edit.principal_person_scope === "own" ? "仅自己" : "所有人（组织范围内）"}`)
  }
  if (key === "course-statistics") lines.push(`课程范围：${edit.course_records === "own" ? "本人为老师或成就君" : "全部课程"}`)
  if (key === "offline-course-records") lines.push(`课程类型管理：${pages.includes("offline-course-types") || system ? "允许" : "不允许"}`)
  if (key === "activity-checkin") lines.push("管理端小程序独立入口，与课表入口分别授权")
  if ((SHARED_IMPACTS.scope as readonly string[]).includes(key)) lines.push(`共用客户范围：${SCOPE_LABELS[edit.customer_access.scope]}`)
  if ((SHARED_IMPACTS.notes as readonly string[]).includes(key)) lines.push(`需求备注：${NOTE_PERMISSION_OPTIONS.filter(item => detailAllowed(edit.customer_access, item.key)).map(item => item.label).join("、") || "均不允许"}`)
  if ((SHARED_IMPACTS.transactions as readonly string[]).includes(key)) lines.push(`交易信息：${TRANSACTION_OPTIONS.find(item => item[0] === edit.customer_access.transaction_access)?.[1]}`)
  return lines.length ? lines : ["无单独配置项，沿用现有业务规则"]
}

const EDIT_LABELS: Record<string, string> = {
  ...Object.fromEntries(EDIT_OPTIONS.map(item => [item.key, item.label])),
  principal_views: "可选范围", organization: "组织／俱乐部", person: "个人", principal_person_scope: "个人范围",
  principal_scope: "组织范围", course_records: "课程范围", activity_lock: "课表核对与解锁", visit_lock: "邀约核对与解锁",
  customer_access: "共用权限", principal_external_access: "外部人员", contacts: "联系方式", phone: "手机号", wechat: "微信号",
  view: "查看", copy: "复制", edit: "修改", scope: "客户范围", relations: "关联关系", referrer: "本人为引流人", referrer_handler: "本人为承接人",
  sensitive_fields: "隐私信息", detail_tabs: "详情内容", transaction_access: "交易信息",
  ...Object.fromEntries([...SENSITIVE_OPTIONS, ...DETAIL_OPTIONS].map(item => [item.key, item.label])),
}

function valueLabel(value: unknown, path: string[]) {
  if (typeof value === "boolean") return value ? "允许" : "不允许"
  if (value === undefined) return "沿用原设置"
  const key = path.at(-1)
  if (key === "scope") return SCOPE_LABELS[value as keyof typeof SCOPE_LABELS] || String(value)
  if (key === "transaction_access") return TRANSACTION_OPTIONS.find(item => item[0] === value)?.[1] || String(value)
  if (key === "principal_person_scope") return value === "own" ? "仅自己" : "所有人"
  if (key === "principal_scope") return value === "all" ? "所有组织" : "本人所属组织"
  if (key === "course_records") return value === "all" ? "全部课程" : "与本人相关"
  if (key === "activity_teachers" && value === "all") return "允许（历史配置：全部）"
  const item = EDIT_OPTIONS.find(item => item.key === key)
  return item?.options.find(option => option[0] === value)?.[1] || String(value)
}

export function permissionChanges(savedSnapshot: string, pages: string[], edit: PositionEditPermissions): string[] {
  if (!savedSnapshot) return []
  const previous = JSON.parse(savedSnapshot) as { pages: string[]; editPermissions: PositionEditPermissions }
  const changes = [...new Set([...previous.pages, ...pages])].filter(key => previous.pages.includes(key) !== pages.includes(key))
    .map(key => `${key === "offline-course-types" ? "课程类型管理" : pageLabel(key)}：${previous.pages.includes(key) ? "已开启 → 未开启" : "未开启 → 已开启"}`)
  function walk(before: unknown, after: unknown, path: string[]) {
    if ((before && typeof before === "object") || (after && typeof after === "object")) {
      const old = (before || {}) as Record<string, unknown>
      const next = (after || {}) as Record<string, unknown>
      new Set([...Object.keys(old), ...Object.keys(next)]).forEach(key => walk(old[key], next[key], [...path, key]))
    } else if (before !== after) {
      changes.push(`${path.map(key => EDIT_LABELS[key] || key).join(" · ")}：${valueLabel(before, path)} → ${valueLabel(after, path)}`)
    }
  }
  walk(previous.editPermissions, edit, [])
  return changes
}
