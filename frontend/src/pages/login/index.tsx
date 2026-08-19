import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { accountApi } from "@/lib/api"
import { User, Lock, AlertCircle } from "lucide-react"
import { storePagePermissions } from "@/hooks/use-page-permissions"

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState(() => localStorage.getItem("rememberedUsername") || "")
  const [password, setPassword] = useState("")
  const [rememberAccount, setRememberAccount] = useState(() => !!localStorage.getItem("rememberedUsername"))
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const usernameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    usernameRef.current?.focus()
  }, [])

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setError("请输入账号和密码")
      return
    }

    setLoading(true)
    setError("")

    try {
      const result = await accountApi.login(username, password)
      // 写入加固：只有真正拿到 token 才写入登录态，避免无 token 也标记已登录的边缘情况
      if (result.success && result.token) {
        const permissions = result.permissions || []
        if (permissions.length === 0 && result.account?.role !== "超级管理员") {
          setError("当前账号未配置系统权限")
          setLoading(false)
          return
        }
        localStorage.setItem("isLoggedIn", "true")
        localStorage.setItem("authToken", result.token)
        localStorage.setItem("currentUser", JSON.stringify(result.account))
        storePagePermissions(permissions)
        localStorage.setItem("userCustomerPermissions", JSON.stringify(result.customer_permissions || []))
        localStorage.setItem("userCustomerPermissionsClassRecords", JSON.stringify(result.customer_permissions_class_records || []))
        localStorage.setItem("userCustomerPermissionsPayment", JSON.stringify(result.customer_permissions_payment || []))
        if (rememberAccount) {
          localStorage.setItem("rememberedUsername", username)
        } else {
          localStorage.removeItem("rememberedUsername")
        }
        navigate("/")
      } else if (result.success) {
        // 接口返回成功但缺少 token，视为登录失败，不写入任何登录态
        setError(result.message || "登录失败，请重试")
      } else {
        setError(result.message || "账号或密码错误")
      }
    } catch {
      setError("登录失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* 左侧表单区 */}
      <div className="w-full lg:w-[65%] bg-white flex flex-col p-8 lg:p-12 xl:p-16">
        <div className="flex items-center gap-2 -ml-8 -mt-8">
          <div className="w-5 h-5 rounded-md bg-[#4370F7] flex items-center justify-center">
            <span className="text-[10px] font-semibold text-white leading-none font-sans">W</span>
          </div>
          <span className="text-sm font-medium text-[#1f2329]">无忧茶院数据平台</span>
        </div>

        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-[460px] bg-white rounded-2xl border border-[#e5e6eb] shadow-[0_8px_40px_rgba(0,0,0,0.06)] px-8 pt-20 pb-[108px]">
            <div className="max-w-[360px] mx-auto">
              <h2 className="text-3xl font-semibold text-[#1f2329] mb-2">欢迎登录</h2>
              <p className="text-sm text-[#8f959e] mb-8">使用账号密码登录系统</p>

              <div className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f959e] pointer-events-none" />
                <Input
                  ref={usernameRef}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="请输入账号"
                  className="h-11 pl-10 rounded-lg border-[#e5e6eb] text-[13px] focus-visible:ring-1 focus-visible:ring-[#5a80ff] focus-visible:border-[#5a80ff]"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8f959e] pointer-events-none" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  className="h-11 pl-10 rounded-lg border-[#e5e6eb] text-[13px] focus-visible:ring-1 focus-visible:ring-[#5a80ff] focus-visible:border-[#5a80ff]"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberAccount}
                  onChange={(e) => setRememberAccount(e.target.checked)}
                  className="w-4 h-4 rounded border-[1px] border-[#e5e6eb] appearance-none outline-none checked:bg-[#4370F7] checked:border-[#4370F7] checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2020%2020%22%20fill%3D%22%23fff%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20d%3D%22M16.707%205.293a1%201%200%20010%201.414l-8%208a1%201%200%2001-1.414%200l-4-4a1%201%200%20011.414-1.414L8%2012.586l7.293-7.293a1%201%200%20011.414%200z%22%20clip-rule%3D%22evenodd%22%2F%3E%3C%2Fsvg%3E')] focus:ring-1 focus:ring-[#5a80ff] cursor-pointer"
                />
                <span className="text-xs text-[#8f959e]">记住账号</span>
              </label>

              {error && (
                <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 px-3 py-2 rounded-md">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                className="w-full h-11 text-sm bg-[#4370F7] hover:bg-[#3a60e0] text-white rounded-lg mt-4 border border-[#e5e6eb]"
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? "登录中..." : "登 录"}
              </Button>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* 右侧装饰区 */}
      <div className="hidden lg:flex lg:w-[35%] bg-[#f0f4f8] items-center justify-center relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-40"
          style={{ backgroundImage: "url('/login-decoration.png')" }}
        />
      </div>
    </div>
  )
}
