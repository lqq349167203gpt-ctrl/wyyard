import { useCallback, useEffect, useRef } from "react"

import { loginRecordApi } from "@/lib/api"

const HEARTBEAT_INTERVAL_MS = 30_000
const IDLE_TIMEOUT_MS = 5 * 60_000

const createUsageSessionId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useUsageTracking(pagePath: string) {
  const usageSessionIdRef = useRef("")
  const usageActiveRef = useRef(false)
  const lastActivityRef = useRef(Date.now())
  const currentPathRef = useRef(pagePath)

  const sendUsageHeartbeat = useCallback((active: boolean, keepalive = false) => {
    if (!localStorage.getItem("authToken")) return Promise.resolve()
    if (active && !usageSessionIdRef.current) {
      usageSessionIdRef.current = createUsageSessionId()
    }
    if (!usageSessionIdRef.current) return Promise.resolve()
    const request = loginRecordApi.heartbeat({
      client_session_id: usageSessionIdRef.current,
      page_path: currentPathRef.current,
      active,
    }, keepalive).catch(() => undefined)
    usageActiveRef.current = active
    if (!active) usageSessionIdRef.current = ""
    return request
  }, [])

  useEffect(() => {
    currentPathRef.current = pagePath
    if (usageActiveRef.current) sendUsageHeartbeat(true)
  }, [pagePath, sendUsageHeartbeat])

  useEffect(() => {
    const isEligible = () => (
      document.visibilityState === "visible"
      && document.hasFocus()
      && Date.now() - lastActivityRef.current < IDLE_TIMEOUT_MS
    )
    const syncUsageState = () => {
      if (isEligible()) {
        sendUsageHeartbeat(true)
      } else if (usageActiveRef.current) {
        sendUsageHeartbeat(false)
      }
    }
    const markActivity = () => {
      lastActivityRef.current = Date.now()
      if (!usageActiveRef.current && document.visibilityState === "visible" && document.hasFocus()) {
        sendUsageHeartbeat(true)
      }
    }
    const stopForUnload = () => {
      if (usageActiveRef.current) sendUsageHeartbeat(false, true)
    }

    const activityEvents: Array<keyof WindowEventMap> = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"]
    activityEvents.forEach(event => window.addEventListener(event, markActivity, { passive: true }))
    window.addEventListener("focus", syncUsageState)
    window.addEventListener("blur", syncUsageState)
    window.addEventListener("beforeunload", stopForUnload)
    document.addEventListener("visibilitychange", syncUsageState)
    syncUsageState()
    const timer = window.setInterval(syncUsageState, HEARTBEAT_INTERVAL_MS)

    return () => {
      window.clearInterval(timer)
      activityEvents.forEach(event => window.removeEventListener(event, markActivity))
      window.removeEventListener("focus", syncUsageState)
      window.removeEventListener("blur", syncUsageState)
      window.removeEventListener("beforeunload", stopForUnload)
      document.removeEventListener("visibilitychange", syncUsageState)
      if (usageActiveRef.current) sendUsageHeartbeat(false, true)
    }
  }, [sendUsageHeartbeat])

  return {
    stopUsageTracking: useCallback(() => {
      if (!usageActiveRef.current) return Promise.resolve()
      return sendUsageHeartbeat(false)
    }, [sendUsageHeartbeat]),
  }
}
