import { useEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { usePagePermissions } from "@/hooks/use-page-permissions"
import { hasPagePermission } from "@/lib/page-permissions"

type SystemKey = "main" | "tea-guest"

const MAIN_LAST_PATH_KEY = "wyyard:last-main-system-path"
const TEA_GUEST_LAST_PATH_KEY = "wyyard:last-tea-guest-path"

interface SystemSwitcherProps {
  currentSystem: SystemKey
}

export function SystemSwitcher({ currentSystem }: SystemSwitcherProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const permissions = usePagePermissions()
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  let role = ""
  try {
    role = JSON.parse(localStorage.getItem("currentUser") || "{}").role || ""
  } catch {}
  const canOpenTeaGuest = role === "超级管理员"
    || hasPagePermission(permissions, "tea-guest-consumption-records")
    || hasPagePermission(permissions, "tea-guest-expenses")

  useEffect(() => {
    if (currentSystem === "main" && !location.pathname.startsWith("/tea-guest/")) {
      localStorage.setItem(MAIN_LAST_PATH_KEY, location.pathname)
    }
    if (currentSystem === "tea-guest") {
      localStorage.setItem(TEA_GUEST_LAST_PATH_KEY, location.pathname)
    }
  }, [currentSystem, location.pathname])

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", closeOnOutsideClick)
    return () => document.removeEventListener("mousedown", closeOnOutsideClick)
  }, [open])

  const switchSystem = (nextSystem: SystemKey) => {
    setOpen(false)
    if (nextSystem === currentSystem) return
    if (nextSystem === "tea-guest") {
      const lastPath = localStorage.getItem(TEA_GUEST_LAST_PATH_KEY) || ""
      navigate(lastPath.startsWith("/tea-guest/") ? lastPath : "/tea-guest/consumption-records")
      return
    }
    const lastPath = localStorage.getItem(MAIN_LAST_PATH_KEY) || ""
    navigate(lastPath && !lastPath.startsWith("/tea-guest/") ? lastPath : "/")
  }

  const currentLabel = currentSystem === "main" ? "无忧茶苑管理系统" : "茶客业务"

  if (currentSystem === "main" && !canOpenTeaGuest) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex h-7 items-center px-1 text-[12px] text-[#8f959e] transition-colors hover:text-[#4e535a]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>{currentLabel}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-8 z-50 w-[210px] rounded-[4px] border border-[#e1e4e7] bg-white p-1 shadow-[0_8px_24px_rgba(33,38,49,.12)]" role="menu">
          <button
            type="button"
            onClick={() => switchSystem("main")}
            className="flex h-9 w-full items-center justify-between rounded-[4px] px-3 text-left text-[13px] text-[#2b2f36] hover:bg-[#f5f6f7]"
            role="menuitem"
          >
            <span>无忧茶苑管理系统</span>
            {currentSystem === "main" && <Check className="h-3.5 w-3.5 text-[#3370ff]" />}
          </button>
          {canOpenTeaGuest && (
            <button
              type="button"
              onClick={() => switchSystem("tea-guest")}
              className="flex h-9 w-full items-center justify-between rounded-[4px] px-3 text-left text-[13px] text-[#2b2f36] hover:bg-[#f5f6f7]"
              role="menuitem"
            >
              <span>茶客业务</span>
              {currentSystem === "tea-guest" && <Check className="h-3.5 w-3.5 text-[#3370ff]" />}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
