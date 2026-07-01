import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { accountApi, clearAuthState } from "@/lib/api"
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Session {
  id: string
  account_id: string
  device_info: string
  ip: string
  login_time: string
  last_active: string
}

function parseDeviceInfo(ua: string): string {
  if (!ua) return "未知设备"
  if (ua.includes("Windows")) return "Windows"
  if (ua.includes("Mac OS")) return "macOS"
  if (ua.includes("Linux")) return "Linux"
  if (ua.includes("Android")) return "Android"
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS"
  return "未知设备"
}

function formatTime(iso: string): string {
  if (!iso) return ""
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" })
  const [errors, setErrors] = useState<{ oldPassword?: string; newPassword?: string; confirmPassword?: string }>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessions, setSessions] = useState<Session[]>([])
  const [currentJti, setCurrentJti] = useState("")

  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")

  const fetchSessions = useCallback(async () => {
    try {
      const data = await accountApi.listSessions()
      setSessions(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchSessions()
    // 从 token 中解析当前 session 的 jti
    const token = localStorage.getItem("token")
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split(".")[1]))
        setCurrentJti(payload.jti || "")
      } catch { /* ignore */ }
    }
  }, [fetchSessions])

  const handleSubmit = async () => {
    const newErrors: typeof errors = {}

    if (!form.oldPassword.trim()) newErrors.oldPassword = "请输入原密码"
    if (!form.newPassword.trim()) {
      newErrors.newPassword = "请输入新密码"
    } else if (form.newPassword.length < 8) {
      newErrors.newPassword = "密码至少8位"
    } else if (!/[a-zA-Z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) {
      newErrors.newPassword = "密码必须包含字母和数字"
    }
    if (!form.confirmPassword.trim()) newErrors.confirmPassword = "请确认新密码"
    else if (form.newPassword !== form.confirmPassword) newErrors.confirmPassword = "两次密码不一致"

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    setErrors({})

    if (!currentUser.id) {
      setErrorMessage("获取用户信息失败，请重新登录")
      setShowError(true)
      return
    }

    setLoading(true)
    try {
      await accountApi.changePassword(currentUser.id, form.oldPassword, form.newPassword)
      setShowSuccess(true)
      setForm({ oldPassword: "", newPassword: "", confirmPassword: "" })
    } catch (error: any) {
      const message = error.message || "修改失败"
      if (message.includes("原密码")) {
        setErrorMessage("原密码输入错误")
      } else if (message.includes("账号不存在") || message.includes("未找到") || message.includes("404")) {
        setErrorMessage("获取用户信息失败，请重新登录")
      } else {
        setErrorMessage(message)
      }
      setShowError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await accountApi.deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    } catch { /* ignore */ }
  }

  return (
    <div className="px-6 pt-12 pb-6">
      <div className="pb-6">
        <h1 className="text-lg font-semibold">密码修改</h1>
        <p className="text-xs text-muted-foreground mt-1.5">修改当前登录账号的密码</p>
      </div>

      <div className="bg-white rounded-lg p-6 max-w-[480px]">
        <div className="space-y-6">
          <div className="flex items-start gap-3">
            <span className="text-[12px] text-[#4e535a] font-light tracking-widest w-16 shrink-0 pt-2">当前账号</span>
            <div className="flex-1">
              <div className="h-8 flex items-center text-[13px] text-[#2b2f36]">{currentUser.username}</div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-[12px] text-[#4e535a] font-light tracking-widest w-16 shrink-0 pt-2">原密码</span>
            <div className="flex-1">
              <Input
                type="password"
                value={form.oldPassword}
                onChange={(e) => setForm({ ...form, oldPassword: e.target.value })}
                placeholder="输入原密码"
                className="h-8"
              />
              {errors.oldPassword && <p className="text-[11px] text-red-500 mt-0.5">{errors.oldPassword}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-[12px] text-[#4e535a] font-light tracking-widest w-16 shrink-0 pt-2">新密码</span>
            <div className="flex-1">
              <Input
                type="password"
                value={form.newPassword}
                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                placeholder="至少8位，包含字母和数字"
                className="h-8"
              />
              {errors.newPassword && <p className="text-[11px] text-red-500 mt-0.5">{errors.newPassword}</p>}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="text-[12px] text-[#4e535a] font-light tracking-widest w-16 shrink-0 pt-2">确认密码</span>
            <div className="flex-1">
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="再次输入新密码"
                className="h-8"
              />
              {errors.confirmPassword && <p className="text-[11px] text-red-500 mt-0.5">{errors.confirmPassword}</p>}
            </div>
          </div>

        </div>

        <div className="mt-6 pt-4">
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? "提交中..." : "确认修改"}
          </Button>
        </div>
      </div>

      <AlertDialog open={showSuccess} onOpenChange={setShowSuccess}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>修改成功</AlertDialogTitle>
            <AlertDialogDescription>密码修改成功，请使用新密码登录。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowSuccess(false)
              clearAuthState()
              window.location.href = "/login"
            }}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showError} onOpenChange={setShowError}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>修改失败</AlertDialogTitle>
            <AlertDialogDescription>{errorMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowError(false)}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 在线设备 */}
      <div className="bg-white rounded-lg p-6 max-w-[480px] mt-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-medium text-[#2b2f36]">在线设备</h2>
          <span className="text-[12px] text-[#8f959e]">{sessions.length} 个设备</span>
        </div>
        {sessions.length === 0 ? (
          <p className="text-[12px] text-[#8f959e]">暂无在线设备</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const isCurrent = s.id === currentJti
              return (
                <div key={s.id} className="flex items-center justify-between py-2 border-b border-[#f0f1f3] last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-[#2b2f36]">{parseDeviceInfo(s.device_info)}</span>
                      {isCurrent && (
                        <span className="text-[10px] text-[#3370ff] bg-[#f0f4ff] px-1.5 py-0.5 rounded">当前设备</span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#8f959e] mt-0.5">
                      {s.ip || "未知 IP"} · 登录于 {formatTime(s.login_time)}
                    </div>
                  </div>
                  {!isCurrent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[12px] text-[#8f959e] hover:text-[#f53f3f] h-7 px-2"
                      onClick={() => handleDeleteSession(s.id)}
                    >
                      退出
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
