const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  "referral-statistics": ["statistics"],
  "member-statistics": ["statistics"],
  "product-sales": ["statistics"],
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
  ],
  "payment-deductions": [
    "membership-cards",
    "group-cases",
    "emotional-releases",
    "oh-card-readings",
    "energy-knots",
    "internal-courses",
  ],
  "payment-refunds": [
    "membership-cards",
    "group-cases",
    "emotional-releases",
    "oh-card-readings",
    "energy-knots",
    "internal-courses",
  ],
}

const LEGACY_STATISTICS_PAGES = [
  "referral-statistics",
  "member-statistics",
  "product-sales",
  "daily-report",
]

export function hasPagePermission(permissions: string[], pageKey: string): boolean {
  if (permissions.includes(pageKey)) return true
  if (LEGACY_STATISTICS_PAGES.includes(pageKey) && permissions.includes("statistics")) {
    return !LEGACY_STATISTICS_PAGES.some((key) => permissions.includes(key))
  }
  return (LEGACY_PERMISSION_ALIASES[pageKey] || []).some((key) => permissions.includes(key))
}

export function normalizePagePermissions(permissions: string[]): string[] {
  const normalized = new Set(permissions)
  Object.keys(LEGACY_PERMISSION_ALIASES).forEach((pageKey) => {
    if (hasPagePermission(permissions, pageKey)) normalized.add(pageKey)
  })
  return [...normalized]
}

export function removePagePermissions(permissions: string[], pageKeys: string[]): string[] {
  const keysToRemove = new Set(pageKeys)
  pageKeys.forEach((pageKey) => {
    const aliases = LEGACY_PERMISSION_ALIASES[pageKey] || []
    aliases.filter((alias) => alias !== "statistics").forEach((alias) => keysToRemove.add(alias))
  })
  return permissions.filter((key) => !keysToRemove.has(key))
}
