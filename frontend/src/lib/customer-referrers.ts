/** 多人引流使用数组；旧记录的姓名不按标点拆分，避免误认关系。 */
export function customerReferrers(customer: { referrer?: string; referrers?: string[] }): string[] {
  return [...new Set((customer.referrers ?? [customer.referrer || ""]).map(name => name.trim()).filter(Boolean))]
}
