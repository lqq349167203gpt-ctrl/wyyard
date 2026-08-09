import { useEffect, useState } from "react"

const PAGE_PERMISSIONS_UPDATED_EVENT = "wyyard:page-permissions-updated"

export function readStoredPagePermissions(): string[] {
  try {
    return JSON.parse(localStorage.getItem("userPermissions") || "[]")
  } catch {
    return []
  }
}

export function storePagePermissions(permissions: string[]): void {
  const previous = localStorage.getItem("userPermissions") || "[]"
  const next = JSON.stringify(permissions)
  if (previous === next) return
  localStorage.setItem("userPermissions", next)
  window.dispatchEvent(new Event(PAGE_PERMISSIONS_UPDATED_EVENT))
}

export function usePagePermissions(): string[] {
  const [permissions, setPermissions] = useState<string[]>(readStoredPagePermissions)

  useEffect(() => {
    const refresh = () => setPermissions(readStoredPagePermissions())
    window.addEventListener(PAGE_PERMISSIONS_UPDATED_EVENT, refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener(PAGE_PERMISSIONS_UPDATED_EVENT, refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  return permissions
}
