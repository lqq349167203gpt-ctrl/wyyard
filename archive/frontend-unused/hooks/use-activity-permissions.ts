import { useState, useEffect, useCallback } from "react"
import { activityPermissionApi, type ActivityPermissions } from "@/lib/api"

export function useActivityPermissions() {
  const [permissions, setPermissions] = useState<ActivityPermissions>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    activityPermissionApi.getAll()
      .then(setPermissions)
      .catch(() => setPermissions({}))
      .finally(() => setReady(true))
  }, [])

  /** 检查客户是否有某活动类型的浏览权限 */
  const filterByView = useCallback(
    <T extends { member_type?: string }>(customers: T[], activityType: string): T[] => {
      if (Object.keys(permissions).length === 0) return customers
      return customers.filter(c => {
        const mt = c.member_type || ""
        const cfg = permissions[mt]
        if (!cfg) return true // 未配置的身份默认允许
        const act = cfg[activityType]
        if (!act) return true // 未配置的活动默认允许
        return act.view !== false
      })
    },
    [permissions]
  )

  /** 检查客户是否有某活动类型的参与权限 */
  const filterByParticipate = useCallback(
    <T extends { member_type?: string }>(customers: T[], activityType: string): T[] => {
      if (Object.keys(permissions).length === 0) return customers
      return customers.filter(c => {
        const mt = c.member_type || ""
        const cfg = permissions[mt]
        if (!cfg) return true
        const act = cfg[activityType]
        if (!act) return true
        return act.participate !== false
      })
    },
    [permissions]
  )

  return { permissions, ready, filterByView, filterByParticipate }
}
