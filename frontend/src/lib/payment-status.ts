type PaymentStatusItem = {
  type: string
  effective_date?: string | null
  expiry_date?: string | null
  effective_remaining?: number | null
  remaining_count?: number | null
}

export function getPaymentStatus(item: PaymentStatusItem, today: string) {
  const remaining = item.effective_remaining !== undefined
    ? item.effective_remaining : item.remaining_count
  const countProject = ["membership_card", "group_case", "emotional_release", "energy_knot", "other"].includes(item.type)
  if (countProject && remaining != null && remaining <= 0) return "已用完"
  if (item.effective_date && item.effective_date > today) return "未开始"
  if (item.expiry_date && item.expiry_date < today) return "已过期"
  if (item.effective_date || item.expiry_date) return "生效中"
  if (["tea_seat_fee", "oh_card_reading"].includes(item.type)) return "已完结"
  return ""
}
