import { useEffect, useState } from "react"

import { positionPermissionApi, type PositionEditPermissions } from "@/lib/api"

const DEFAULT_PERMISSIONS: PositionEditPermissions = {
  visits: "own",
  activities: "own",
  contacts: {
    phone: { view: false, copy: false, edit: false },
    wechat: { view: false, copy: false, edit: false },
  },
  customer_access: {
    scope: "none",
    relations: { referrer: false, referrer_handler: false },
    sensitive_fields: {
      visit_purpose: false,
      trauma_history: false,
      current_block: false,
      work_info: false,
      other_info: false,
    },
    detail_tabs: {
      follow_up: false,
      communication: false,
      activities: false,
      customer_followups: false,
      card_statistics: false,
      offline_courses: false,
    },
    transaction_access: "none",
  },
}

function normalizeEditPermissions(permissions?: Partial<PositionEditPermissions>): PositionEditPermissions {
  return {
    visits: permissions?.visits === "all" ? "all" : "own",
    activities: permissions?.activities === "all" ? "all" : "own",
    contacts: {
      phone: {
        view: permissions?.contacts?.phone?.view === true,
        copy: permissions?.contacts?.phone?.copy === true,
        edit: permissions?.contacts?.phone?.edit === true,
      },
      wechat: {
        view: permissions?.contacts?.wechat?.view === true,
        copy: permissions?.contacts?.wechat?.copy === true,
        edit: permissions?.contacts?.wechat?.edit === true,
      },
    },
    customer_access: {
      scope: ["none", "related", "all"].includes(permissions?.customer_access?.scope || "")
        ? permissions!.customer_access!.scope
        : "none",
      relations: {
        referrer: permissions?.customer_access?.relations?.referrer === true,
        referrer_handler: permissions?.customer_access?.relations?.referrer_handler === true,
      },
      sensitive_fields: {
        visit_purpose: permissions?.customer_access?.sensitive_fields?.visit_purpose === true,
        trauma_history: permissions?.customer_access?.sensitive_fields?.trauma_history === true,
        current_block: permissions?.customer_access?.sensitive_fields?.current_block === true,
        work_info: permissions?.customer_access?.sensitive_fields?.work_info === true,
        other_info: permissions?.customer_access?.sensitive_fields?.other_info === true,
      },
      detail_tabs: {
        follow_up: permissions?.customer_access?.detail_tabs?.follow_up === true,
        communication: permissions?.customer_access?.detail_tabs?.communication === true,
        activities: permissions?.customer_access?.detail_tabs?.activities === true,
        customer_followups: permissions?.customer_access?.detail_tabs?.customer_followups === true,
        card_statistics: permissions?.customer_access?.detail_tabs?.card_statistics === true,
        offline_courses: permissions?.customer_access?.detail_tabs?.offline_courses === true,
      },
      transaction_access: ["none", "summary", "detail"].includes(permissions?.customer_access?.transaction_access || "")
        ? permissions!.customer_access!.transaction_access
        : "none",
    },
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
