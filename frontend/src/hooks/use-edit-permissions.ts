import { useEffect, useState } from "react"

import { positionPermissionApi, type PositionEditPermissions } from "@/lib/api"

const DEFAULT_PERMISSIONS: PositionEditPermissions = {
  visits: "own",
  activities: "own",
}

function normalizeEditPermissions(permissions?: Partial<PositionEditPermissions>): PositionEditPermissions {
  return {
    visits: permissions?.visits === "all" ? "all" : "own",
    activities: permissions?.activities === "all" ? "all" : "own",
  }
}

export function storeEditPermissions(permissions?: Partial<PositionEditPermissions>) {
  const normalized = normalizeEditPermissions(permissions)
  localStorage.setItem("userEditPermissions", JSON.stringify(normalized))
  window.dispatchEvent(new CustomEvent("edit-permissions-changed", { detail: normalized }))
  return normalized
}

function readStoredEditPermissions(): PositionEditPermissions {
  try {
    return normalizeEditPermissions(JSON.parse(localStorage.getItem("userEditPermissions") || "{}"))
  } catch {
    return DEFAULT_PERMISSIONS
  }
}

export function useEditPermissions() {
  const [permissions, setPermissions] = useState<PositionEditPermissions>(readStoredEditPermissions)

  useEffect(() => {
    const updateFromEvent = (event: Event) => {
      const detail = (event as CustomEvent<PositionEditPermissions>).detail
      setPermissions(detail || readStoredEditPermissions())
    }
    window.addEventListener("edit-permissions-changed", updateFromEvent)

    let cancelled = false
    const user = JSON.parse(localStorage.getItem("currentUser") || "{}")
    if (user.role) {
      positionPermissionApi.get(user.role)
        .then((result) => {
          if (!cancelled) setPermissions(storeEditPermissions(result.edit_permissions))
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      window.removeEventListener("edit-permissions-changed", updateFromEvent)
    }
  }, [])

  return permissions
}
