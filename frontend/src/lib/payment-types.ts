import { MEMBERSHIP_CATALOG } from "./business-catalog-data"

export { OFFLINE_COURSE_TYPES, OH_READING_TYPES } from "./business-catalog-data"

export function durationLabel(months: number): string {
  return months % 12 === 0 ? `${months / 12} 年` : `${months} 个月`
}

export const MEMBERSHIP_CARD_NAMES = MEMBERSHIP_CATALOG.map(item => item.name)
export const MEMBERSHIP_CARD_DEFAULTS: Record<string, {
  price: number; defaultCount?: number; unlimited?: boolean; duration?: string
  duration_type: string; duration_value: number | null
}> = Object.fromEntries(MEMBERSHIP_CATALOG.map(item => [item.name, {
  price: item.price,
  ...(item.count === null ? {} : { defaultCount: item.count }),
  ...(item.duration_months === null ? {} : { duration: durationLabel(item.duration_months) }),
  duration_type: "month", duration_value: item.duration_months,
}]))
