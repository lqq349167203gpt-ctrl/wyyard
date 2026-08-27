// [已废弃] 原“用户信息权限”按会员身份过滤客户的 Hook。
// 替代方案：仅通过角色的页面权限控制页面访问，不再按会员身份限制用户数据。
import { useState, useEffect } from "react"
import { positionCustomerPermissionApi } from "@/lib/api"

const KEY_MAP: Record<string, string> = {
  customers: "userCustomerPermissions",
  class_records: "userCustomerPermissionsClassRecords",
  payment: "userCustomerPermissionsPayment",
}

export function useCustomerPermissions(section: string) {
  const [permissions, setPermissions] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
    if (user.role === "超级管理员") {
      setPermissions([])
      setReady(true)
      return
    }
    positionCustomerPermissionApi.getAll(section)
      .then((all) => {
        const perms = all[user.role] || []
        setPermissions(perms)
        const key = KEY_MAP[section]
        if (key) localStorage.setItem(key, JSON.stringify(perms))
        setReady(true)
      })
      .catch(() => {
        const key = KEY_MAP[section]
        setPermissions(JSON.parse(localStorage.getItem(key) || "[]"))
        setReady(true)
      })
  }, [section])

  return { permissions, ready }
}
