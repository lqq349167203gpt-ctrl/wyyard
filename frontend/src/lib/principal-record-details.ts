import type { CustomerDetail } from "./api"

export type PrincipalRecordType = "invited" | "cancelled" | "arrived" | "activity"

/** 明细与列表共用统计区间，活动只展示后端实际计入次数的课程。 */
export function principalRecordRows(detail: CustomerDetail, type: PrincipalRecordType, from: string | null, to: string | null, activityKeys?: string[]): Array<Record<string, unknown>> {
  const permissions = detail.customer.customer_access_permissions
  if (permissions && !permissions.detail_tabs[type === "activity" ? "activities" : "follow_up"]) {
    throw new Error(type === "activity" ? "没有查看活动记录的权限" : "没有查看跟进点的权限")
  }
  const inPeriod = (date: string) => !!date && (!from || date >= from) && (!to || date <= to)
  if (type === "activity") {
    if (!activityKeys) throw new Error("缺少活动统计明细，请刷新页面后重试")
    const keys = new Set(activityKeys)
    return (detail.activities ?? []).filter(item => inPeriod(item.date) && keys.has(item.activity_key)).map(item => ({
      date: item.date, type: item.type, name: item.name, teacher: item.host || "-", role: item.role || "-",
    }))
  }
  return (detail.visit_records ?? [])
    .filter(record => inPeriod(record.visit_date) && (type === "cancelled" ? record.cancelled : !record.cancelled && (type !== "arrived" || record.arrived)))
    .map(record => ({
      date: record.visit_date, referrer: record.referrer_handler || "-", needs: record.needs || "-",
      arrived: record.arrived, cancelled: record.cancelled,
    }))
}
