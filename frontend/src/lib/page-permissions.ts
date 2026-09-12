const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  "course-statistics": ["statistics"],
  "daily-report": ["statistics"],
  "class-records": ["class-records-visitors", "class-records-activities", "class-records-arrival"],
  "daily-activities": ["class-records-activities"],
  payment: [
    "membership-cards",
    "group-cases",
    "emotional-releases",
    "oh-card-readings",
    "energy-knots",
    "internal-courses",
    "tea-seat-fees",
    "offline-courses",
    "other-projects",
  ],
  "payment-deductions": [
    "membership-cards",
    "group-cases",
    "emotional-releases",
    "energy-knots",
    "internal-courses",
    "other-projects",
  ],
  "payment-refunds": [
    "membership-cards",
    "group-cases",
    "emotional-releases",
    "oh-card-readings",
    "energy-knots",
    "internal-courses",
    "tea-seat-fees",
    "other-projects",
  ],
}

// 「服务数据」页面已下线，其权限 key 只作为课程记录/每日报表的历史别名保留：
// 读取时继续放行旧角色，编辑保存时展开为具体页面权限并移除该 key，避免旧权限无法取消。
const RETIRED_PAGE_KEYS = ["statistics"]

export function hasPagePermission(permissions: string[], pageKey: string): boolean {
  if (permissions.includes(pageKey)) return true
  return (LEGACY_PERMISSION_ALIASES[pageKey] || []).some((key) => permissions.includes(key))
}

export function normalizePagePermissions(permissions: string[]): string[] {
  const normalized = new Set(permissions.filter((key) => !RETIRED_PAGE_KEYS.includes(key)))
  Object.keys(LEGACY_PERMISSION_ALIASES).forEach((pageKey) => {
    if (hasPagePermission(permissions, pageKey)) normalized.add(pageKey)
  })
  return [...normalized]
}

export function removePagePermissions(permissions: string[], pageKeys: string[]): string[] {
  const keysToRemove = new Set(pageKeys)
  pageKeys.forEach((pageKey) => {
    // 取消聚合页面（如「付费项目」）时同时移除其包含的子项权限；
    // 历史别名 key 也一并清理，避免取消后仍被别名重新放行。
    ;(LEGACY_PERMISSION_ALIASES[pageKey] || []).forEach((alias) => keysToRemove.add(alias))
  })
  return permissions.filter((key) => !keysToRemove.has(key))
}
