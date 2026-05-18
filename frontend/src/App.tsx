import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import { useMemo } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { TooltipProvider } from "@/components/ui/tooltip"
import LoginPage from "@/pages/login"
import DashboardPage from "@/pages/dashboard"
import CustomersPage from "@/pages/customers"
import AgentsPage from "@/pages/agents"
import ChatPage from "@/pages/chat"
import KnowledgePage from "@/pages/knowledge"
import BusinessPage from "@/pages/business"


import PositionsPage from "@/pages/positions"
import PositionManagementPage from "@/pages/position-management"
import CoursesPage from "@/pages/courses"
import SpacesPage from "@/pages/spaces"
import ClassRecordsPage from "@/pages/class-records"
import DailyActivitiesPage from "@/pages/daily-activities"
import PaymentPage from "@/pages/payment"
import GroupCaseSessionsPage from "@/pages/group-case-sessions"
import EmotionalReleaseSessionsPage from "@/pages/emotional-release-sessions"
import EnergyKnotSessionsPage from "@/pages/energy-knot-sessions"
import InternalCourseSessionsPage from "@/pages/internal-course-sessions"
import MemberIdentitiesPage from "@/pages/member-identities"
import HealingRecordsPage from "@/pages/healing-records"

import OperationLogsPage from "@/pages/operation-logs"
import SystemLogsPage from "@/pages/system-logs"
import AccountsPage from "@/pages/accounts"
import HealingIdentitiesPage from "@/pages/healing-identities"
import ArrivalFeedbackPage from "@/pages/arrival-feedback"
import ChangePasswordPage from "@/pages/change-password"

const PAYMENT_PERMISSIONS = ["membership-cards", "group-cases", "emotional-releases", "energy-knots", "internal-courses"]
const CLASS_RECORDS_PERMISSIONS = ["class-records-visitors", "class-records-activities", "class-records-arrival"]

const PATH_PERMISSIONS: Record<string, string> = {
  "/": "dashboard",
  "/customers": "customers",

  "/healing-records": "healing-records",
  "/courses/class-records": "class-records",
  "/courses/daily-activities": "daily-activities",
  "/payment": "payment",
  "/courses/group-case-sessions": "group-case-sessions",
  "/courses/emotional-release-sessions": "emotional-release-sessions",
  "/courses/energy-knot-sessions": "energy-knot-sessions",
  "/courses/internal-course-sessions": "internal-course-sessions",
  "/agents": "agents",
  "/knowledge": "knowledge",
  "/business": "business",


  "/system-logs": "system-logs",
  "/operation-logs": "operation-logs",
  "/accounts": "accounts",
  "/positions/management": "position-management",
  "/positions/courses": "courses",
  "/config/member-identities": "member-identities",
  "/courses/spaces": "spaces",
  "/healing-identities": "healing-identities",
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

  // 获取用户有权限的第一个页面
  const getFirstAllowedPath = useMemo(() => {
    // 优先返回 dashboard
    if (permissions.includes("dashboard")) return "/"
    // 否则返回第一个有权限的页面
    for (const [path, permission] of Object.entries(PATH_PERMISSIONS)) {
      const hasPerm = permission === "payment"
        ? PAYMENT_PERMISSIONS.some(p => permissions.includes(p))
        : permission === "class-records"
          ? CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))
          : permissions.includes(permission)
      if (permission !== "dashboard" && hasPerm) {
        return path
      }
    }
    // 如果没有任何权限，返回登录页
    return "/login"
  }, [permissions])

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  // 超级管理员跳过权限检查
  if (currentUser?.role !== "超级管理员") {
    const requiredPermission = PATH_PERMISSIONS[location.pathname]

    // 如果访问首页但没有 dashboard 权限，重定向到有权限的页面
    if (location.pathname === "/" && !permissions.includes("dashboard")) {
      return <Navigate to={getFirstAllowedPath} replace />
    }

    // 如果访问其他页面但没有对应权限，重定向到有权限的页面
    const hasPermission = requiredPermission === "payment"
      ? PAYMENT_PERMISSIONS.some(p => permissions.includes(p))
      : requiredPermission === "class-records"
        ? CLASS_RECORDS_PERMISSIONS.some(p => permissions.includes(p))
        : permissions.includes(requiredPermission)
    if (requiredPermission && requiredPermission !== "dashboard" && !hasPermission) {
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
              <Route path="/" element={<DashboardPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/positions/teacher" element={<PositionsPage />} />
              <Route path="/positions/management" element={<PositionManagementPage />} />
              <Route path="/positions/courses" element={<CoursesPage />} />
              <Route path="/courses/spaces" element={<SpacesPage />} />
              <Route path="/courses/class-records" element={<ClassRecordsPage />} />
              <Route path="/courses/daily-activities" element={<DailyActivitiesPage />} />
              <Route path="/payment" element={<PaymentPage />} />
              <Route path="/courses/group-case-sessions" element={<GroupCaseSessionsPage />} />
              <Route path="/courses/emotional-release-sessions" element={<EmotionalReleaseSessionsPage />} />
              <Route path="/courses/energy-knot-sessions" element={<EnergyKnotSessionsPage />} />
              <Route path="/courses/internal-course-sessions" element={<InternalCourseSessionsPage />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:id/chat" element={<ChatPage />} />
              <Route path="/knowledge" element={<KnowledgePage />} />
              <Route path="/business" element={<BusinessPage />} />


              <Route path="/config/member-identities" element={<MemberIdentitiesPage />} />
              <Route path="/healing-records" element={<HealingRecordsPage />} />

              <Route path="/system-logs" element={<SystemLogsPage />} />
              <Route path="/accounts" element={<AccountsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/healing-identities" element={<HealingIdentitiesPage />} />
              <Route path="/operation-logs" element={<OperationLogsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
