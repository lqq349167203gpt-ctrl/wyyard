import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import { useMemo } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { TooltipProvider } from "@/components/ui/tooltip"
import LoginPage from "@/pages/login"


import AgentsPage from "@/pages/agents"
import ChatPage from "@/pages/chat"




import PositionsPage from "@/pages/positions"
import PositionManagementPage from "@/pages/position-management"
import SpacesPage from "@/pages/spaces"
import OrganizationsPage from "@/pages/organizations"
import ClassRecordsPage from "@/pages/class-records"
import DailyActivitiesPage from "@/pages/daily-activities"
import PaymentPage from "@/pages/payment"
import PaymentDeductionsPage from "@/pages/payment-deductions"
import PaymentRefundsPage from "@/pages/payment-refunds"
import MemberIdentitiesPage from "@/pages/member-identities"
import HealingRecordsPage from "@/pages/healing-records"
import CustomerFormPage from "@/pages/healing-records/customer-form"

import OperationLogsPage from "@/pages/operation-logs"
import SystemLogsPage from "@/pages/system-logs"
import HealingIdentitiesPage from "@/pages/healing-identities"
import ArrivalFeedbackPage from "@/pages/arrival-feedback"
import ChangePasswordPage from "@/pages/change-password"
import RemindersPage from "@/pages/reminders"
import BusinessRemindersPage from "@/pages/business-reminders"
import DataRecordsPage from "@/pages/data-records"
import ChatHistoryPage from "@/pages/chat-history"

const PAYMENT_PERMISSIONS = ["membership-cards", "group-cases", "emotional-releases", "oh-card-readings", "energy-knots", "internal-courses"]
const CLASS_RECORDS_PERMISSIONS = ["class-records-visitors", "class-records-activities", "class-records-arrival"]

const PATH_PERMISSIONS: Record<string, string> = {



  "/healing-records": "healing-records",
  "/healing-records/new": "healing-records",
  "/healing-records/:id/edit": "healing-records",
  "/courses/class-records": "class-records",
  "/courses/daily-activities": "class-records-activities",
  "/payment": "payment",
  "/payment-deductions": "payment",
  "/payment-refunds": "payment",
  "/agents": "agents",



  "/system-logs": "system-logs",
  "/operation-logs": "operation-logs",
  "/positions/management": "position-management",
  "/positions/courses": "courses",
  "/config/member-identities": "member-identities",
  "/courses/spaces": "spaces",
  "/organizations": "organizations",
  "/healing-identities": "healing-identities",
  "/config/reminders": "reminders",
  "/business-reminders": "business-reminders",
  "/data-records": "data-records",
  "/chat-history": "chat-history",
  "/positions/teacher": "position-management",
  "/agents/:id/chat": "agents",
  "/change-password": "change-password",
}

function ProtectedRoute() {
  const isLoggedIn = localStorage.getItem("isLoggedIn") === "true"
  const location = useLocation()

  const currentUser = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("currentUser") || "{}")
    } catch {
      return {}
    }
  }, [])

  const permissions = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("userPermissions") || "[]")
    } catch {
      return []
    }
  }, [])

  const getFirstAllowedPath = useMemo(() => {
    for (const [path, permission] of Object.entries(PATH_PERMISSIONS)) {
      if (path.includes(":")) continue // 跳过动态路由模式
      const hasPerm = permission === "payment"
        ? PAYMENT_PERMISSIONS.some(p => permissions.includes(p))
        : permission === "class-records"
          ? CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))
          : permissions.includes(permission)
      if (hasPerm) return path
    }
    return "/login"
  }, [permissions])

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  // 首页已移除，统一重定向
  if (location.pathname === "/") {
    return <Navigate to={getFirstAllowedPath} replace />
  }

  if (currentUser?.role !== "超级管理员") {
    const requiredPermission = (() => {
    const exact = PATH_PERMISSIONS[location.pathname]
    if (exact) return exact
    // 动态路由匹配：遍历 PATH_PERMISSIONS 中含 :segment 的 key
    for (const [pattern, perm] of Object.entries(PATH_PERMISSIONS)) {
      if (!pattern.includes(":")) continue
      const patternParts = pattern.split("/")
      const pathParts = location.pathname.split("/")
      if (patternParts.length !== pathParts.length) continue
      const match = patternParts.every((seg, i) => seg.startsWith(":") || seg === pathParts[i])
      if (match) return perm
    }
    return undefined
  })()
    const hasPermission = requiredPermission === "payment"
      ? PAYMENT_PERMISSIONS.some(p => permissions.includes(p))
      : requiredPermission === "class-records"
        ? CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))
        : permissions.includes(requiredPermission)
    if (requiredPermission && !hasPermission) {
      return <Navigate to={getFirstAllowedPath} replace />
    }
  }

  return <Outlet />
}

function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/arrival-feedback/:visitId" element={<ArrivalFeedbackPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>

              <Route path="/" element={<></>} />
              <Route path="/positions/teacher" element={<PositionsPage />} />
              <Route path="/positions/management" element={<PositionManagementPage />} />
              <Route path="/positions/courses" element={<Navigate to="/organizations" replace />} />
              <Route path="/organizations" element={<OrganizationsPage />} />
              <Route path="/courses/spaces" element={<SpacesPage />} />
              <Route path="/courses/class-records" element={<ClassRecordsPage />} />
              <Route path="/courses/daily-activities" element={<DailyActivitiesPage />} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/payment-deductions" element={<PaymentDeductionsPage />} />
              <Route path="/payment-refunds" element={<PaymentRefundsPage />} />
              <Route path="/other-projects" element={<Navigate to="/payment" replace />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:id/chat" element={<ChatPage />} />



              <Route path="/config/member-identities" element={<MemberIdentitiesPage />} />
              <Route path="/healing-records" element={<HealingRecordsPage />} />
              <Route path="/healing-records/new" element={<CustomerFormPage />} />
              <Route path="/healing-records/:id/edit" element={<CustomerFormPage />} />

              <Route path="/system-logs" element={<SystemLogsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/healing-identities" element={<HealingIdentitiesPage />} />
              <Route path="/operation-logs" element={<OperationLogsPage />} />
              <Route path="/config/reminders" element={<RemindersPage />} />
              <Route path="/business-reminders" element={<BusinessRemindersPage />} />
              <Route path="/data-records" element={<DataRecordsPage />} />
              <Route path="/chat-history" element={<ChatHistoryPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
