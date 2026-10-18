import { BUSINESS_LABELS, LEARNING_CATALOG } from "./business-catalog-data"
import { durationLabel } from "./payment-types"

export const LEARNING_COURSE_TYPES: string[] = LEARNING_CATALOG.filter(item => !item.legacy).map(item => item.activity_name)
export const LEGACY_LEARNING_COURSE_TYPES: string[] = LEARNING_CATALOG.filter(item => item.legacy).map(item => item.activity_name)
export const LEARNING_ACTIVITY_OPTIONS: { value: string; label: string; groupLabel?: string }[] = LEARNING_CATALOG.map((item, index) => ({
  value: item.activity_name, label: item.activity_name,
  groupLabel: item.legacy && !LEARNING_CATALOG[index - 1]?.legacy ? BUSINESS_LABELS.legacy_learning : undefined,
}))
export const LEARNING_PAYMENT_TYPES: Record<string, {
  price: number; duration: string; desc: string; duration_type: string; duration_value: number
}> = Object.fromEntries(LEARNING_CATALOG.map(item => [item.payment_name, {
  price: item.price, duration: durationLabel(item.duration_months), desc: item.description,
  duration_type: "month", duration_value: item.duration_months,
}]))
export const LEARNING_PAYMENT_OPTIONS = LEARNING_CATALOG.map((item, index) => ({
  value: item.payment_name, label: `${item.payment_name}（${durationLabel(item.duration_months)}）`,
  groupLabel: item.legacy && !LEARNING_CATALOG[index - 1]?.legacy ? BUSINESS_LABELS.legacy_learning : undefined,
}))
