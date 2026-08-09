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
import ExpensesPage from "@/pages/expenses"
import MemberIdentitiesPage from "@/pages/member-identities"
import HealingRecordsPage from "@/pages/healing-records"
import CustomerFormPage from "@/pages/healing-records/customer-form"

import OperationLogsPage from "@/pages/operation-logs"
import SystemLogsPage from "@/pages/system-logs"
import HealingIdentitiesPage from "@/pages/healing-identities"
import ArrivalFeedbackPage from "@/pages/arrival-feedback"
import ChangePasswordPage from "@/pages/change-password"
import DisabledCustomersPage from "@/pages/disabled-customers"
import RemindersPage from "@/pages/reminders"
import BusinessRemindersPage from "@/pages/business-reminders"
import ChatHistoryPage from "@/pages/chat-history"
import StatisticsPage from "@/pages/statistics"
import ProductSalesPage from "@/pages/product-sales"
import DailyReportPage from "@/pages/daily-report"
import MemberStatisticsPage from "@/pages/member-statistics"
import CourseStatisticsPage from "@/pages/course-statistics"
import ReferralStatisticsPage from "@/pages/referral-statistics"
import CommunicationRecordsPage from "@/pages/communication-records"
import FollowupRecordsPage from "@/pages/followup-records"
import OfflineCourseRecordsPage from "@/pages/offline-course-records"
import DebtRecordsPage from "@/pages/debt-records"
import CustomerTagsPage from "@/pages/customer-tags"
import { hasPagePermission } from "@/lib/page-permissions"
import { usePagePermissions } from "@/hooks/use-page-permissions"

const PATH_PERMISSIONS: Record<string, string> = {



  "/healing-records": "healing-records",
  "/healing-records/new": "healing-records",
  "/healing-records/:id/edit": "healing-records",
  "/courses/class-records": "class-records",
  "/courses/daily-activities": "daily-activities",
  "/payment": "payment",
  "/payment-deductions": "payment-deductions",
  "/payment-refunds": "payment-refunds",
  "/expenses": "expenses",
  "/agents": "agents",



  "/system-logs": "system-logs",
  "/operation-logs": "operation-logs",
  "/positions/management": "position-management",
  // 旧“活动配置”地址现已跳转到组织信息，权限也按目标页面校验
  "/positions/courses": "organizations",
  "/config/member-identities": "member-identities",
  "/config/customer-tags": "customer-tags",
  "/courses/spaces": "spaces",
  "/organizations": "organizations",
  "/healing-identities": "healing-identities",
  "/config/reminders": "reminders",
  "/business-reminders": "business-reminders",
  "/referral-statistics": "referral-statistics",
  "/chat-history": "chat-history",
  "/statistics": "statistics",
  "/product-sales": "product-sales",
  "/member-statistics": "member-statistics",
  "/course-statistics": "course-statistics",
  "/communication-records": "communication-records",
  "/followup-records": "followup-records",
  "/offline-course-records": "offline-course-records",
  "/debt-records": "debt-records",
  "/daily-report": "daily-report",
  "/positions/teacher": "position-management",
  "/agents/:id/chat": "agents",
  "/change-password": "change-password",
  "/disabled-customers": "disabled-customers",
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

  const permissions = usePagePermissions()

  const getFirstAllowedPath = useMemo(() => {
    for (const [path, permission] of Object.entries(PATH_PERMISSIONS)) {
      if (path.includes(":")) continue // 跳过动态路由模式
      if (hasPagePermission(permissions, permission)) return path
    }
    return "/login"
  }, [permissions])

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />
  }

  // 首页未配置业务内容，统一跳转到当前账号第一个有权限的页面
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
    if (requiredPermission && !hasPagePermission(permissions, requiredPermission)) {
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
              <Route path="/expenses" element={<ExpensesPage />} />
              <Route path="/other-projects" element={<Navigate to="/payment" replace />} />
              <Route path="/agents" element={<AgentsPage />} />
              <Route path="/agents/:id/chat" element={<ChatPage />} />



              <Route path="/config/member-identities" element={<MemberIdentitiesPage />} />
              <Route path="/config/customer-tags" element={<CustomerTagsPage />} />
              <Route path="/healing-records" element={<HealingRecordsPage />} />
              <Route path="/healing-records/new" element={<CustomerFormPage />} />
              <Route path="/healing-records/:id/edit" element={<CustomerFormPage />} />

              <Route path="/system-logs" element={<SystemLogsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/disabled-customers" element={<DisabledCustomersPage />} />
              <Route path="/healing-identities" element={<HealingIdentitiesPage />} />
              <Route path="/operation-logs" element={<OperationLogsPage />} />
              <Route path="/config/reminders" element={<RemindersPage />} />
              <Route path="/business-reminders" element={<BusinessRemindersPage />} />
              <Route path="/referral-statistics" element={<ReferralStatisticsPage />} />
              <Route path="/chat-history" element={<ChatHistoryPage />} />
              <Route path="/statistics" element={<StatisticsPage />} />
              <Route path="/product-sales" element={<ProductSalesPage />} />
              <Route path="/member-statistics" element={<MemberStatisticsPage />} />
              <Route path="/course-statistics" element={<CourseStatisticsPage />} />
              <Route path="/communication-records" element={<CommunicationRecordsPage />} />
              <Route path="/followup-records" element={<FollowupRecordsPage />} />
              <Route path="/offline-course-records" element={<OfflineCourseRecordsPage />} />
              <Route path="/debt-records" element={<DebtRecordsPage />} />
              <Route path="/daily-report" element={<DailyReportPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
