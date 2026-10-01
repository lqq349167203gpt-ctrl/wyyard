import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom"
import { lazy, useMemo } from "react"
import { AppLayout } from "@/components/layout/app-layout"
import { ConfirmHost } from "@/components/confirm-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RouteContent } from "@/components/route-content"
import LoginPage from "@/pages/login"
import { PAGE_LOADERS, PATH_PERMISSIONS } from "@/lib/page-registry"


const AgentsPage = lazy(PAGE_LOADERS["/agents"])
const ChatPage = lazy(() => import("@/pages/chat"))




const PositionsPage = lazy(() => import("@/pages/positions"))
const PositionManagementPage = lazy(PAGE_LOADERS["/positions/management"])
const SpacesPage = lazy(PAGE_LOADERS["/courses/spaces"])
const OrganizationsPage = lazy(PAGE_LOADERS["/organizations"])
const ClassRecordsPage = lazy(PAGE_LOADERS["/courses/class-records"])
const DailyActivitiesPage = lazy(PAGE_LOADERS["/courses/daily-activities"])
const PaymentPage = lazy(PAGE_LOADERS["/payment"])
const PaymentDeductionsPage = lazy(PAGE_LOADERS["/payment-deductions"])
const PaymentRefundsPage = lazy(PAGE_LOADERS["/payment-refunds"])
const MemberIdentitiesPage = lazy(PAGE_LOADERS["/config/member-identities"])
const HealingRecordsPage = lazy(PAGE_LOADERS["/healing-records"])
const CustomerFormPage = lazy(() => import("@/pages/healing-records/customer-form"))

const OperationLogsPage = lazy(PAGE_LOADERS["/operation-logs"])
const SystemLogsPage = lazy(PAGE_LOADERS["/system-logs"])
const LoginRecordsPage = lazy(PAGE_LOADERS["/login-records"])
const HealingIdentitiesPage = lazy(PAGE_LOADERS["/healing-identities"])
const ArrivalFeedbackPage = lazy(() => import("@/pages/arrival-feedback"))
const ChangePasswordPage = lazy(PAGE_LOADERS["/change-password"])
const DisabledCustomersPage = lazy(PAGE_LOADERS["/disabled-customers"])
const ChatHistoryPage = lazy(PAGE_LOADERS["/chat-history"])
const ServiceTeachersPage = lazy(PAGE_LOADERS["/service-teachers"])
const DailyReportPage = lazy(PAGE_LOADERS["/daily-report"])
const SupervisionPage = lazy(PAGE_LOADERS["/supervision"])
const CourseStatisticsPage = lazy(PAGE_LOADERS["/course-statistics"])
const PrincipalPage = lazy(PAGE_LOADERS["/principal"])
const CommunicationRecordsPage = lazy(PAGE_LOADERS["/communication-records"])
const FollowupRecordsPage = lazy(PAGE_LOADERS["/followup-records"])
const OfflineCourseRecordsPage = lazy(PAGE_LOADERS["/offline-course-records"])
const CustomerTagsPage = lazy(PAGE_LOADERS["/config/customer-tags"])
const UpsellConfigPage = lazy(PAGE_LOADERS["/config/upsell"])
const CustomAnalysisPage = lazy(PAGE_LOADERS["/custom-analysis"])
const AnalysisLogsPage = lazy(PAGE_LOADERS["/analysis-logs"])
import { hasPagePermission } from "@/lib/page-permissions"
import { usePagePermissions } from "@/hooks/use-page-permissions"



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
        <ConfirmHost />
        <RouteContent><Routes>
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
              <Route path="/custom-analysis" element={<CustomAnalysisPage />} />
              <Route path="/analysis-logs" element={<AnalysisLogsPage />} />
              <Route path="/config/customer-tags" element={<CustomerTagsPage />} />
              <Route path="/config/upsell" element={<UpsellConfigPage />} />
              <Route path="/healing-records" element={<HealingRecordsPage />} />
              <Route path="/healing-records/new" element={<CustomerFormPage />} />
              <Route path="/healing-records/:id/edit" element={<CustomerFormPage />} />

              <Route path="/system-logs" element={<SystemLogsPage />} />
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/disabled-customers" element={<DisabledCustomersPage />} />
              <Route path="/healing-identities" element={<HealingIdentitiesPage />} />
              <Route path="/operation-logs" element={<OperationLogsPage />} />
              <Route path="/login-records" element={<LoginRecordsPage />} />
              <Route path="/config/reminders" element={<Navigate to="/custom-analysis" replace />} />
              <Route path="/business-reminders" element={<Navigate to="/custom-analysis" replace />} />
              {/* 旧「会员情况」「服务数据」页面已下线，保留地址跳转到对应承接页面 */}
              <Route path="/member-statistics" element={<Navigate to="/custom-analysis" replace />} />
              <Route path="/statistics" element={<Navigate to="/course-statistics" replace />} />
              <Route path="/chat-history" element={<ChatHistoryPage />} />
              <Route path="/service-teachers" element={<ServiceTeachersPage />} />
              <Route path="/course-statistics" element={<CourseStatisticsPage />} />
              <Route path="/supervision" element={<SupervisionPage />} />
              <Route path="/audit-check" element={<Navigate to="/supervision?tab=audit" replace />} />
              <Route path="/agreement-signings" element={<Navigate to="/supervision?tab=agreement" replace />} />
              <Route path="/audit-check/course" element={<Navigate to="/supervision?tab=audit" replace />} />
              <Route path="/audit-check/visit" element={<Navigate to="/supervision?tab=audit" replace />} />
              <Route path="/principal" element={<PrincipalPage />} />
              <Route path="/communication-records" element={<CommunicationRecordsPage />} />
              <Route path="/followup-records" element={<FollowupRecordsPage />} />
              <Route path="/offline-course-records" element={<OfflineCourseRecordsPage />} />
              <Route path="/debt-records" element={<Navigate to="/supervision?tab=debt" replace />} />
              <Route path="/daily-report" element={<DailyReportPage />} />
            </Route>
            <Route path="/tea-guest/*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes></RouteContent>
      </BrowserRouter>
    </TooltipProvider>
  )
}

export default App
