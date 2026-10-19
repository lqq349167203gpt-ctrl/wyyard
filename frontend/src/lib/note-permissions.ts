import type { CustomerAccessPermissions, VisitNoteCategory } from "@/lib/api"

export const NOTE_PERMISSION_OPTIONS = [
  { key: "visit_need_tags", label: "来访需求 · 标签" },
  { key: "visit_need_detail", label: "来访需求 · 详情" },
  { key: "customer_info", label: "深度需求" },
  { key: "follow_up", label: "跟进点" },
  { key: "customer_feedback", label: "客户反馈" },
] as const

export function canViewNotePart(access: CustomerAccessPermissions | undefined, key: typeof NOTE_PERMISSION_OPTIONS[number]["key"]): boolean {
  if (!access) return true
  return access.detail_tabs[key] ?? access.detail_tabs.follow_up
}

export function canViewNote(access: CustomerAccessPermissions | undefined, category: VisitNoteCategory): boolean {
  return category === "visit_need"
    ? canViewNotePart(access, "visit_need_tags") || canViewNotePart(access, "visit_need_detail")
    : canViewNotePart(access, category)
}

export function canViewAnyNote(access?: CustomerAccessPermissions): boolean {
  return NOTE_PERMISSION_OPTIONS.some(item => canViewNotePart(access, item.key))
}
