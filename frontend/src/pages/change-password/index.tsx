import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { accountApi } from "@/lib/api"
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ oldPassword: "", newPassword: "", confirmPassword: "" })
  const [errors, setErrors] = useState<{ oldPassword?: string; newPassword?: string; confirmPassword?: string }>({})
  const [showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [loading, setLoading] = useState(false)

  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}")
  console.log("currentUser:", currentUser)

  const handleSubmit = async () => {
    const newErrors: typeof errors = {}

    if (!form.oldPassword.trim()) newErrors.oldPassword = "请输入原密码"
    if (!form.newPassword.trim()) newErrors.newPassword = "请输入新密码"
    if (form.newPassword.length < 6) newErrors.newPassword = "密码至少6位"
    if (!form.confirmPassword.trim()) newErrors.confirmPassword = "请确认新密码"
    if (form.newPassword !== form.confirmPassword) newErrors.confirmPassword = "两次密码不一致"

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
                placeholder="输入新密码（至少6位）"
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
            <AlertDialogAction onClick={() => setShowSuccess(false)}>确定</AlertDialogAction>
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
    </div>
  )
}
